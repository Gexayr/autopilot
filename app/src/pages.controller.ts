import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Logger, NotFoundException, Param, ParseIntPipe, Patch, Post as HttpPost, Query, Res, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Response } from 'express';
import { DateTime } from 'luxon';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { In, MoreThan, MoreThanOrEqual, Not, IsNull, Repository } from 'typeorm';
import { AuthGuard, CurrentUser } from './auth.guard';
import { config } from './config';
import { sign } from './crypto.util';
import { IgAccount, Page, PageStat, PageStyle, Post, User } from './entities';
import { InstagramService } from './instagram.service';
import { PostsService } from './posts.service';
import { pickTheme, RenderService, THEMES } from './render.service';
import { slotTimes } from './slots';

const LANGUAGES = ['ru', 'en', 'hy'];
const SAMPLE: Record<string, string> = {
  ru: 'Маленькие шаги каждый день приводят к большим переменам.',
  en: 'Small steps every day lead to big changes.',
  hy: 'Ամեն օր փոքր քայլերը մեծ փոփոխությունների են տանում։',
};

/** Validates the editable page fields; unknown keys are ignored. */
function pageFields(b: any, partial: boolean): Partial<Page> {
  const out: Partial<Page> = {};
  for (const k of ['title', 'niche']) {
    if (!partial && b[k] === undefined) throw new BadRequestException(`${k}: обязательное поле`);
    if (b[k] === undefined) continue;
    const v = String(b[k]).trim();
    if (!v || v.length > (k === 'title' ? 80 : 1000)) throw new BadRequestException(`${k}: 1-${k === 'title' ? 80 : 1000} символов`);
    (out as any)[k] = v;
  }
  if (b.language !== undefined) {
    if (!LANGUAGES.includes(b.language)) throw new BadRequestException('language: ru, en или hy');
    out.language = b.language;
  }
  if (b.timezone !== undefined) {
    if (!DateTime.now().setZone(String(b.timezone)).isValid) throw new BadRequestException('timezone: неизвестный часовой пояс');
    out.timezone = String(b.timezone);
  }
  if (b.slots !== undefined) {
    const slots = Array.isArray(b.slots) ? [...new Set(b.slots.map((s: unknown) => String(s).trim()))] as string[] : [];
    if (!slots.length || slots.length > 6) throw new BadRequestException('slots: от 1 до 6 времён');
    try { slotTimes(slots, 'UTC', new Date()).next(); } catch (e) { throw new BadRequestException((e as Error).message); }
    out.slots = slots.sort();
  }
  if (b.reelsRatio !== undefined) {
    const r = Number(b.reelsRatio);
    if (!(r >= 0 && r <= 1)) throw new BadRequestException('reelsRatio: от 0 до 1');
    out.reelsRatio = r;
  }
  if (b.bufferDays !== undefined) {
    const d = Number(b.bufferDays);
    if (!Number.isInteger(d) || d < 1 || d > 7) throw new BadRequestException('bufferDays: от 1 до 7');
    out.bufferDays = d;
  }
  for (const k of ['active', 'aiEnabled', 'autoApprove'] as const) if (b[k] !== undefined) out[k] = !!b[k];
  if (b.style !== undefined) out.style = styleFields(b.style);
  return out;
}

function styleFields(s: any): PageStyle {
  const style: PageStyle = {};
  if (s?.theme) {
    if (!THEMES[s.theme]) throw new BadRequestException('style.theme: неизвестная тема');
    style.theme = s.theme;
  }
  if (s?.font) style.font = s.font === 'sans' ? 'sans' : 'serif';
  if (s?.signature) style.signature = String(s.signature).slice(0, 40);
  return style;
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'page';

@Controller('api')
@UseGuards(AuthGuard)
export class PagesController {
  private readonly log = new Logger(PagesController.name);

  constructor(
    private readonly posts: PostsService,
    private readonly ig: InstagramService,
    private readonly render: RenderService,
    @InjectRepository(Page) private readonly pages: Repository<Page>,
    @InjectRepository(IgAccount) private readonly accounts: Repository<IgAccount>,
    @InjectRepository(PageStat) private readonly pageStats: Repository<PageStat>,
    @InjectRepository(Post) private readonly postRepo: Repository<Post>,
  ) {}

  // ---------- Instagram accounts ----------

  @Get('accounts')
  async listAccounts(@CurrentUser() user: User) {
    const list = await this.accounts.find({ where: { ownerId: user.id }, order: { id: 'ASC' } });
    return Promise.all(list.map(async (a) => {
      const p = await this.ig.profile(a).catch((e) => ({ error: (e as Error).message }));
      const pages = await this.pages.find({ where: { igAccountId: a.id }, select: ['id', 'title'] });
      const queued = pages.length ? await this.postRepo.countBy({ pageId: In(pages.map((x) => x.id)), status: In(['approved', 'awaiting_approval']) }) : 0;
      return {
        id: a.id, username: a.username, tokenExpiresAt: a.tokenExpiresAt, lastError: a.lastError ?? (p as any).error ?? null,
        followers: (p as any).followers_count ?? null, mediaCount: (p as any).media_count ?? null,
        avatarUrl: (p as any).profile_picture_url ?? null, pages, queued,
      };
    }));
  }

  @Get('accounts/connect-url')
  connectUrl(@CurrentUser() user: User) {
    if (!config.instagram.appId || !config.instagram.appSecret)
      throw new BadRequestException('Подключение Instagram ещё не настроено на сервере (нет IG_APP_ID / IG_APP_SECRET).');
    const value = `${user.id}.${Date.now()}`;
    return { url: this.ig.authorizeUrl(`${value}.${sign(value)}`) };
  }

  @Delete('accounts/:id')
  async deleteAccount(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    const acc = await this.accounts.findOneBy({ id, ownerId: user.id });
    if (!acc) throw new NotFoundException();
    // its content goes too (the web asks for confirmation and names it)
    await this.removePages(await this.pages.findBy({ igAccountId: id }));
    await this.accounts.delete(id);
    return { ok: true };
  }

  // ---------- pages ----------

  @Get('pages')
  async listPages(@CurrentUser() user: User) {
    const list = await this.pages.find({ where: { ownerId: user.id }, order: { id: 'ASC' } });
    return Promise.all(list.map((p) => this.view(p)));
  }

  @Get('pages/:id')
  async getPage(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    return this.view(await this.owned(user, id));
  }

  @HttpPost('pages')
  async createPage(@CurrentUser() user: User, @Body() body: any) {
    const count = await this.pages.countBy({ ownerId: user.id });
    if (count >= user.maxPages) throw new BadRequestException(`Лимит контента: ${user.maxPages}`);
    const acc = await this.accounts.findOneBy({ id: Number(body.igAccountId), ownerId: user.id });
    if (!acc) throw new BadRequestException('Выберите подключённый аккаунт Instagram');
    const fields = pageFields(body, false);
    let slug = slugify(acc.username);
    for (let i = 2; await this.pages.existsBy({ ownerId: user.id, slug }); i++) slug = `${slugify(acc.username)}-${i}`;
    const page = await this.pages.save(this.pages.create({
      slots: ['12:00'], reelsRatio: 0.3, bufferDays: 2, language: 'ru', timezone: 'Asia/Yerevan',
      ...fields, style: { signature: `@${acc.username}`, ...fields.style }, ownerId: user.id, igAccountId: acc.id, slug,
    }));
    // first posts right away, so there is something to look at
    if (page.aiEnabled) void this.generateMany(page, 3);
    return this.view(page);
  }

  @Patch('pages/:id')
  async updatePage(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number, @Body() body: any) {
    const page = await this.owned(user, id);
    const fields = pageFields(body, true);
    if (body.igAccountId !== undefined) {
      const acc = await this.accounts.findOneBy({ id: Number(body.igAccountId), ownerId: user.id });
      if (!acc) throw new BadRequestException('Аккаунт не найден');
      fields.igAccountId = acc.id;
    }
    await this.pages.update(page.id, fields);
    return this.view(await this.pages.findOneByOrFail({ id }));
  }

  @Delete('pages/:id')
  async deletePage(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    await this.removePages([await this.owned(user, id)]);
    return { ok: true };
  }

  /** Unpublished posts (and their media files) go with the pages; published ones stay on Instagram. */
  private async removePages(pages: Page[]) {
    if (!pages.length) return;
    const ids = pages.map((p) => p.id);
    if (await this.postRepo.countBy({ pageId: In(ids), status: 'publishing' })) throw new BadRequestException('Идёт публикация, попробуйте через минуту');
    const unpublished = await this.postRepo.find({ where: { pageId: In(ids), status: Not(In(['published', 'publishing'])) } });
    for (const p of unpublished) await this.posts.reject(p.id); // removes media files
    await this.pages.delete(ids);
  }

  @HttpPost('pages/:id/generate')
  @HttpCode(202)
  async generate(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number, @Body('hint') hint?: string, @Body('language') language?: string) {
    if (language !== undefined && !LANGUAGES.includes(language)) throw new BadRequestException('language: ru, en или hy');
    const page = await this.owned(user, id);
    void this.posts.generateForUser(page, hint ? String(hint).slice(0, 300) : undefined, language);
    return { ok: true };
  }

  /** Sample quote card for the style picker (nothing is saved). */
  @HttpPost('style-preview')
  async stylePreview(@Body() body: any, @Res() res: Response) {
    const style = styleFields(body.style ?? {});
    const quote = String(body.quote || SAMPLE[body.language] || SAMPLE.ru).slice(0, 200);
    const file = await this.render.quoteImage(quote, style, pickTheme(style, Math.floor(Math.random() * 1000)));
    const path = join(config.mediaDir, file);
    const buf = await readFile(path);
    await rm(path, { force: true });
    res.type('image/jpeg').send(buf);
  }

  @Get('themes')
  themes() {
    return Object.entries(THEMES).map(([key, t]) => ({ key, ...t }));
  }

  // ---------- stats ----------

  @Get('stats')
  async stats(@CurrentUser() user: User, @Query('days') daysQ?: string) {
    const days = Math.min(365, Math.max(7, Number(daysQ) || 30));
    const since = DateTime.now().minus({ days }).toISODate()!;
    const list = await this.pages.find({ where: { ownerId: user.id }, order: { id: 'ASC' } });
    const published = list.length ? await this.postRepo.find({
      where: { pageId: In(list.map((p) => p.id)), status: 'published', publishedAt: MoreThan(new Date(Date.now() - days * 86400_000)) },
      order: { publishedAt: 'DESC' },
    }) : [];
    const metrics = ['reach', 'likes', 'comments', 'saved', 'shares'];
    const avg = (xs: Post[]) => Object.fromEntries(metrics.map((m) => {
      const v = xs.filter((p) => p.stats).map((p) => p.stats![m] ?? 0);
      return [m, v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null];
    }));
    const pages = await Promise.all(list.map(async (p) => {
      const series = await this.pageStats.find({ where: { pageId: p.id, day: MoreThanOrEqual(since) }, order: { day: 'ASC' } });
      const mine = published.filter((x) => x.pageId === p.id);
      return {
        id: p.id, title: p.title,
        series: series.map((s) => ({ day: s.day, followers: s.followers })),
        published: mine.length,
        byKind: { IMAGE: { count: mine.filter((x) => x.kind === 'IMAGE').length, ...avg(mine.filter((x) => x.kind === 'IMAGE')) },
                  VIDEO: { count: mine.filter((x) => x.kind === 'VIDEO').length, ...avg(mine.filter((x) => x.kind === 'VIDEO')) } },
      };
    }));
    const top = published.filter((p) => p.stats).sort((a, b) => (b.stats!.reach ?? 0) - (a.stats!.reach ?? 0)).slice(0, 10)
      .map((p) => ({ id: p.id, pageId: p.pageId, kind: p.kind, quote: p.quote, caption: p.caption.slice(0, 140), permalink: p.permalink, publishedAt: p.publishedAt, stats: p.stats }));
    return { days, pages, top };
  }

  // ---------- helpers ----------

  private async owned(user: User, id: number) {
    const page = await this.pages.findOneBy({ id, ownerId: user.id });
    if (!page) throw new NotFoundException('Контент не найден');
    return page;
  }

  private async generateMany(page: Page, n: number) {
    for (let i = 0; i < n; i++)
      await this.posts.generate(page).catch((e) => this.log.warn(`generate ${page.slug}: ${e.message}`));
  }

  private async view(p: Page) {
    const acc = await this.accounts.findOneBy({ id: p.igAccountId });
    const [queued, waiting, next, stats] = await Promise.all([
      this.postRepo.countBy({ pageId: p.id, status: 'approved' }),
      this.postRepo.countBy({ pageId: p.id, status: 'awaiting_approval' }),
      this.postRepo.findOne({ where: { pageId: p.id, status: 'approved', scheduledFor: Not(IsNull()) }, order: { scheduledFor: 'ASC' }, select: ['id', 'scheduledFor', 'kind'] }),
      this.pageStats.find({ where: { pageId: p.id }, order: { day: 'DESC' }, take: 8 }),
    ]);
    return {
      ...p, account: acc ? { id: acc.id, username: acc.username } : null,
      queued, waiting, nextAt: next?.scheduledFor ?? null,
      followers: stats[0]?.followers ?? null,
      growth7d: stats.length > 1 ? stats[0].followers - stats[stats.length - 1].followers : null,
    };
  }
}
