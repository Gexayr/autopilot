import { Body, Controller, ForbiddenException, Headers, HttpCode, Logger, Post as HttpPost } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { join } from 'node:path';
import { Repository } from 'typeorm';
import { config } from './config';
import { randomName } from './crypto.util';
import { AccessService } from './access.service';
import { AuthService } from './auth.service';
import { BOT_LANGS, bt, fromTelegramCode, isLang, Lang, langOf } from './bot.i18n';
import { Kv, Page, User } from './entities';
import { PostsService } from './posts.service';
import { translate } from './i18n.filter';
import { formatSlot } from './slots';
import { TelegramApi } from './telegram.api';


type PageCmd = 'queue' | 'now' | 'del' | 'gen' | 'pause' | 'resume';

@Controller('tg')
export class BotController {
  private readonly log = new Logger(BotController.name);

  constructor(
    private readonly posts: PostsService,
    private readonly tg: TelegramApi,
    private readonly auth: AuthService,
    private readonly access: AccessService,
    @InjectRepository(Kv) private readonly kv: Repository<Kv>,
    @InjectRepository(Page) private readonly pages: Repository<Page>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  @HttpPost('webhook')
  @HttpCode(200)
  webhook(@Headers('x-telegram-bot-api-secret-token') secret: string, @Body() update: any) {
    if (secret !== config.telegram.webhookSecret) throw new ForbiddenException();
    // answer Telegram at once: generating a Reels takes longer than its webhook timeout
    void this.handle(update).catch(async (e) => {
      this.log.error(e);
      const from = update.message?.from ?? update.callback_query?.from;
      if (!from) return;
      const lang = await this.langFor(from);
      await this.tg.send(from.id, bt(lang, 'error', { m: translate((e as Error).message, lang) })).catch(() => undefined);
    });
    return { ok: true };
  }

  private openButton(lang: Lang) {
    return [[{ text: bt(lang, 'btn.open'), web_app: { url: config.publicUrl } }]];
  }

  /** The language chosen on the website (or with /language); until then the Telegram app language. */
  private async langFor(from: { id: number; language_code?: string }, user?: User | null): Promise<Lang> {
    const u = user !== undefined ? user : await this.users.findOneBy({ telegramId: String(from.id) });
    return u?.language ? langOf(u) : fromTelegramCode(from.language_code);
  }

  private async handle(u: any) {
    const m = u.message;
    const from = u.callback_query?.from ?? m?.from;
    if (!from || (m && m.chat?.type !== 'private')) return;
    const text: string = (m?.text ?? '').trim();

    // web login through the bot: t.me/<bot>?start=login_<nonce>
    const login = /^\/start login_([\w-]+)$/.exec(text);
    if (login) {
      const ok = await this.auth.confirmTelegramLogin(login[1], {
        id: from.id, name: [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || '',
      });
      return this.tg.send(from.id, bt(await this.langFor(from), ok ? 'login.ok' : 'login.expired'));
    }

    const user = await this.users.findOneBy({ telegramId: String(from.id) });
    const lang = await this.langFor(from, user);
    if (!user || user.status !== 'active') {
      if (u.callback_query) return this.tg.answer(u.callback_query.id, bt(lang, 'noAccess'));
      return this.tg.send(from.id, bt(lang, user?.status === 'pending' ? 'pending' : 'stranger'), user?.status === 'pending' ? undefined : this.openButton(lang));
    }
    if (u.callback_query) return this.onCallback(u.callback_query, user, lang);
    const chat = Number(user.telegramId);
    const reply = (t: string, kb?: any) => this.tg.send(chat, t, kb);
    const help = () => reply(bt(lang, 'help', { url: config.publicUrl }), this.openButton(lang));
    // an admin answers a feedback message with Telegram's "Reply": the text goes to that user
    const fbKey = m.reply_to_message ? `fb:msg:${chat}:${m.reply_to_message.message_id}` : null;
    const fbUser = fbKey && user.role === 'admin' ? await this.kv.findOneBy({ key: fbKey }) : null;
    if (fbUser && text) {
      const to = await this.users.findOneBy({ id: fbUser.value as number });
      if (!to?.telegramId) return reply(bt(lang, 'fb.noTelegram', { email: to?.email ?? '-' }));
      await this.tg.send(Number(to.telegramId), bt(langOf(to), 'fb.answer', { text }));
      return reply(bt(lang, 'fb.answered'));
    }
    if (m.photo || m.video || m.document) return this.onUpload(m, user, lang);
    if (!text) return;
    if (!text.startsWith('/')) {
      const pending = await this.kv.findOneBy({ key: `edit:${chat}` });
      if (pending) {
        await this.kv.delete({ key: pending.key });
        await this.posts.ownedPost(user.id, pending.value as number);
        await reply(bt(lang, 'redrawing'));
        return this.posts.editQuote(pending.value as number, text);
      }
      return help();
    }
    const [rawCmd, ...args] = text.split(/\s+/);
    const cmd = rawCmd.replace(/@.*$/, '').toLowerCase();
    switch (cmd) {
      case '/start':
      case '/help': return help();
      case '/language': return reply(bt(lang, 'chooseLang'), [BOT_LANGS.map((l) => ({ text: l.label, callback_data: `lg:${l.value}` }))]);
      case '/pages': return reply(await this.posts.pagesText(user.id, lang));
      case '/stats': return reply(await this.posts.statsText(user.id, lang));
      case '/queue': case '/now': case '/del': case '/gen': case '/pause': case '/resume':
        return this.withPage(user, lang, cmd.slice(1) as PageCmd, args);
      default: return help();
    }
  }

  /**
   * A command about one page: the first argument may be its slug; with one page it is implied;
   * otherwise the bot answers with a button per page (the rest of the command waits in kv).
   */
  private async withPage(user: User, lang: Lang, cmd: PageCmd, args: string[]) {
    const chat = Number(user.telegramId);
    const byArg = args[0] ? await this.posts.findPage(args[0], user.id) : null;
    if (byArg) return this.runPageCmd(user, lang, cmd, byArg, args.slice(1));
    // /gen and /resume also make sense for paused pages
    const pages = cmd === 'gen' || cmd === 'resume'
      ? await this.pages.find({ where: { ownerId: user.id }, order: { id: 'ASC' } })
      : await this.posts.activePages(user.id);
    if (pages.length === 1) return this.runPageCmd(user, lang, cmd, pages[0], args);
    if (!pages.length) return this.tg.send(chat, bt(lang, 'noPages'));
    await this.kv.save({ key: `cmd:args:${chat}`, value: args });
    const names = await this.accountNames(pages);
    return this.tg.send(chat, bt(lang, 'whichContent'),
      pages.map((p) => [{ text: `${p.active ? '' : '⏸ '}${p.title} · @${names.get(p.igAccountId) ?? '?'}`, callback_data: `pc:${cmd}:${p.id}` }]));
  }

  private async accountNames(pages: Page[]) {
    const out = new Map<number, string>();
    for (const id of new Set(pages.map((p) => p.igAccountId))) out.set(id, (await this.posts.accountOf(id))?.username ?? '');
    return out;
  }

  private async runPageCmd(user: User, lang: Lang, cmd: PageCmd, p: Page, rest: string[]) {
    const reply = (t: string) => this.tg.send(Number(user.telegramId), t);
    switch (cmd) {
      case 'queue': return reply(await this.posts.queueText(p, lang));
      case 'now': {
        const next = await this.posts.publishNow(p);
        return reply(next ? bt(lang, 'publishing') : bt(lang, 'queueEmpty', { title: p.title }));
      }
      case 'del': {
        const n = parseInt(rest[0], 10);
        const post = Number.isFinite(n) ? await this.posts.deleteQueued(p, n) : null;
        return reply(post ? `${bt(lang, 'deleted', { n })}\n\n${await this.posts.queueText(p, lang)}` : bt(lang, 'delHint'));
      }
      case 'gen':
        await reply(bt(lang, 'generating'));
        return this.posts.generateForUser(p, rest.join(' ') || undefined);
      case 'pause':
      case 'resume':
        await this.pages.update(p.id, { active: cmd === 'resume' });
        return reply(bt(lang, cmd === 'resume' ? 'resumed' : 'paused', { title: p.title }));
    }
  }

  private async onUpload(m: any, user: User, lang: Lang) {
    const chat = Number(user.telegramId);
    if (m.media_group_id) return this.tg.send(chat, bt(lang, 'albums'));
    const doc = m.document;
    const file = m.photo ? m.photo[m.photo.length - 1] : m.video ?? doc;
    const mime: string = m.photo ? 'image/jpeg' : (m.video?.mime_type ?? doc?.mime_type ?? '');
    const kind = mime === 'image/jpeg' ? 'IMAGE' : /^video\/(mp4|quicktime)$/.test(mime) ? 'VIDEO' : null;
    if (!kind) return this.tg.send(chat, bt(lang, 'badFile'));
    if ((file.file_size ?? 0) > 20 * 1024 * 1024) return this.tg.send(chat, bt(lang, 'tooBig', { url: `${config.publicUrl}/calendar` }));
    const active = await this.posts.activePages(user.id);
    if (!active.length) return this.tg.send(chat, bt(lang, 'createFirst'), this.openButton(lang));
    const name = randomName(kind === 'IMAGE' ? 'jpg' : mime === 'video/quicktime' ? 'mov' : 'mp4');
    await this.tg.download(file.file_id, join(config.mediaDir, name));
    const post = await this.posts.addUpload(null, kind, name, m.caption ?? '');
    if (active.length === 1) return this.queued(chat, lang, await this.posts.assignPage(post.id, active[0].id), active[0]);
    await this.kv.save({ key: `draft:${post.id}`, value: user.id }); // whose upload it is, until a page is chosen
    return this.tg.send(chat, bt(lang, 'whichPage'), active.map((p) => [{ text: p.title, callback_data: `pg:${post.id}:${p.id}` }]));
  }

  private async queued(chat: number, lang: Lang, post: { scheduledFor: Date | null }, page: Page) {
    return this.tg.send(chat, bt(lang, 'queuedAt', { title: page.title, at: formatSlot(post.scheduledFor!, page.timezone, lang) }));
  }

  private async onCallback(q: any, user: User, lang: Lang) {
    const chat = Number(user.telegramId);
    const [action, a, b] = String(q.data ?? '').split(':');
    const id = Number(a);
    const msgId = q.message?.message_id;
    await this.tg.answer(q.id);
    switch (action) {
      case 'pc': { // a page picked from the buttons of /gen, /queue, …
        const page = await this.posts.findPage(b, user.id);
        if (!page) return;
        const saved = await this.kv.findOneBy({ key: `cmd:args:${chat}` });
        await this.tg.clearKeyboard(chat, msgId, `✓ ${page.title}`);
        return this.runPageCmd(user, lang, a as PageCmd, page, (saved?.value as string[]) ?? []);
      }
      case 'lg': {
        if (!isLang(a)) return;
        await this.auth.setLanguage(user, a);
        return this.tg.clearKeyboard(chat, msgId, bt(a, 'langSet'));
      }
      case 'ap': {
        const { page } = await this.posts.ownedPost(user.id, id);
        const post = await this.posts.approve(id);
        return this.tg.clearKeyboard(chat, msgId, bt(lang, 'inQueue', { at: formatSlot(post.scheduledFor!, page.timezone, lang) }));
      }
      case 'pn': { // publish right away instead of the next slot
        await this.posts.ownedPost(user.id, id);
        await this.posts.approveNow(id);
        return this.tg.clearKeyboard(chat, msgId, bt(lang, 'publishing'));
      }
      case 'fp': // animate the still and publish the clip as soon as it is ready
        await this.posts.ownedPost(user.id, id);
        await this.posts.approveFrame(id, true);
        return this.tg.clearKeyboard(chat, msgId, bt(lang, 'animatingNow'));
      case 'rj':
        await this.posts.ownedPost(user.id, id);
        await this.posts.reject(id);
        return this.tg.clearKeyboard(chat, msgId, bt(lang, 'discarded'));
      case 'rg':
        await this.posts.ownedPost(user.id, id);
        await this.tg.clearKeyboard(chat, msgId, bt(lang, 'regenerating'));
        return this.posts.regenerate(id);
      case 'ed': {
        const { post } = await this.posts.ownedPost(user.id, id);
        await this.kv.save({ key: `edit:${chat}`, value: id });
        return this.tg.send(chat, bt(lang, 'editPrompt', { id: post.num ?? id }));
      }
      case 'fv': // AI Reels: the still is fine, make the clip
        await this.posts.ownedPost(user.id, id);
        await this.posts.approveFrame(id);
        return this.tg.clearKeyboard(chat, msgId, bt(lang, 'animating'));
      case 'fn': // another still for the same quote
        await this.posts.ownedPost(user.id, id);
        await this.tg.clearKeyboard(chat, msgId, bt(lang, 'newFrameWorking'));
        return this.posts.newFrame(id);
      case 'pg': {
        const draft = await this.kv.findOneBy({ key: `draft:${id}` });
        const page = await this.posts.findPage(b, user.id);
        if (!page || draft?.value !== user.id) return;
        await this.kv.delete({ key: draft.key });
        await this.tg.clearKeyboard(chat, msgId);
        return this.queued(chat, lang, await this.posts.assignPage(id, page.id), page);
      }
      case 'us': { // admin approves a new user
        if (user.role !== 'admin') return;
        const u = await this.auth.setStatus(id, b === 'ok' ? 'active' : 'blocked');
        return this.tg.clearKeyboard(chat, msgId, bt(lang, b === 'ok' ? 'admin.allowed' : 'admin.denied', { name: u.name || u.email || '' }));
      }
      case 'ar': { // admin added (or refused) an Instagram tester
        if (user.role !== 'admin') return;
        const r = await this.access.decide(id, b === 'ok' ? 'invited' : 'rejected');
        return this.tg.clearKeyboard(chat, msgId, bt(lang, r.status === 'rejected' ? 'admin.arRejected' : 'admin.arInvited', { u: r.username }));
      }
    }
  }
}
