import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DateTime } from 'luxon';
import { execFile } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { DataSource, Repository } from 'typeorm';
import { bt, langOf } from './bot.i18n';
import { config } from './config';
import { randomName } from './crypto.util';
import { Kv, MediaJob, Page, Post, User } from './entities';
import { Aspect, DashScope, MediaError, PixVerse } from './media.providers';
import { PostsService } from './posts.service';
import { brandColors, imagePrompt, refsForScene } from './visual';
import { TelegramApi } from './telegram.api';

const runFile = promisify(execFile);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Providers in the order they are tried; the first that works wins. */
const IMAGE_MODELS = ['qwen-image-2.0', 'wan2.7-image'];
const VIDEO_MODELS: [string, '480P' | '720P'][] = [['wan2.2-i2v-flash', '480P'], ['wan2.6-i2v-flash', '720P']];
const MAX_ATTEMPTS = 3;
const STALE_MS = 20 * 60_000;

type Step = MediaJob['steps'][number];

/**
 * The generator container's loop: takes queued media jobs one by one, draws the scene (with the page's
 * character), animates it for Reels, puts the quote on top and hands the post over to approval.
 * When every provider fails the post still goes out, as a quote card, so the schedule never stalls.
 */
@Injectable()
export class GeneratorService {
  private readonly log = new Logger(GeneratorService.name);
  private stopped = false;

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @InjectRepository(MediaJob) private readonly jobs: Repository<MediaJob>,
    @InjectRepository(Post) private readonly posts: Repository<Post>,
    @InjectRepository(Page) private readonly pages: Repository<Page>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Kv) private readonly kv: Repository<Kv>,
    private readonly postsService: PostsService,
    private readonly dashscope: DashScope,
    private readonly pixverse: PixVerse,
    private readonly tg: TelegramApi,
  ) {}

  stop() {
    this.stopped = true;
  }

  async run() {
    this.log.log(`generator up: dashscope ${this.dashscope.ready ? 'on' : 'off'}, pixverse accounts ${this.pixverse.accounts().join(', ') || 'none'}`);
    await this.checkPixverseLogins();
    let lastHousekeeping = Date.now();
    while (!this.stopped) {
      try {
        if (Date.now() - lastHousekeeping > 60_000) {
          lastHousekeeping = Date.now();
          await this.housekeeping();
        }
        await this.recoverStale();
        const job = await this.claim();
        if (!job) {
          await sleep(5_000);
          continue;
        }
        await this.handle(job);
      } catch (e) {
        this.log.error(e);
        await sleep(10_000);
      }
    }
  }

  // ---------- queue ----------

  /** SKIP LOCKED: safe even if a second generator is ever started. */
  private async claim(): Promise<MediaJob | null> {
    const res = await this.db.query(`
      UPDATE media_jobs SET status = 'running', "startedAt" = now(), attempts = attempts + 1
      WHERE id = (SELECT id FROM media_jobs WHERE status = 'queued' ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1)
      RETURNING id`);
    const id = (Array.isArray(res[0]) ? res[0] : res)[0]?.id; // pg driver: [rows, count] for UPDATE … RETURNING
    return id ? this.jobs.findOneBy({ id }) : null;
  }

  /** A job left 'running' by a crash or restart goes back to the queue. */
  private async recoverStale() {
    await this.db.query(`UPDATE media_jobs SET status = 'queued' WHERE status = 'running' AND "startedAt" < $1`, [new Date(Date.now() - STALE_MS)]);
  }

  private async handle(job: MediaJob) {
    const post = await this.posts.findOneBy({ id: job.postId });
    if (!post || post.status !== 'generating') { // rejected or deleted while waiting
      await this.jobs.update(job.id, { status: 'done', finishedAt: new Date(), error: 'post no longer waits for media' });
      return;
    }
    const page = await this.pages.findOneByOrFail({ id: post.pageId! });
    const steps: Step[] = [...job.steps];
    try {
      await this.make(post, page, steps);
      await this.jobs.update(job.id, { status: 'done', steps, error: null, finishedAt: new Date() });
    } catch (e) {
      const msg = (e as Error).message;
      this.log.warn(`job ${job.id} (post ${post.id}) attempt ${job.attempts}: ${msg}`);
      if (job.attempts < MAX_ATTEMPTS && !(e instanceof MediaError && e.kind === 'quota')) {
        await this.jobs.update(job.id, { status: 'queued', steps, error: msg });
        await sleep(15_000);
        return;
      }
      await this.jobs.update(job.id, { status: 'failed', steps, error: msg, finishedAt: new Date() });
      await this.fallbackToCard(post, page, msg);
    }
  }

  // ---------- pipeline ----------

  private async make(post: Post, page: Page, steps: Step[]) {
    const render = { ...post.render };
    const scene = render.scene ?? post.quote ?? '';
    const picked = refsForScene(page.character, scene);
    const refs = picked.map((r) => join(config.mediaDir, r.file));
    const aspect: Aspect = post.kind === 'VIDEO' ? '9:16' : '4:5';
    const prompt = imagePrompt(page.character, scene, picked, brandColors(page.style));

    if (!render.aiImage) {
      const img = await this.firstThatWorks('image', steps, [
        ...IMAGE_MODELS.map((m) => ({ name: `dashscope:${m}`, run: () => this.dashscope.image(m, prompt, refs, aspect), skip: !this.dashscope.ready })),
        ...this.pixverse.accounts().map((acc) => ({ name: `pixverse:${acc}:image`, run: () => this.pixverse.image(acc, prompt, refs, aspect) })),
      ]);
      render.aiImage = randomName('jpg');
      await sharp(img).rotate().jpeg({ quality: 92 }).toFile(join(config.mediaDir, render.aiImage));
      await this.posts.update(post.id, { render }); // a retry won't draw the picture again
    }

    // Reels: the clip costs credits, so the still is approved first (unless the page approves everything itself)
    if (post.kind === 'VIDEO' && !render.frameOk && !page.autoApprove) {
      await this.postsService.askFrame(post.id);
      return;
    }

    if (post.kind === 'VIDEO' && !render.aiVideo) {
      const motion = `${render.motion ?? 'Slow cinematic push-in, gentle natural motion.'} Keep the main subject consistent.`;
      const image = join(config.mediaDir, render.aiImage);
      let clip: Buffer;
      try {
        clip = await this.firstThatWorks('video', steps, [
          ...this.pixverse.accounts().map((acc) => ({ name: `pixverse:${acc}`, run: () => this.pixverse.imageToVideo(acc, image, motion) })),
          ...VIDEO_MODELS.map(([m, res]) => ({ name: `dashscope:${m}`, run: () => this.dashscope.imageToVideo(m, image, motion, res), skip: !this.dashscope.ready })),
        ]);
      } catch (e) {
        // no AI video today: the AI picture with a slow zoom is still better than a plain card
        this.log.warn(`post ${post.id}: no clip (${(e as Error).message}), animating the still`);
        clip = await this.stillToClip(image);
      }
      render.aiVideo = randomName('mp4');
      await writeFile(join(config.mediaDir, render.aiVideo), clip);
      await this.posts.update(post.id, { render });
    }

    post.render = render;
    await this.postsService.renderMedia(post, page);
    await this.postsService.releaseGenerated(post.id);
  }

  /**
   * Tries providers in order. Out-of-quota ones are skipped for the rest of the day (and the admin hears
   * about it once); an expired PixVerse login sends the admin a fresh login link.
   */
  private async firstThatWorks(step: Step['step'], steps: Step[], providers: { name: string; run: () => Promise<Buffer>; skip?: boolean }[]) {
    let last: unknown = new MediaError(`no ${step} provider configured`, 'other');
    for (const p of providers) {
      if (p.skip || await this.isExhausted(p.name)) continue;
      const started = Date.now();
      try {
        const out = await p.run();
        steps.push({ step, provider: p.name, ok: true, ms: Date.now() - started, ...(this.pixverse.lastCost != null && p.name.startsWith('pixverse') && { credits: this.pixverse.lastCost }) });
        return out;
      } catch (e) {
        last = e;
        const msg = (e as Error).message;
        steps.push({ step, provider: p.name, ok: false, ms: Date.now() - started, error: msg.slice(0, 300) });
        this.log.warn(`${p.name}: ${msg}`);
        if (e instanceof MediaError && e.kind === 'quota') await this.markExhausted(p.name);
        if (e instanceof MediaError && e.kind === 'auth') await this.askLogin(p.name.split(':')[1]);
      }
    }
    throw last;
  }

  /** Free PixVerse credits come back every day; Alibaba's free quota doesn't, so it is re-checked once a day. */
  private today = () => DateTime.now().setZone('Asia/Yerevan').toISODate()!;

  private async isExhausted(provider: string) {
    return (await this.kv.findOneBy({ key: `gen:empty:${provider}` }))?.value === this.today();
  }

  private async markExhausted(provider: string) {
    await this.kv.save({ key: `gen:empty:${provider}`, value: this.today() });
    await this.notifyAdmins(`gen:notified:${provider}:${this.today()}`, (l) => bt(l, 'gen.quota', { provider }));
  }

  /** Ken Burns on the AI picture: 6 s, 1080×1920. */
  private async stillToClip(image: string): Promise<Buffer> {
    const out = join(config.mediaDir, `.${randomName('mp4')}`);
    const frames = 180;
    await runFile('ffmpeg', [
      '-y', '-loglevel', 'error', '-loop', '1', '-i', image,
      '-vf', `scale=1620:2880:force_original_aspect_ratio=increase,crop=1620:2880,zoompan=z='1+0.08*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=30,format=yuv420p`,
      '-t', '6', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', out,
    ], { timeout: 300_000 });
    try {
      return await readFile(out);
    } finally {
      await rm(out, { force: true });
    }
  }

  private async fallbackToCard(post: Post, page: Page, reason: string) {
    try {
      post.render = { ...post.render, aiImage: undefined, aiVideo: undefined, fallback: true };
      await this.posts.update(post.id, { render: post.render });
      await this.postsService.renderMedia(post, page);
      await this.postsService.releaseGenerated(post.id);
      await this.notifyAdmins(`gen:notified:fallback:${this.today()}`, (l) => bt(l, 'gen.fallback', { id: `${page.title} #${post.num ?? post.id}`, m: reason.slice(0, 300) }));
    } catch (e) {
      this.log.error(`fallback for post ${post.id}: ${(e as Error).message}`);
    }
  }

  // ---------- PixVerse logins ----------

  /** Checks every account's login (shown on the admin screen); ones that aren't logged in get a login link. */
  private async checkPixverseLogins() {
    for (const acc of this.pixverse.accounts()) {
      const loggedIn = await this.pixverse.loggedIn(acc);
      await this.kv.save({ key: `gen:pxv:${acc}`, value: { loggedIn, at: Date.now() } });
      if (!loggedIn) await this.askLogin(acc);
    }
  }

  /** Login requests from the admin screen; login status refreshed every 6 hours. */
  private async housekeeping() {
    for (const acc of this.pixverse.accounts()) {
      const key = `gen:login-request:${acc}`;
      if (await this.kv.findOneBy({ key })) {
        await this.kv.delete({ key });
        await this.askLogin(acc, true);
      }
    }
    const last = await this.kv.findOneBy({ key: 'gen:pxv-checked' });
    if (!last || Date.now() - Number(last.value) > 6 * 3600_000) {
      await this.kv.save({ key: 'gen:pxv-checked', value: Date.now() });
      for (const acc of this.pixverse.accounts())
        await this.kv.save({ key: `gen:pxv:${acc}`, value: { loggedIn: await this.pixverse.loggedIn(acc), at: Date.now() } });
    }
  }

  /** At most one link per account per 6 hours (the link itself is valid for 10 minutes). */
  async askLogin(acc: string, force = false) {
    const key = `gen:login:${acc}`;
    const last = await this.kv.findOneBy({ key });
    if (!force && last && Date.now() - Number(last.value) < 6 * 3600_000) return;
    await this.kv.save({ key, value: Date.now() });
    try {
      const url = await this.pixverse.startLogin(acc, async () => {
        await this.kv.save({ key: `gen:pxv:${acc}`, value: { loggedIn: await this.pixverse.loggedIn(acc), at: Date.now() } });
      });
      this.log.log(`login link for ${acc} sent`);
      await this.notifyAdmins(null, (l) => bt(l, 'gen.login', { acc }), (l) => [[{ text: bt(l, 'gen.loginBtn'), url }]]);
    } catch (e) {
      this.log.warn(`login ${acc}: ${(e as Error).message}`);
    }
  }

  /** `onceKey`: send only if this key wasn't used yet (e.g. once a day per provider). */
  private async notifyAdmins(onceKey: string | null, text: (l: ReturnType<typeof langOf>) => string, keyboard?: (l: ReturnType<typeof langOf>) => any) {
    if (onceKey) {
      if (await this.kv.findOneBy({ key: onceKey })) return;
      await this.kv.save({ key: onceKey, value: Date.now() });
    }
    for (const a of await this.users.findBy({ role: 'admin' })) {
      if (!a.telegramId) continue;
      const l = langOf(a);
      await this.tg.send(Number(a.telegramId), text(l), keyboard?.(l)).catch((e) => this.log.warn(e.message));
    }
  }
}
