import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AccessService } from './access.service';
import { bt, langOf } from './bot.i18n';
import { verifySigned } from './crypto.util';
import { InstagramService } from './instagram.service';
import { TelegramApi } from './telegram.api';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities';

@Controller()
export class InstagramController {
  constructor(
    private readonly ig: InstagramService,
    private readonly access: AccessService,
    private readonly tg: TelegramApi,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  @Get('health')
  health() {
    return { ok: true };
  }

  /** Instagram login returns here; state = "<userId>.<ts>.<sig>" from GET /api/accounts/connect-url. */
  @Get('ig/callback')
  async callback(@Res() res: Response, @Query('code') code = '', @Query('state') state = '', @Query('error_description') error?: string) {
    const back = (q: Record<string, string>) => res.redirect(`/accounts?${new URLSearchParams(q)}`);
    if (error) return back({ error });
    const [uid, ts, sig] = state.split('.');
    if (!uid || !ts || !sig || !verifySigned(`${uid}.${ts}`, sig) || Date.now() - Number(ts) > 15 * 60_000)
      return back({ error: 'Ссылка устарела, нажмите «Подключить Instagram» ещё раз.' });
    try {
      const owner = await this.users.findOneByOrFail({ id: Number(uid) });
      const acc = await this.ig.exchangeCode(code.replace(/#_$/, ''), owner.id);
      await this.access.markConnected(owner.id, acc.username);
      if (owner.telegramId) await this.tg.send(Number(owner.telegramId), bt(langOf(owner), 'igConnected', { u: acc.username })).catch(() => undefined);
      return back({ connected: acc.username });
    } catch (e) {
      return back({ error: (e as Error).message });
    }
  }
}
