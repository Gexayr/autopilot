import { ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Repository } from 'typeorm';
import { bt, Lang, langOf } from './bot.i18n';
import { config } from './config';
import { Kv, User } from './entities';
import { TelegramApi } from './telegram.api';

const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64url');
const safeEqual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const TOKEN_TTL_SEC = 30 * 86400;
const LOGIN_TTL_MS = 10 * 60_000;

export interface TgProfile { id: number; name: string; photoUrl?: string }
interface LoginNonce { at: number; linkUserId?: number; tg?: TgProfile }

/** Data-check string signed by Telegram: sorted `key=value` lines without `hash`. */
export function checkTelegramSignature(fields: Record<string, string>, secret: Buffer) {
  const { hash = '', ...rest } = fields;
  const dcs = Object.keys(rest).sort().map((k) => `${k}=${rest[k]}`).join('\n');
  return safeEqual(createHmac('sha256', secret).update(dcs).digest('hex'), hash);
}

/** Mini App initData (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app). */
export function verifyInitData(initData: string, botToken: string, maxAgeSec = 86400): TgProfile {
  const fields = Object.fromEntries(new URLSearchParams(initData));
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  if (!checkTelegramSignature(fields, secret)) throw new UnauthorizedException('bad initData signature');
  if (Date.now() / 1000 - Number(fields.auth_date) > maxAgeSec) throw new UnauthorizedException('initData expired');
  const u = JSON.parse(fields.user ?? '{}');
  if (!u.id) throw new UnauthorizedException('initData has no user');
  return { id: u.id, name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || '', photoUrl: u.photo_url };
}

export function signJwt(payload: Record<string, unknown>, secret: string, ttlSec = TOKEN_TTL_SEC) {
  const now = Math.floor(Date.now() / 1000);
  const head = `${b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64(JSON.stringify({ ...payload, iat: now, exp: now + ttlSec }))}`;
  return `${head}.${createHmac('sha256', secret).update(head).digest('base64url')}`;
}

export function verifyJwt(token: string, secret: string): Record<string, any> | null {
  const [h, p, sig] = token.split('.');
  if (!h || !p || !sig || !safeEqual(createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url'), sig)) return null;
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
  return payload.exp > Date.now() / 1000 ? payload : null;
}

@Injectable()
export class AuthService {
  private readonly log = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Kv) private readonly kv: Repository<Kv>,
    private readonly tg: TelegramApi,
  ) {
    if (!config.jwtSecret) this.log.warn('JWT_SECRET is empty, web login is disabled');
  }

  issue(user: User) {
    if (!config.jwtSecret) throw new ForbiddenException('JWT_SECRET is not configured');
    return { token: signJwt({ sub: user.id }, config.jwtSecret), user: this.view(user) };
  }

  async fromToken(token: string) {
    const p = config.jwtSecret ? verifyJwt(token, config.jwtSecret) : null;
    const user = p ? await this.users.findOneBy({ id: p.sub }) : null;
    if (!user || user.status === 'blocked') throw new UnauthorizedException();
    return user;
  }

  view(u: User) {
    return { id: u.id, name: u.name, avatarUrl: u.avatarUrl, email: u.email, telegram: !!u.telegramId, role: u.role, status: u.status, maxPages: u.maxPages, pro: u.pro, language: u.language };
  }

  // ---------- Telegram: Mini App ----------

  async webApp(initData: string) {
    return this.issue(await this.byTelegram(verifyInitData(initData, config.telegram.token)));
  }

  // ---------- Telegram: login through the bot (t.me/<bot>?start=login_<nonce>) ----------
  // Works on any device and needs no BotFather /setdomain: the browser polls until the bot sees /start.

  async startTelegramLogin(linkUserId?: number) {
    const nonce = randomBytes(18).toString('base64url');
    await this.kv.save({ key: `login:${nonce}`, value: { at: Date.now(), linkUserId } satisfies LoginNonce });
    return { nonce, url: `https://t.me/${await this.tg.botUsername()}?start=login_${nonce}` };
  }

  /** Called by the bot on /start login_<nonce>. Returns false for unknown/expired nonces. */
  async confirmTelegramLogin(nonce: string, tg: TgProfile) {
    const row = await this.kv.findOneBy({ key: `login:${nonce}` });
    const v = row?.value as LoginNonce | undefined;
    if (!v || Date.now() - v.at > LOGIN_TTL_MS || v.tg) return false;
    await this.kv.save({ key: row!.key, value: { ...v, tg } });
    return true;
  }

  /** null while the user hasn't pressed Start in the bot yet. */
  async pollTelegramLogin(nonce: string, currentUser?: User) {
    const key = `login:${nonce}`;
    const v = (await this.kv.findOneBy({ key }))?.value as LoginNonce | undefined;
    if (!v || Date.now() - v.at > LOGIN_TTL_MS) {
      await this.kv.delete({ key });
      throw new UnauthorizedException('Ссылка устарела, попробуйте ещё раз');
    }
    if (!v.tg) return null;
    await this.kv.delete({ key });
    if (v.linkUserId) {
      if (v.linkUserId !== currentUser?.id) throw new ForbiddenException();
      return this.issue(await this.link(currentUser, { telegramId: String(v.tg.id) }));
    }
    return this.issue(await this.byTelegram(v.tg));
  }

  // ---------- Google ----------

  async verifyGoogle(idToken: string) {
    if (!config.google.clientId) throw new ForbiddenException('Google login is not configured');
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    const t: any = await res.json();
    if (!res.ok || t.aud !== config.google.clientId || t.email_verified !== 'true' || !t.email)
      throw new UnauthorizedException('Google token is invalid');
    return { email: String(t.email).toLowerCase(), name: t.name ?? t.email, picture: t.picture as string | undefined };
  }

  async google(idToken: string) {
    const g = await this.verifyGoogle(idToken);
    const user = await this.users.findOneBy({ email: g.email })
      ?? (await this.create({ email: g.email, name: g.name, avatarUrl: g.picture ?? null }));
    return this.issue(user);
  }

  async linkGoogle(user: User, idToken: string) {
    return this.issue(await this.link(user, { email: (await this.verifyGoogle(idToken)).email }));
  }

  // ---------- users ----------

  private async byTelegram(tg: TgProfile) {
    const existing = await this.users.findOneBy({ telegramId: String(tg.id) });
    if (existing) {
      if (!existing.name || existing.name === 'Admin' || (!existing.avatarUrl && tg.photoUrl))
        await this.users.update(existing.id, { name: existing.name && existing.name !== 'Admin' ? existing.name : tg.name, avatarUrl: existing.avatarUrl ?? tg.photoUrl ?? null });
      return this.users.findOneByOrFail({ id: existing.id });
    }
    return this.create({ telegramId: String(tg.id), name: tg.name, avatarUrl: tg.photoUrl ?? null });
  }

  private async link(user: User, patch: { telegramId?: string; email?: string }) {
    const other = await this.users.findOneBy(patch.telegramId ? { telegramId: patch.telegramId } : { email: patch.email! });
    if (other && other.id !== user.id) throw new ForbiddenException('Этот аккаунт уже привязан к другому пользователю');
    await this.users.update(user.id, patch);
    return this.users.findOneByOrFail({ id: user.id });
  }

  private async create(data: Partial<User>) {
    const user = await this.users.save(this.users.create({ ...data, role: 'user', status: 'pending' }));
    const admins = await this.users.find({ where: { role: 'admin' } });
    for (const a of admins.filter((a) => a.telegramId)) {
      const l = langOf(a);
      await this.tg.send(Number(a.telegramId), bt(l, 'admin.newUser', { name: `${user.name || '-'}${user.email ? ` (${user.email})` : ''}` }), [
        [{ text: bt(l, 'btn.allow'), callback_data: `us:${user.id}:ok` }, { text: bt(l, 'btn.deny'), callback_data: `us:${user.id}:no` }],
      ]).catch((e) => this.log.warn(e.message));
    }
    return user;
  }

  /** Site and bot language; also relabels the user's Mini App button in Telegram. */
  async setLanguage(user: User, language: Lang) {
    if (user.language === language) return;
    await this.users.update(user.id, { language });
    if (user.telegramId) await this.tg.setMenuButton(config.publicUrl, bt(language, 'menu'), Number(user.telegramId)).catch((e) => this.log.warn(e.message));
  }

  /** Admin decision on a pending user (from the bot or the admin screen). */
  async setStatus(id: number, status: User['status']) {
    await this.users.update(id, { status });
    const u = await this.users.findOneByOrFail({ id });
    if (u.telegramId && status === 'active')
      await this.tg.send(Number(u.telegramId), bt(langOf(u), 'accessOpen', { url: config.publicUrl })).catch(() => undefined);
    return u;
  }
}
