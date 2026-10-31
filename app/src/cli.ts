// Admin commands: docker-compose run --rm app node dist/cli.js <command> [args]
import 'reflect-metadata';
process.env.SCHEDULER = 'off';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { copyFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Repository } from 'typeorm';
import { AppModule } from './app.module';
import { config } from './config';
import { randomName } from './crypto.util';
import { IgAccount, Page, User } from './entities';
import { InstagramService } from './instagram.service';
import { PostsService } from './posts.service';
import { RenderService, THEMES } from './render.service';
import { botCommands } from './bot.i18n';
import { TelegramApi } from './telegram.api';

const opts = (args: string[]) =>
  Object.fromEntries(args.map((a) => a.replace(/^--/, '').split(/=(.*)/s)).map(([k, v]) => [k, v ?? 'true']));

const PAGE_FIELDS: Record<string, (v: string) => unknown> = {
  title: String, niche: String, language: String, timezone: String,
  slots: (v) => v.split(',').map((s) => s.trim()),
  reelsRatio: Number, bufferDays: Number,
  active: (v) => v === 'true', aiEnabled: (v) => v === 'true', autoApprove: (v) => v === 'true',
};

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const o = opts(rest);
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const ig = app.get(InstagramService);
  const pages = app.get<Repository<Page>>(getRepositoryToken(Page));
  const accounts = app.get<Repository<IgAccount>>(getRepositoryToken(IgAccount));
  const users = app.get<Repository<User>>(getRepositoryToken(User));
  // CLI acts as the first admin unless --owner=<userId> is given
  const owner = o.owner ? await users.findOneByOrFail({ id: Number(o.owner) }) : await users.findOneOrFail({ where: { role: 'admin' }, order: { id: 'ASC' } });
  try {
    switch (cmd) {
      case 'account:bootstrap': { // token from BOOTSTRAP_IG_TOKEN (.env)
        if (!config.instagram.bootstrapToken) throw new Error('BOOTSTRAP_IG_TOKEN is empty');
        const acc = await ig.upsertFromToken(config.instagram.bootstrapToken, owner.id);
        console.log(`account #${acc.id} @${acc.username} (${acc.igUserId})`);
        break;
      }
      case 'accounts':
        for (const a of await accounts.find()) console.log(`#${a.id} owner ${a.ownerId} @${a.username} expires ${a.tokenExpiresAt?.toISOString()} ${a.lastError ?? ''}`);
        break;
      case 'page:upsert': { // --slug=x --account=username [--title= --niche= --slots=10:00,19:00 --reelsRatio=0.3 --theme= --font= --signature=]
        const acc = o.account ? await accounts.findOneByOrFail({ username: o.account, ownerId: owner.id }) : null;
        let page = await pages.findOneBy({ slug: o.slug, ownerId: owner.id });
        page ??= pages.create({ slug: o.slug, style: {}, ownerId: owner.id });
        if (acc) page.igAccountId = acc.id;
        for (const [k, parse] of Object.entries(PAGE_FIELDS)) if (o[k] !== undefined) (page as any)[k] = parse(o[k]);
        for (const k of ['theme', 'font', 'signature'] as const) if (o[k] !== undefined) (page.style as any)[k] = o[k] || undefined;
        page.title ??= page.slug;
        await pages.save(page);
        console.log(JSON.stringify(page, null, 1));
        break;
      }
      case 'import:n8n': { // --file=queue.json --page=slug --from=/dir/with/media
        const page = await pages.findOneByOrFail({ slug: o.page, ownerId: owner.id });
        const q = JSON.parse(await readFile(o.file, 'utf8')).global.queue as { kind: 'IMAGE' | 'VIDEO'; fileName: string; caption: string }[];
        const posts = app.get(PostsService);
        for (const item of q) {
          const name = randomName(item.fileName.split('.').pop()!);
          await copyFile(join(o.from, item.fileName), join(config.mediaDir, name));
          const post = await posts.assignPage((await posts.addUpload(null, item.kind, name, item.caption)).id, page.id);
          console.log(`#${post.id} ${item.kind} → ${post.scheduledFor?.toISOString()}`);
        }
        break;
      }
      case 'render:test': { // writes samples to the media dir
        const r = app.get(RenderService);
        for (const theme of Object.keys(THEMES))
          console.log(theme, await r.quoteImage(o.text ?? 'Дисциплина это мост между целями и достижениями. Կարգապահություն', { signature: '@astrobot22' }, theme));
        if (o.reel) console.log('reel', await r.quoteReel(o.text ?? 'Маленькие шаги каждый день, большие перемены через год.', { signature: '@astrobot22' }, 'midnight'));
        break;
      }
      case 'tg:webhook': // also the Mini App button next to the message field and the command menu in ru/en/hy
        console.log(await app.get(TelegramApi).setWebhook(`${config.publicUrl}/tg/webhook`));
        console.log(await app.get(TelegramApi).setMenuButton(config.publicUrl));
        console.log(await app.get(TelegramApi).setMyCommands(botCommands('ru')));
        for (const l of ['ru', 'en', 'hy'] as const) console.log(l, await app.get(TelegramApi).setMyCommands(botCommands(l), l));
        break;
      case 'users':
        for (const u of await users.find({ order: { id: 'ASC' } })) console.log(`#${u.id} ${u.role} ${u.status} tg=${u.telegramId ?? '-'} ${u.email ?? ''} ${u.name}`);
        break;
      default:
        console.log('commands: account:bootstrap | accounts | users | page:upsert | import:n8n | render:test | tg:webhook  (--owner=<userId>)');
    }
  } finally {
    await app.close();
  }
}
main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
