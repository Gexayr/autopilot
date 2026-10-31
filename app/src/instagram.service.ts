import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { config } from './config';
import { decrypt, encrypt } from './crypto.util';
import { IgAccount, PostKind } from './entities';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class IgError extends Error {}

@Injectable()
export class InstagramService {
  private readonly log = new Logger(InstagramService.name);

  constructor(@InjectRepository(IgAccount) private readonly accounts: Repository<IgAccount>) {}

  private async call<T = any>(account: IgAccount | string, method: 'GET' | 'POST', path: string, params: Record<string, string> = {}): Promise<T> {
    const token = typeof account === 'string' ? account : decrypt(account.tokenEnc);
    const url = new URL(path.startsWith('http') ? path : `${config.instagram.apiBase}/${path}`);
    const body = new URLSearchParams({ ...params, access_token: token });
    const res =
      method === 'GET'
        ? await fetch(`${url}?${body}`, { signal: AbortSignal.timeout(60_000) })
        : await fetch(url, { method, body, signal: AbortSignal.timeout(60_000) });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || json.error) {
      const e = json.error ?? {};
      throw new IgError(`${e.message ?? res.statusText}${e.error_user_msg ? `: ${e.error_user_msg}` : ''} (code ${e.code ?? res.status})`);
    }
    return json;
  }

  /** Same flow as the n8n InstaPublish0001 workflow: container → wait until FINISHED → publish → permalink. */
  async publish(account: IgAccount, kind: PostKind, mediaUrl: string, caption: string) {
    const container = await this.call<{ id: string }>(account, 'POST', `${account.igUserId}/media`,
      kind === 'VIDEO' ? { media_type: 'REELS', video_url: mediaUrl, caption } : { image_url: mediaUrl, caption });

    for (let i = 0; ; i++) {
      await sleep(i === 0 ? 3_000 : 10_000);
      const s = await this.call<{ status_code: string; status?: string }>(account, 'GET', container.id, { fields: 'status_code,status' });
      if (s.status_code === 'FINISHED') break;
      if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED' || i >= 60)
        throw new IgError(`Instagram не смог обработать файл (${s.status_code ?? 'timeout'}): ${s.status ?? ''}`);
    }

    const published = await this.call<{ id: string }>(account, 'POST', `${account.igUserId}/media_publish`, { creation_id: container.id });
    const { permalink } = await this.call<{ permalink?: string }>(account, 'GET', published.id, { fields: 'permalink' }).catch(() => ({ permalink: undefined }));
    return { mediaId: published.id, permalink: permalink ?? null };
  }

  /** Register (or update) an account from a long-lived token; returns it. */
  async upsertFromToken(token: string, ownerId: number, expiresInSec?: number) {
    const me = await this.call<{ user_id: string; username: string }>(token, 'GET', 'me', { fields: 'user_id,username' });
    let acc = await this.accounts.findOneBy({ igUserId: me.user_id });
    if (acc && acc.ownerId !== ownerId) throw new IgError(`@${me.username} уже подключён другим пользователем`);
    acc ??= this.accounts.create({ igUserId: me.user_id, ownerId });
    acc.username = me.username;
    acc.tokenEnc = encrypt(token);
    // tokens from the Meta dashboard don't tell their age: assume a fresh 60-day token
    acc.tokenExpiresAt = new Date(Date.now() + (expiresInSec ?? 60 * 86400) * 1000);
    acc.lastError = null;
    return this.accounts.save(acc);
  }

  /** Long-lived tokens live 60 days; refresh the ones expiring within 20 days. */
  async refreshTokens() {
    const soon = new Date(Date.now() + 20 * 86400_000);
    for (const acc of await this.accounts.find()) {
      if (acc.tokenExpiresAt && acc.tokenExpiresAt > soon) continue;
      try {
        const r = await this.call<{ access_token: string; expires_in: number }>(acc, 'GET',
          'https://graph.instagram.com/refresh_access_token', { grant_type: 'ig_refresh_token' });
        acc.tokenEnc = encrypt(r.access_token);
        acc.tokenExpiresAt = new Date(Date.now() + r.expires_in * 1000);
        acc.lastError = null;
        this.log.log(`refreshed token for @${acc.username}`);
      } catch (e) {
        acc.lastError = `token refresh: ${(e as Error).message}`;
        this.log.warn(acc.lastError);
      }
      await this.accounts.save(acc);
    }
  }

  // --- OAuth: "Instagram API with Instagram Login" ---
  authorizeUrl(state: string) {
    const q = new URLSearchParams({
      client_id: config.instagram.appId,
      redirect_uri: this.redirectUri(),
      response_type: 'code',
      scope: 'instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights',
      state,
    });
    return `https://www.instagram.com/oauth/authorize?${q}`;
  }

  redirectUri() {
    return `${config.publicUrl}/ig/callback`;
  }

  async exchangeCode(code: string, ownerId: number) {
    const res = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      body: new URLSearchParams({
        client_id: config.instagram.appId,
        client_secret: config.instagram.appSecret,
        grant_type: 'authorization_code',
        redirect_uri: this.redirectUri(),
        code,
      }),
    });
    const short: any = await res.json();
    if (!res.ok || !short.access_token) throw new IgError(short.error_message ?? JSON.stringify(short));
    const long = await this.call<{ access_token: string; expires_in: number }>(short.access_token, 'GET',
      'https://graph.instagram.com/access_token', { grant_type: 'ig_exchange_token', client_secret: config.instagram.appSecret });
    return this.upsertFromToken(long.access_token, ownerId, long.expires_in);
  }

  // --- stats ---
  account(id: number) {
    return this.accounts.findOneByOrFail({ id });
  }

  profile(acc: IgAccount) {
    return this.call<{ followers_count: number; media_count: number; profile_picture_url?: string; name?: string }>(
      acc, 'GET', acc.igUserId, { fields: 'followers_count,media_count,profile_picture_url,name' });
  }

  async mediaInsights(acc: IgAccount, mediaId: string) {
    const r = await this.call<{ data: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] }>(
      acc, 'GET', `${mediaId}/insights`, { metric: 'reach,likes,comments,saved,shares' });
    return Object.fromEntries(r.data.map((m) => [m.name, m.values?.[0]?.value ?? m.total_value?.value ?? 0]));
  }
}
