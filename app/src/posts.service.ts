import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { DateTime } from 'luxon';
import { DataSource, In, IsNull, LessThan, MoreThan, Not, Repository } from 'typeorm';
import { config, mediaUrl } from './config';
import { MediaJob, Page, PageStat, Post, PostStatus, User } from './entities';
import { GeminiError, GeminiService } from './gemini.service';
import { InstagramService } from './instagram.service';
import { pickTheme, RenderService } from './render.service';
import { formatSlot, nextFreeSlot } from './slots';
import { bt, Lang, langOf } from './bot.i18n';
import { Keyboard, TelegramApi } from './telegram.api';

const UNIQUE_VIOLATION = '23505';
const hashQuote = (q: string) => createHash('sha1').update(q.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')).digest('hex');
const short = (s: string | null, lang: Lang, n = 60) => ((s ?? '').replace(/\s+/g, ' ').trim() || bt(lang, 'noText')).slice(0, n);

@Injectable()
export class PostsService {
  private readonly log = new Logger(PostsService.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @InjectRepository(Post) private readonly posts: Repository<Post>,
    @InjectRepository(Page) private readonly pages: Repository<Page>,
    @InjectRepository(PageStat) private readonly pageStats: Repository<PageStat>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(MediaJob) private readonly jobs: Repository<MediaJob>,
    private readonly ig: InstagramService,
    private readonly gemini: GeminiService,
    private readonly render: RenderService,
    private readonly tg: TelegramApi,
  ) {}

  /** Telegram chat and language of the page owner (null if they signed in with Google only and never linked Telegram). */
  async chatOf(page: Page): Promise<{ chat: number; lang: Lang } | null> {
    const owner = await this.users.findOneBy({ id: page.ownerId });
    return owner?.telegramId ? { chat: Number(owner.telegramId), lang: langOf(owner) } : null;
  }

  private async notify(page: Page, text: (lang: Lang) => string) {
    const to = await this.chatOf(page);
    if (to) await this.tg.send(to.chat, text(to.lang)).catch((e) => this.log.warn(e.message));
  }

  /** All active pages (scheduler) or the active pages of one owner. */
  activePages(ownerId?: number) {
    return this.pages.find({ where: { active: true, ...(ownerId && { ownerId }) }, order: { id: 'ASC' } });
  }

  findPage(slugOrId: string, ownerId: number) {
    return this.pages.findOne({ where: /^\d+$/.test(slugOrId) ? { id: +slugOrId, ownerId } : { slug: slugOrId, ownerId } });
  }

  /** The post and its page, if the page belongs to `ownerId`; 404 otherwise. */
  async ownedPost(ownerId: number, postId: number) {
    const post = await this.posts.findOneBy({ id: postId });
    const page = post?.pageId ? await this.pages.findOneBy({ id: post.pageId, ownerId }) : null;
    if (!post || !page) throw new NotFoundException('Пост не найден');
    return { post, page };
  }

  listPosts(ownerId: number, f: { pageId?: number; status?: PostStatus[]; from?: Date; to?: Date }) {
    const q = this.posts.createQueryBuilder('p').innerJoin(Page, 'pg', 'pg.id = p."pageId"')
      .where('pg."ownerId" = :ownerId', { ownerId });
    if (f.pageId) q.andWhere('p."pageId" = :pageId', { pageId: f.pageId });
    if (f.status?.length) q.andWhere('p.status IN (:...status)', { status: f.status });
    if (f.from) q.andWhere('COALESCE(p."publishedAt", p."scheduledFor", p."createdAt") >= :from', { from: f.from });
    if (f.to) q.andWhere('COALESCE(p."publishedAt", p."scheduledFor", p."createdAt") < :to', { to: f.to });
    return q.orderBy('COALESCE(p."scheduledFor", p."createdAt")', 'ASC').limit(500).getMany();
  }

  // ---------- generation ----------

  /** Generate one AI post for the page and send it for approval (or schedule it if the page auto-approves). */
  /** A post the user asked for (bot /gen, website, "another version"): if it fails, tell them in Telegram. */
  async generateForUser(page: Page, hint?: string, language?: string): Promise<Post | null> {
    try {
      return await this.generate(page, hint, language);
    } catch (e) {
      this.log.warn(`generate ${page.slug}: ${(e as Error).message}`);
      const busy = e instanceof GeminiError && e.busy;
      await this.notify(page, (l) => bt(l, busy ? 'aiBusy' : 'aiFailed', { m: (e as Error).message }));
      return null;
    }
  }

  async generate(page: Page, hint?: string, language?: string): Promise<Post> {
    const lang = language && language !== page.language ? language : undefined;
    const recent = await this.posts.find({
      where: { pageId: page.id, quote: Not(IsNull()) }, order: { id: 'DESC' }, take: 40, select: ['quote'],
    });
    for (let attempt = 0; ; attempt++) {
      const g = await this.gemini.generate(page, recent.map((p) => p.quote!), hint, lang);
      const kind = Math.random() < page.reelsRatio ? 'VIDEO' : 'IMAGE';
      const theme = pickTheme(page.style, Math.floor(Math.random() * 1000));
      const ai = page.style.media === 'ai';
      const pure = ai && page.style.text === false; // no quote on the media: it opens the caption instead
      const post = this.posts.create({
        pageId: page.id, num: await this.nextNum(page.id), kind, source: 'ai', status: ai ? 'generating' : 'awaiting_approval', quote: g.quote,
        caption: `${pure ? `${g.quote}\n\n` : ''}${g.caption}\n\n${g.hashtags.map((t) => `#${t}`).join(' ')}`.slice(0, 2200),
        contentHash: hashQuote(g.quote), render: { theme, ...(lang && { lang }), ...(ai && { scene: g.scene, motion: g.motion }) },
      });
      try {
        await this.posts.insert(post);
      } catch (e: any) {
        if (e.code === UNIQUE_VIOLATION && attempt < 2) continue; // repeated quote: ask again
        throw e;
      }
      if (ai) { // the generator container makes the picture / clip and then calls releaseGenerated()
        await this.jobs.insert({ postId: post.id });
        return post;
      }
      try {
        await this.renderMedia(post, page);
      } catch (e) {
        await this.posts.delete(post.id);
        throw e;
      }
      if (page.autoApprove) return this.approve(post.id);
      await this.sendPreview(post, page);
      return post;
    }
  }

  /** The quote on top of the AI picture / clip when there is one, otherwise the quote card. */
  async renderMedia(post: Post, page: Page) {
    const old = post.mediaFile;
    const { theme, aiImage, aiVideo } = post.render;
    const text = page.style.text === false ? null : post.quote; // AI media can go out without the quote on it
    post.mediaFile = post.kind === 'VIDEO'
      ? aiVideo ? await this.render.overlayVideo(aiVideo, text, page.style, theme!) : await this.render.quoteReel(post.quote!, page.style, theme!)
      : aiImage ? await this.render.overlayImage(aiImage, text, page.style, theme!) : await this.render.quoteImage(post.quote!, page.style, theme!);
    await this.posts.update(post.id, { mediaFile: post.mediaFile });
    if (old) await this.removeFile(old);
  }

  async sendPreview(post: Post, page: Page) {
    const to = await this.chatOf(page);
    if (!to) return; // approval happens on the website
    const { chat, lang } = to;
    const text = `${page.title} · ${post.kind === 'VIDEO' ? '🎬 Reels' : bt(lang, 'preview.post')} #${post.num ?? post.id}\n\n«${post.quote ?? ''}»\n\n${post.caption}`;
    const msg = await this.tg.sendMedia(chat, post.kind, mediaUrl(post.mediaFile!), text, [
      [{ text: bt(lang, 'btn.approve'), callback_data: `ap:${post.id}` }, { text: bt(lang, 'btn.other'), callback_data: `rg:${post.id}` }],
      [{ text: bt(lang, 'btn.edit'), callback_data: `ed:${post.id}` }, { text: '❌', callback_data: `rj:${post.id}` }],
    ]);
    await this.posts.update(post.id, { tgMessageId: String(msg.message_id) });
  }

  /** Keep `bufferDays` worth of posts generated ahead; at most one new post per page per call. */
  async ensureBuffers() {
    for (const page of await this.activePages()) {
      if (!page.aiEnabled) continue;
      const pending = await this.posts.count({
        where: [
          { pageId: page.id, status: 'awaiting_approval' },
          { pageId: page.id, status: 'generating' },
          { pageId: page.id, status: 'frame_approval' },
          { pageId: page.id, status: 'approved', scheduledFor: MoreThan(new Date()) },
        ],
      });
      if (pending >= page.bufferDays * page.slots.length) continue;
      try {
        await this.generate(page);
      } catch (e) {
        this.log.warn(`generate ${page.slug}: ${(e as Error).message}`);
      }
    }
  }

  // ---------- approval ----------

  /** Put the post into the page's next free slot. */
  async approve(postId: number): Promise<Post> {
    for (let attempt = 0; ; attempt++) {
      const post = await this.posts.findOneByOrFail({ id: postId });
      if (post.status === 'approved' || post.status === 'published' || post.status === 'publishing') return post;
      // an old Telegram preview must not bring a thrown-away post (whose file is already deleted) back
      if (post.status === 'rejected') throw new BadRequestException('Этот пост уже выброшен');
      const page = await this.pages.findOneByOrFail({ id: post.pageId! });
      const taken = await this.posts.find({
        where: { pageId: page.id, status: In(['approved', 'publishing', 'published']), scheduledFor: MoreThan(new Date()) },
        select: ['scheduledFor'],
      });
      const at = nextFreeSlot(page.slots, page.timezone, taken.map((p) => p.scheduledFor!), new Date(Date.now() + 60_000));
      try {
        await this.posts.update(post.id, { status: 'approved', scheduledFor: at, error: null });
      } catch (e: any) {
        if (e.code === UNIQUE_VIOLATION && attempt < 5) continue; // slot taken concurrently
        throw e;
      }
      return { ...post, status: 'approved', scheduledFor: at };
    }
  }

  /** A decision made on the website: take the buttons off the Telegram preview so it can't be pressed again. */
  async closePreview(post: Post, page: Page, note: (lang: Lang) => string) {
    const to = post.tgMessageId ? await this.chatOf(page) : null;
    if (to) await this.tg.clearKeyboard(to.chat, post.tgMessageId!, note(to.lang));
  }

  /** Throw the post away and make another one for the same page. */
  async regenerate(postId: number) {
    const post = await this.reject(postId);
    return this.generateForUser(await this.pages.findOneByOrFail({ id: post.pageId! }), undefined, post.render?.lang);
  }

  /** Move a queued post to another free time (any future minute; one post per page per time). */
  async reschedule(postId: number, at: Date) {
    if (!(at.getTime() > Date.now() + 60_000)) throw new BadRequestException('Выберите время в будущем');
    try {
      const r = await this.posts.update({ id: postId, status: 'approved' }, { scheduledFor: at });
      if (!r.affected) throw new BadRequestException('Переносить можно только пост из очереди');
    } catch (e: any) {
      if (e.code === UNIQUE_VIOLATION) throw new BadRequestException('На это время уже стоит другой пост');
      throw e;
    }
  }

  async reject(postId: number) {
    const post = await this.posts.findOneByOrFail({ id: postId });
    if (post.status === 'published' || post.status === 'publishing') return post;
    await this.posts.update(post.id, { status: 'rejected', scheduledFor: null, mediaFile: null });
    await this.removeFiles(post);
    return post;
  }

  async editQuote(postId: number, quote: string, preview = true) {
    const post = await this.posts.findOneByOrFail({ id: postId });
    const page = await this.pages.findOneByOrFail({ id: post.pageId! });
    post.quote = quote.trim();
    await this.posts.update(post.id, { quote: post.quote, contentHash: null });
    await this.renderMedia(post, page);
    if (preview) await this.sendPreview(post, page);
  }

  /** Hand-uploaded media goes straight to the queue of the chosen page. */
  async addUpload(pageId: number | null, kind: Post['kind'], mediaFile: string, caption: string) {
    const r = await this.posts.insert({ pageId, kind, source: 'upload', status: 'draft', mediaFile, caption: caption.slice(0, 2200) });
    return this.posts.findOneByOrFail({ id: r.identifiers[0].id });
  }

  async assignPage(postId: number, pageId: number) {
    await this.posts.update({ id: postId, status: 'draft' }, { pageId, num: await this.nextNum(pageId) });
    return this.approve(postId);
  }

  async publishNow(page: Page) {
    const next = await this.posts.findOne({ where: { pageId: page.id, status: 'approved' }, order: { scheduledFor: 'ASC' } });
    if (!next) return null;
    await this.posts.update(next.id, { scheduledFor: new Date() });
    return next;
  }

  async deleteQueued(page: Page, n: number) {
    const list = await this.upcoming(page);
    const post = list[n - 1];
    if (!post) return null;
    await this.reject(post.id);
    return post;
  }

  upcoming(page: Page) {
    return this.posts.find({ where: { pageId: page.id, status: 'approved' }, order: { scheduledFor: 'ASC' } });
  }

  // ---------- publishing ----------

  /** Claim due posts one by one; SKIP LOCKED makes a post impossible to publish twice. */
  async publishDue() {
    for (;;) {
      const rows: Post[] = await this.db.query(`
        UPDATE posts SET status = 'publishing', "publishingAt" = now(), attempts = attempts + 1
        WHERE id = (SELECT id FROM posts WHERE status = 'approved' AND "scheduledFor" <= now()
                    ORDER BY "scheduledFor" LIMIT 1 FOR UPDATE SKIP LOCKED)
        RETURNING id`);
      const claimed = Array.isArray(rows[0]) ? rows[0][0] : rows[0];
      if (!claimed) return;
      await this.publishOne(claimed.id);
    }
  }

  private async publishOne(id: number) {
    const post = await this.posts.findOneByOrFail({ id });
    const page = await this.pages.findOneByOrFail({ id: post.pageId! });
    try {
      if (!post.mediaFile) throw new Error('нет файла поста');
      const acc = await this.ig.account(page.igAccountId);
      const r = await this.ig.publish(acc, post.kind, mediaUrl(post.mediaFile!), post.caption);
      await this.posts.update(id, { status: 'published', publishedAt: new Date(), igMediaId: r.mediaId, permalink: r.permalink, error: null, mediaFile: null });
      await this.removeFiles(post);
      const left = await this.posts.count({ where: { pageId: page.id, status: 'approved' } });
      await this.notify(page, (l) => bt(l, 'published', { title: page.title, link: r.permalink ? `\n${r.permalink}` : '', left }));
    } catch (e) {
      const msg = (e as Error).message;
      this.log.warn(`publish #${id}: ${msg}`);
      if (post.attempts < 2) {
        await this.posts.update(id, { status: 'draft', error: msg }); // approve() needs a non-approved status
        const again = await this.approve(id);
        await this.notify(page, (l) => bt(l, 'failRetry', { title: page.title, q: short(post.quote ?? post.caption, l), m: msg, at: formatSlot(again.scheduledFor!, page.timezone, l) }));
      } else {
        await this.posts.update(id, { status: 'failed', error: msg });
        await this.notify(page, (l) => bt(l, 'failDrop', { title: page.title, q: short(post.quote ?? post.caption, l), m: msg }));
      }
    }
  }

  /** A crash mid-publish leaves a post in 'publishing'; don't retry blindly: it may already be live. */
  async recoverStuck() {
    const stuck = await this.posts.find({ where: { status: 'publishing', publishingAt: LessThan(new Date(Date.now() - 20 * 60_000)) } });
    for (const p of stuck) {
      await this.posts.update(p.id, { status: 'failed', error: 'interrupted while publishing' });
      const page = await this.pages.findOneByOrFail({ id: p.pageId! });
      await this.notify(page, (l) => bt(l, 'stuck', { id: p.num ?? p.id }));
    }
  }

  /** The post's own media plus the raw AI picture / clip under it. */
  async removeFiles(post: Post) {
    for (const f of [post.mediaFile, post.render?.aiImage, post.render?.aiVideo]) if (f) await this.removeFile(f);
  }

  /** The generator is done with the post (or gave up and made a quote card): it goes to approval like any other. */
  async releaseGenerated(postId: number) {
    const r = await this.posts.update({ id: postId, status: 'generating' }, { status: 'awaiting_approval' });
    if (!r.affected) return; // rejected or deleted meanwhile
    const post = await this.posts.findOneByOrFail({ id: postId });
    const page = await this.pages.findOneByOrFail({ id: post.pageId! });
    if (post.render.frameOk) { // the still was approved already: the finished Reels goes straight to the queue
      const queued = await this.approve(postId);
      const to = await this.chatOf(page);
      if (to) await this.tg.sendMedia(to.chat, 'VIDEO', mediaUrl(post.mediaFile!),
        bt(to.lang, 'reelQueued', { title: page.title, n: post.num ?? post.id, at: formatSlot(queued.scheduledFor!, page.timezone, to.lang) }),
        [[{ text: bt(to.lang, 'btn.remove'), callback_data: `rj:${post.id}` }]]).catch((e) => this.log.warn(e.message));
      return;
    }
    if (page.autoApprove) return this.approve(postId);
    await this.sendPreview(post, page);
  }

  /** AI Reels: the generator drew the still; the user decides before credits go into the clip. */
  async askFrame(postId: number) {
    const r = await this.posts.update({ id: postId, status: 'generating' }, { status: 'frame_approval' });
    if (!r.affected) return;
    const post = await this.posts.findOneByOrFail({ id: postId });
    const page = await this.pages.findOneByOrFail({ id: post.pageId! });
    const to = await this.chatOf(page);
    if (!to) return; // decided on the website
    const msg = await this.tg.sendMedia(to.chat, 'IMAGE', mediaUrl(post.render.aiImage!),
      bt(to.lang, 'framePreview', { title: page.title, n: post.num ?? post.id, quote: post.quote ?? '' }), [
        [{ text: bt(to.lang, 'btn.animate'), callback_data: `fv:${post.id}` }, { text: bt(to.lang, 'btn.newFrame'), callback_data: `fn:${post.id}` }],
        [{ text: '❌', callback_data: `rj:${post.id}` }],
      ]);
    await this.posts.update(post.id, { tgMessageId: String(msg.message_id) });
  }

  /** Still approved: queue the clip. */
  async approveFrame(postId: number) {
    const post = await this.posts.findOneByOrFail({ id: postId });
    if (post.status !== 'frame_approval') throw new BadRequestException('Этот пост уже обработан');
    await this.posts.update({ id: postId, status: 'frame_approval' }, { status: 'generating', render: { ...post.render, frameOk: true } });
    await this.jobs.insert({ postId });
  }

  /** Still rejected: a different scene for the same quote, then a new still. */
  async newFrame(postId: number) {
    const post = await this.posts.findOneByOrFail({ id: postId });
    if (post.status !== 'frame_approval') throw new BadRequestException('Этот пост уже обработан');
    const page = await this.pages.findOneByOrFail({ id: post.pageId! });
    const { scene, motion } = await this.gemini.scene(page, post.quote ?? '', post.render.scene);
    if (post.render.aiImage) await this.removeFile(post.render.aiImage);
    await this.posts.update({ id: postId, status: 'frame_approval' },
      { status: 'generating', render: { ...post.render, scene, motion, aiImage: undefined } });
    await this.jobs.insert({ postId });
  }

  private async nextNum(pageId: number) {
    const [{ n }] = await this.db.query(`SELECT COALESCE(MAX(num), 0) + 1 AS n FROM posts WHERE "pageId" = $1`, [pageId]);
    return Number(n);
  }

  private removeFile(file: string) {
    return rm(join(config.mediaDir, file), { force: true }).catch(() => undefined);
  }

  // ---------- stats ----------

  async collectStats() {
    const day = DateTime.now().toISODate()!;
    for (const page of await this.activePages()) {
      const acc = await this.ig.account(page.igAccountId);
      try {
        const p = await this.ig.profile(acc);
        await this.pageStats.upsert({ pageId: page.id, day, followers: p.followers_count, mediaCount: p.media_count }, ['pageId', 'day']);
      } catch (e) {
        this.log.warn(`profile ${page.slug}: ${(e as Error).message}`);
      }
      const recent = await this.posts.find({
        where: { pageId: page.id, status: 'published', publishedAt: MoreThan(new Date(Date.now() - 14 * 86400_000)) },
      });
      for (const post of recent) {
        try {
          await this.posts.update(post.id, { stats: await this.ig.mediaInsights(acc, post.igMediaId!), statsAt: new Date() });
        } catch (e) {
          this.log.warn(`insights #${post.id}: ${(e as Error).message}`);
        }
      }
    }
  }

  // ---------- texts for the bot ----------

  async pagesText(ownerId: number, lang: Lang) {
    const pages = await this.pages.find({ where: { ownerId }, order: { id: 'ASC' } });
    if (!pages.length) return bt(lang, 'noPages');
    const lines = await Promise.all(pages.map(async (p) => {
      const acc = await this.ig.account(p.igAccountId);
      const queued = await this.posts.count({ where: { pageId: p.id, status: 'approved' } });
      const waiting = await this.posts.count({ where: { pageId: p.id, status: 'awaiting_approval' } });
      return bt(lang, 'pageLine', {
        icon: p.active ? '🟢' : '⏸', slug: p.slug, title: p.title, user: acc.username, slots: p.slots.join(', '),
        reels: Math.round(p.reelsRatio * 100), ai: bt(lang, p.aiEnabled ? 'ai.on' : 'ai.off'), queued, waiting,
      });
    }));
    return `${bt(lang, 'pagesTitle')}\n\n${lines.join('\n\n')}`;
  }

  async queueText(page: Page, lang: Lang) {
    const list = await this.upcoming(page);
    if (!list.length) return bt(lang, 'queueEmpty', { title: page.title });
    return `${bt(lang, 'queueTitle', { title: page.title, n: list.length })}\n\n` + list.map((p, i) =>
      `${i + 1}. ${formatSlot(p.scheduledFor!, page.timezone, lang)}  ${p.kind === 'VIDEO' ? '🎬' : '🖼'} ${short(p.quote ?? p.caption, lang, 50)}`).join('\n');
  }

  async statsText(ownerId: number, lang: Lang) {
    const out: string[] = [];
    for (const page of await this.activePages(ownerId)) {
      const s = await this.pageStats.find({ where: { pageId: page.id }, order: { day: 'DESC' }, take: 8 });
      const growth = s.length > 1 ? s[0].followers - s[s.length - 1].followers : 0;
      const published = await this.posts.find({ where: { pageId: page.id, status: 'published', stats: Not(IsNull()) } });
      const avg = (kind: string, metric: string) => {
        const xs = published.filter((p) => p.kind === kind).map((p) => p.stats![metric] ?? 0);
        return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : '-';
      };
      out.push(bt(lang, 'statsBlock', {
        title: page.title, f: s[0]?.followers ?? '-', g: `${growth >= 0 ? '+' : ''}${growth}`, d: Math.max(0, s.length - 1),
        ri: avg('IMAGE', 'reach'), rv: avg('VIDEO', 'reach'), li: avg('IMAGE', 'likes'), lv: avg('VIDEO', 'likes'),
      }));
    }
    return out.join('\n\n') || bt(lang, 'noActive');
  }
}
