import { Injectable, Logger } from '@nestjs/common';
import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { promisify } from 'node:util';
import { config } from './config';

const run = promisify(execFile);

/** quota: free credits / quota used up; auth: PixVerse needs a new login; busy: try again later. */
export type MediaErrorKind = 'quota' | 'auth' | 'busy' | 'other';

export class MediaError extends Error {
  constructor(message: string, readonly kind: MediaErrorKind) { super(message); }
}

export type Aspect = '9:16' | '4:5';
const SIZE: Record<Aspect, string> = { '9:16': '1080*1920', '4:5': '1080*1350' };
const MIME: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

const dataUri = async (path: string) => `data:${MIME[extname(path).toLowerCase()] ?? 'image/jpeg'};base64,${(await readFile(path)).toString('base64')}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Alibaba Model Studio (DashScope): Qwen / Wan images and Wan image-to-video. */
@Injectable()
export class DashScope {
  get ready() {
    return !!config.dashscope.apiKey;
  }

  private async call(path: string, init: RequestInit = {}) {
    const res = await fetch(`${config.dashscope.baseUrl}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.dashscope.apiKey}`, ...init.headers },
      signal: AbortSignal.timeout(180_000),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || json.code) {
      const msg = `dashscope ${json.code ?? res.status}: ${json.message ?? res.statusText}`;
      if (/FreeTierOnly|Unpurchased|Arrearage|QuotaExhausted/i.test(json.code ?? '')) throw new MediaError(msg, 'quota');
      throw new MediaError(msg, res.status === 429 || res.status >= 500 || /Throttling/i.test(json.code ?? '') ? 'busy' : 'other');
    }
    return json;
  }

  /** `refs` (local files) keep a character the same across scenes. */
  async image(model: string, prompt: string, refs: string[], aspect: Aspect): Promise<Buffer> {
    if (model.startsWith('qwen')) refs = refs.slice(0, 3); // Qwen takes at most 3 pictures, Wan takes 4
    const content = [...await Promise.all(refs.map(async (r) => ({ image: await dataUri(r) }))), { text: prompt }];
    const j = await this.call('/services/aigc/multimodal-generation/generation', {
      method: 'POST',
      body: JSON.stringify({ model, input: { messages: [{ role: 'user', content }] }, parameters: { n: 1, size: SIZE[aspect], watermark: false } }),
    });
    const url = j.output?.choices?.[0]?.message?.content?.find((c: any) => c.image)?.image;
    if (!url) throw new MediaError(`dashscope ${model}: no image in the answer`, 'other');
    return Buffer.from(await (await fetch(url)).arrayBuffer());
  }

  /** Async task: submit, then poll until the clip is ready (usually under a minute). */
  async imageToVideo(model: string, image: string, prompt: string, resolution: '480P' | '720P'): Promise<Buffer> {
    const task = await this.call('/services/aigc/video-generation/video-synthesis', {
      method: 'POST',
      headers: { 'X-DashScope-Async': 'enable' },
      body: JSON.stringify({ model, input: { prompt, img_url: await dataUri(image) }, parameters: { resolution, duration: 5, prompt_extend: false, watermark: false } }),
    });
    const id = task.output?.task_id;
    if (!id) throw new MediaError(`dashscope ${model}: no task id`, 'other');
    for (const started = Date.now(); Date.now() - started < 10 * 60_000;) {
      await sleep(10_000);
      const j = await this.call(`/tasks/${id}`);
      const status = j.output?.task_status;
      if (status === 'SUCCEEDED') return Buffer.from(await (await fetch(j.output.video_url)).arrayBuffer());
      if (status === 'FAILED' || status === 'UNKNOWN' || status === 'CANCELED')
        throw new MediaError(`dashscope ${model}: ${j.output?.code ?? status} ${j.output?.message ?? ''}`.trim(), 'other');
    }
    throw new MediaError(`dashscope ${model}: timed out`, 'busy');
  }
}

/**
 * PixVerse through its official CLI (npm `pixverse`): it spends the account's own credits, free daily ones included,
 * which the paid platform API can't. Each account is logged in once (OAuth device flow, token lasts ~30 days)
 * into its own HOME: `${PIXVERSE_DIR}/acc1`, `acc2`, …
 */
@Injectable()
export class PixVerse {
  private readonly log = new Logger(PixVerse.name);
  /** Credits charged by the last generation (`cost_credits` in the CLI answer), for the job log. */
  lastCost: number | null = null;

  /** acc1 … accN from PIXVERSE_ACCOUNTS. */
  accounts() {
    return Array.from({ length: config.pixverse.accounts }, (_, i) => `acc${i + 1}`);
  }

  private home(acc: string) {
    return join(config.pixverse.dir, acc);
  }

  /** Exit codes of the CLI: 2 timeout, 3 auth, 4 credits / plan limit. */
  private async cli(acc: string, args: string[], timeoutSec: number) {
    try {
      const { stdout } = await run('pixverse', [...args, '--json'], {
        env: { ...process.env, HOME: this.home(acc) }, timeout: (timeoutSec + 30) * 1000, maxBuffer: 20 * 1024 * 1024,
      });
      return JSON.parse(stdout);
    } catch (e: any) {
      const msg = `pixverse ${acc}: ${String(e.stderr || e.stdout || e.message).trim().slice(0, 300)}`;
      throw new MediaError(msg, e.code === 3 ? 'auth' : e.code === 4 ? 'quota' : e.code === 2 || e.killed ? 'busy' : 'other');
    }
  }

  async loggedIn(acc: string) {
    if (!existsSync(join(this.home(acc), '.pixverse'))) return false;
    return this.cli(acc, ['auth', 'status'], 30).then(() => true, () => false);
  }

  /**
   * Starts the device login and resolves with the URL the account owner has to open; the CLI keeps
   * waiting in the background (the code is valid for 10 minutes) and stores the token when they confirm.
   */
  startLogin(acc: string, onDone?: () => Promise<void>): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn('pixverse', ['auth', 'login'], { env: { ...process.env, HOME: this.home(acc) }, stdio: ['ignore', 'pipe', 'pipe'] });
      const kill = setTimeout(() => child.kill(), 11 * 60_000);
      let out = '';
      const onData = (d: Buffer) => {
        out += d.toString();
        const url = /https:\/\/\S+oauth\/authorize\S*/.exec(out)?.[0];
        if (url) resolve(url);
      };
      child.stdout.on('data', onData);
      child.stderr.on('data', onData);
      child.on('exit', (code) => {
        clearTimeout(kill);
        this.log.log(`login ${acc} finished with ${code}`);
        void onDone?.().catch(() => undefined);
        reject(new Error(`pixverse login ${acc} exited (${code}): ${out.slice(-200)}`));
      });
    });
  }

  /** The CLI's JSON isn't fully documented: take a URL / file / asset id from whatever shape comes back. */
  private async fetchAsset(acc: string, result: any): Promise<Buffer> {
    this.lastCost = typeof result?.cost_credits === 'number' ? result.cost_credits : null;
    const pick = (r: any) => {
      const a = r?.assets?.[0] ?? r?.result?.assets?.[0] ?? r?.data?.assets?.[0] ?? r;
      return {
        url: a?.url ?? a?.image_url ?? a?.video_url ?? r?.url ?? r?.image_url ?? r?.video_url ?? null,
        file: a?.path ?? a?.file ?? a?.file_path ?? r?.path ?? null,
        id: a?.id ?? a?.asset_id ?? r?.id ?? r?.image_id ?? r?.video_id ?? null,
      };
    };
    let { url, file, id } = pick(result);
    let dir: string | undefined;
    try {
      if (!url && !file && id) {
        dir = await mkdtemp(join(tmpdir(), 'pixverse-'));
        ({ url, file } = pick(await this.cli(acc, ['asset', 'download', String(id), '--dest', dir], 300)));
        if (!url && !file) file = (await readdir(dir)).map((f) => join(dir!, f))[0] ?? null;
      }
      if (file) return await readFile(file);
      if (url) return Buffer.from(await (await fetch(url)).arrayBuffer());
      throw new MediaError(`pixverse ${acc}: no asset in ${JSON.stringify(result).slice(0, 200)}`, 'other');
    } finally {
      if (dir) await rm(dir, { recursive: true, force: true });
    }
  }

  async image(acc: string, prompt: string, refs: string[], aspect: Aspect): Promise<Buffer> {
    const args = ['create', 'image', '--prompt', prompt, '--model', config.pixverse.imageModel, '--aspect-ratio', aspect, '--timeout', '300'];
    if (refs.length) args.push('--images', ...refs);
    return this.fetchAsset(acc, await this.cli(acc, args, 300));
  }

  async imageToVideo(acc: string, image: string, prompt: string): Promise<Buffer> {
    const result = await this.cli(acc, [
      'create', 'video', '--image', image, '--prompt', prompt, '--model', config.pixverse.videoModel,
      '--quality', config.pixverse.videoQuality, '--duration', String(config.pixverse.videoDuration), '--aspect-ratio', '9:16', '--no-audio', '--timeout', '600',
    ], 600);
    return this.fetchAsset(acc, result);
  }
}
