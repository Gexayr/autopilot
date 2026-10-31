import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { config } from './config';
import { AccessRequestStatus, IgAccessRequest, User } from './entities';
import { bt, langOf } from './bot.i18n';
import { TelegramApi } from './telegram.api';

const OPEN: AccessRequestStatus[] = ['requested', 'invited'];

export const metaRolesUrl = () =>
  config.instagram.metaAppId ? `https://developers.facebook.com/apps/${config.instagram.metaAppId}/roles/roles/` : 'https://developers.facebook.com/apps/';

/** "Add my Instagram as a tester" requests: user → admins in Telegram → user gets the next step. */
@Injectable()
export class AccessService {
  private readonly log = new Logger(AccessService.name);

  constructor(
    private readonly tg: TelegramApi,
    @InjectRepository(IgAccessRequest) private readonly requests: Repository<IgAccessRequest>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  mine(userId: number) {
    return this.requests.find({ where: { userId }, order: { id: 'DESC' }, take: 20 });
  }

  async all() {
    const list = await this.requests.find({ order: { id: 'DESC' }, take: 100 });
    const users = await this.users.findBy({ id: In([...new Set(list.map((r) => r.userId))]) });
    return list.map((r) => ({ ...r, userName: users.find((u) => u.id === r.userId)?.name ?? '-' }));
  }

  async create(user: User, raw: string) {
    const username = String(raw ?? '').trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/[/?].*$/, '').toLowerCase();
    if (!/^[a-z0-9._]{1,30}$/.test(username)) throw new BadRequestException('Укажите username Instagram: латиница, цифры, точка и _');
    const existing = await this.requests.findOneBy({ userId: user.id, username, status: In(OPEN) });
    if (existing) return existing;
    if ((await this.requests.countBy({ userId: user.id, status: 'requested' })) >= 5) throw new BadRequestException('Уже 5 заявок ждут администратора');
    const req = await this.requests.save(this.requests.create({ userId: user.id, username }));
    const admins = await this.users.findBy({ role: 'admin' });
    for (const a of admins.filter((a) => a.telegramId)) {
      const l = langOf(a);
      await this.tg.send(Number(a.telegramId), bt(l, 'admin.igRequest', { name: user.name || user.email || bt(l, 'userN', { id: user.id }), u: username }), [
        [{ text: bt(l, 'btn.meta'), url: metaRolesUrl() }],
        [{ text: bt(l, 'btn.added'), callback_data: `ar:${req.id}:ok` }, { text: bt(l, 'btn.reject'), callback_data: `ar:${req.id}:no` }],
      ]).catch((e) => this.log.warn(e.message));
    }
    return req;
  }

  /** Admin decision (bot button or admin screen); tells the user what to do next. */
  async decide(id: number, status: 'invited' | 'rejected') {
    const req = await this.requests.findOneBy({ id });
    if (!req) throw new NotFoundException();
    if (req.status === 'connected') return req;
    req.status = status;
    await this.requests.save(req);
    const u = await this.users.findOneBy({ id: req.userId });
    if (u?.telegramId) {
      const l = langOf(u);
      await this.tg.send(Number(u.telegramId), bt(l, status === 'invited' ? 'igInvited' : 'igRejected', { u: req.username }),
        status === 'invited' ? [[{ text: bt(l, 'btn.connect'), web_app: { url: `${config.publicUrl}/accounts` } }]] : undefined).catch(() => undefined);
    }
    return req;
  }

  /** A regular user may connect only an account the admin added as a tester for them. */
  async assertAllowed(user: User, username: string) {
    if (user.role === 'admin') return;
    const mine = await this.requests.find({ where: { userId: user.id, status: In(['invited', 'connected']) } });
    if (mine.some((r) => r.username === username.toLowerCase())) return;
    throw new BadRequestException(mine.length
      ? `Вы вошли в @${username}, а одобрен ${mine.map((r) => '@' + r.username).join(', ')}. Выйдите из Instagram и войдите в нужный аккаунт.`
      : `Вы вошли в @${username}, но заявки на этот аккаунт нет. Сначала запросите доступ для @${username}.`);
  }

  /** Called after a successful Instagram login. */
  async markConnected(userId: number, username: string) {
    await this.requests.update({ userId, username: username.toLowerCase(), status: In([...OPEN, 'rejected']) }, { status: 'connected' });
  }
}
