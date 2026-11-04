import { Injectable, Logger } from '@nestjs/common';
import { writeFile } from 'node:fs/promises';
import { config } from './config';

export type Button = { text: string } & ({ callback_data: string } | { url: string } | { web_app: { url: string } });
export type Keyboard = Button[][];

@Injectable()
export class TelegramApi {
  private readonly log = new Logger(TelegramApi.name);

  async call<T = any>(method: string, body: Record<string, unknown>): Promise<T> {
    // the connection to Telegram drops now and then (ECONNRESET): without a retry a new user's /start got no answer
    let res: Response | undefined;
    for (let attempt = 1; !res; attempt++) {
      try {
        res = await fetch(`https://api.telegram.org/bot${config.telegram.token}/${method}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(60_000),
        });
      } catch (e: any) {
        if (attempt >= 3 || e.name === 'TimeoutError') throw e;
        this.log.warn(`telegram ${method} attempt ${attempt}: ${e.cause?.code ?? e.message}`);
        await new Promise((r) => setTimeout(r, attempt * 1000));
      }
    }
    const json: any = await res.json();
    if (!json.ok) throw new Error(`telegram ${method}: ${json.description}`);
    return json.result;
  }

  send(chatId: number, text: string, keyboard?: Keyboard) {
    return this.call<{ message_id: number }>('sendMessage', {
      chat_id: chatId,
      text: text.slice(0, 4096),
      link_preview_options: { is_disabled: true },
      ...(keyboard && { reply_markup: { inline_keyboard: keyboard } }),
    });
  }

  /** Photo/video preview by public URL (Telegram downloads it itself). */
  sendMedia(chatId: number, kind: 'IMAGE' | 'VIDEO', url: string, caption: string, keyboard?: Keyboard) {
    return this.call<{ message_id: number }>(kind === 'VIDEO' ? 'sendVideo' : 'sendPhoto', {
      chat_id: chatId,
      [kind === 'VIDEO' ? 'video' : 'photo']: url,
      caption: caption.slice(0, 1024),
      ...(keyboard && { reply_markup: { inline_keyboard: keyboard } }),
    });
  }

  /** A photo from memory (not a public URL), optionally as a reply. */
  async sendPhotoFile(chatId: number, data: Buffer, filename: string, caption: string, replyTo?: number) {
    const form = new FormData();
    form.append('chat_id', String(chatId));
    form.append('caption', caption.slice(0, 1024));
    if (replyTo) form.append('reply_parameters', JSON.stringify({ message_id: replyTo }));
    form.append('photo', new Blob([new Uint8Array(data)]), filename);
    const res = await fetch(`https://api.telegram.org/bot${config.telegram.token}/sendPhoto`, { method: 'POST', body: form, signal: AbortSignal.timeout(60_000) });
    const json: any = await res.json();
    if (!json.ok) throw new Error(`telegram sendPhoto: ${json.description}`);
    return json.result as { message_id: number };
  }

  async clearKeyboard(chatId: number, messageId: number | string, note?: string) {
    try {
      await this.call('editMessageReplyMarkup', { chat_id: chatId, message_id: Number(messageId), reply_markup: { inline_keyboard: [] } });
      if (note) await this.call('sendMessage', { chat_id: chatId, text: note, reply_parameters: { message_id: Number(messageId) } });
    } catch (e) {
      this.log.warn((e as Error).message);
    }
  }

  answer(callbackId: string, text?: string) {
    return this.call('answerCallbackQuery', { callback_query_id: callbackId, text }).catch(() => undefined);
  }

  /** Bot API can only download files up to 20 MB. */
  async download(fileId: string, dest: string) {
    const f = await this.call<{ file_path: string }>('getFile', { file_id: fileId });
    const res = await fetch(`https://api.telegram.org/file/bot${config.telegram.token}/${f.file_path}`);
    if (!res.ok) throw new Error(`download failed: ${res.status}`);
    await writeFile(dest, Buffer.from(await res.arrayBuffer()));
  }

  private me?: Promise<{ username: string }>;
  /** @username of the bot, for t.me links. */
  async botUsername() {
    this.me ??= this.call<{ username: string }>('getMe', {});
    return (await this.me).username;
  }

  /** "Open" button next to the message field launches the web app as a Telegram Mini App (for one chat, or the default). */
  setMenuButton(url: string, text = 'Autopilot', chatId?: number) {
    return this.call('setChatMenuButton', { ...(chatId && { chat_id: chatId }), menu_button: { type: 'web_app', text, web_app: { url } } });
  }

  /** Command menu; `languageCode` = shown to users whose Telegram app is in that language. */
  setMyCommands(commands: { command: string; description: string }[], languageCode?: string) {
    return this.call('setMyCommands', { commands, ...(languageCode && { language_code: languageCode }) });
  }

  setWebhook(url: string) {
    return this.call('setWebhook', {
      url,
      secret_token: config.telegram.webhookSecret,
      allowed_updates: ['message', 'callback_query'],
    });
  }
}
