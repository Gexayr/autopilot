// Thin fetch wrapper: JWT from localStorage, JSON in/out, server error text in exceptions.
import { lang, t } from './i18n';

export interface Me { id: number; name: string; avatarUrl: string | null; email: string | null; telegram: boolean; role: 'admin' | 'user'; status: 'active' | 'pending' | 'blocked'; maxPages: number; language: 'ru' | 'en' | 'hy' | null }
export interface PublicConfig { botUsername: string | null; googleClientId: string | null; instagramReady: boolean }
export interface PageStyle { theme?: string; font?: 'serif' | 'sans'; signature?: string; media?: 'card' | 'ai'; text?: boolean }
export interface PageCharacter {
  enabled: boolean; description: string; refs: { file: string; url: string }[];
  refsMode?: 'character' | 'style'; style?: string; world?: string;
}
export interface Page {
  id: number; slug: string; title: string; igAccountId: number; niche: string; language: string; style: PageStyle;
  reelsRatio: number; timezone: string; slots: string[]; bufferDays: number; active: boolean; aiEnabled: boolean; autoApprove: boolean;
  account: { id: number; username: string } | null; queued: number; waiting: number; generating: number; nextAt: string | null;
  character: PageCharacter | null;
  followers: number | null; growth7d: number | null;
}
export interface Account {
  id: number; username: string; tokenExpiresAt: string | null; lastError: string | null; followers: number | null;
  mediaCount: number | null; avatarUrl: string | null; pages: { id: number; title: string }[]; queued: number;
}
export type PostStatus = 'draft' | 'generating' | 'frame_approval' | 'awaiting_approval' | 'approved' | 'publishing' | 'published' | 'failed' | 'rejected';
export interface Post {
  id: number; num: number | null; pageId: number; kind: 'IMAGE' | 'VIDEO'; source: 'ai' | 'upload'; status: PostStatus; quote: string | null; caption: string;
  mediaUrl: string | null; frameUrl: string | null; scheduledFor: string | null; publishedAt: string | null; permalink: string | null; error: string | null;
  stats: Record<string, number> | null; createdAt: string;
}
export interface Theme { key: string; bg: string; text: string; accent: string }
export interface Stats {
  days: number;
  pages: { id: number; title: string; series: { day: string; followers: number }[]; published: number;
    byKind: Record<'IMAGE' | 'VIDEO', { count: number } & Record<string, number | null>> }[];
  top: { id: number; pageId: number; kind: 'IMAGE' | 'VIDEO'; quote: string | null; caption: string; permalink: string | null; publishedAt: string; stats: Record<string, number> }[];
}
export interface AdminUser extends Me { createdAt: string; pages: number }
export interface GeneratorStatus {
  dashscope: boolean;
  accounts: { acc: string; loggedIn: boolean | null; checkedAt: string | null }[];
  jobs: { queued: number; running: number; done: number; failed: number };
  providers: { provider: string; ok: number; errors: number }[];
}
export interface AccessRequest { id: number; userId: number; username: string; status: 'requested' | 'invited' | 'rejected' | 'connected'; createdAt: string; updatedAt: string; userName?: string }

const TOKEN_KEY = 'autopilot.token';
export const token = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (t: string | null) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ } },
};

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

let onUnauthorized: () => void = () => undefined;
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const headers: Record<string, string> = { 'x-lang': lang() };
  const tok = token.get();
  if (tok) headers.authorization = `Bearer ${tok}`;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  const send = () => fetch(`/api/${path}`, {
    method: opts.method ?? (opts.body !== undefined || opts.form ? 'POST' : 'GET'),
    headers,
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });
  // while the server restarts nginx answers 502/503 (the request never reached the app): wait and retry
  let res: Response | null = null;
  for (let attempt = 0; ; attempt++) {
    res = await send().catch(() => null);
    if (res && res.status !== 502 && res.status !== 503) break;
    if (attempt >= 5) {
      if (!res) throw new ApiError(t('net.offline'), 0);
      throw new ApiError(t('net.updating'), res.status);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (res.status === 401 && tok) onUnauthorized();
  const type = res.headers.get('content-type') ?? '';
  const data = type.includes('json') ? await res.json() : type.startsWith('image/') ? await res.blob() : await res.text();
  if (!res.ok) {
    const msg = typeof data === 'object' && data && 'message' in data ? (Array.isArray(data.message) ? data.message.join(', ') : data.message) : res.statusText;
    throw new ApiError(String(msg), res.status);
  }
  return data as T;
}

/** Upload with progress (fetch has no upload progress). */
export function uploadFile(form: FormData, onProgress: (pct: number) => void): Promise<Post> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/uploads');
    const tok = token.get();
    if (tok) xhr.setRequestHeader('authorization', `Bearer ${tok}`);
    xhr.setRequestHeader('x-lang', lang());
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let data: any = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* not json */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new ApiError(data?.message ?? (xhr.status === 413 ? t('net.tooLarge') : t('net.error', { code: xhr.status })), xhr.status));
    };
    xhr.onerror = () => reject(new ApiError(t('net.offline'), 0));
    xhr.send(form);
  });
}
