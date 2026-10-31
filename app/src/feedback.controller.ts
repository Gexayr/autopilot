import { BadRequestException, Body, Controller, HttpCode, Logger, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectRepository } from '@nestjs/typeorm';
import { DateTime } from 'luxon';
import { memoryStorage } from 'multer';
import { Repository } from 'typeorm';
import { AuthGuard, CurrentUser } from './auth.guard';
import { bt, langOf } from './bot.i18n';
import { Kv, User } from './entities';
import { TelegramApi } from './telegram.api';

const KINDS = ['idea', 'bug', 'other'] as const;
const PER_DAY = 10;

/** Ideas and problem reports from Settings go to the admins in Telegram; replying there answers the user (see bot.controller). */
@Controller('api')
@UseGuards(AuthGuard)
export class FeedbackController {
  private readonly log = new Logger(FeedbackController.name);

  constructor(
    private readonly tg: TelegramApi,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Kv) private readonly kv: Repository<Kv>,
  ) {}

  @Post('feedback')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, f, cb) => cb(/^image\/(jpeg|png|webp)$/.test(f.mimetype) ? null : new BadRequestException('Нужен JPEG/PNG/WebP'), /^image\/(jpeg|png|webp)$/.test(f.mimetype)),
  }))
  async send(@CurrentUser() user: User, @Body() b: { kind?: string; text?: string }, @UploadedFile() file?: Express.Multer.File) {
    const kind = KINDS.includes(b.kind as any) ? (b.kind as (typeof KINDS)[number]) : 'other';
    const text = String(b.text ?? '').trim().slice(0, 3000);
    if (text.length < 3) throw new BadRequestException('Напишите хотя бы пару слов');

    const dayKey = `fb:count:${user.id}:${DateTime.now().toISODate()}`;
    const count = Number((await this.kv.findOneBy({ key: dayKey }))?.value ?? 0);
    if (count >= PER_DAY) throw new BadRequestException('Сегодня уже отправлено много сообщений, попробуйте завтра');
    await this.kv.save({ key: dayKey, value: count + 1 });

    const admins = (await this.users.findBy({ role: 'admin' })).filter((a) => a.telegramId);
    for (const a of admins) {
      const l = langOf(a);
      const who = [user.name || '-', user.email, user.telegramId && `tg ${user.telegramId}`, `#${user.id}`].filter(Boolean).join(' · ');
      try {
        const msg = await this.tg.send(Number(a.telegramId), `${bt(l, `fb.${kind}`)}\n${bt(l, 'fb.from', { who })}\n\n${text}\n\n${bt(l, 'fb.replyHint')}`);
        await this.remember(Number(a.telegramId), msg.message_id, user.id);
        if (file) {
          const photo = await this.tg.sendPhotoFile(Number(a.telegramId), file.buffer, file.originalname || 'screenshot.jpg', bt(l, 'fb.screenshot'), msg.message_id);
          await this.remember(Number(a.telegramId), photo.message_id, user.id);
        }
      } catch (e) {
        this.log.warn(`feedback to admin ${a.id}: ${(e as Error).message}`);
      }
    }
    return { ok: true };
  }

  /** Which user an admin's Telegram message belongs to, so a reply to it reaches that user. */
  private remember(chat: number, messageId: number, userId: number) {
    return this.kv.save({ key: `fb:msg:${chat}:${messageId}`, value: userId });
  }
}
