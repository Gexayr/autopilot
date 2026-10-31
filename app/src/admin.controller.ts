import { BadRequestException, Body, Controller, Get, HttpCode, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { config } from './config';
import { AdminOnly, AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { Kv, Page, User } from './entities';

@Controller('api/admin')
@UseGuards(AuthGuard)
@AdminOnly()
export class AdminController {
  constructor(
    private readonly auth: AuthService,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Page) private readonly pages: Repository<Page>,
    @InjectRepository(Kv) private readonly kv: Repository<Kv>,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  /** AI generator health: PixVerse logins (checked by the generator) and today's jobs per provider. */
  @Get('generator')
  async generator() {
    const accounts = await Promise.all(Array.from({ length: config.pixverse.accounts }, async (_, i) => {
      const acc = `acc${i + 1}`;
      const s = (await this.kv.findOneBy({ key: `gen:pxv:${acc}` }))?.value as { loggedIn: boolean; at: number } | undefined;
      return { acc, loggedIn: s?.loggedIn ?? null, checkedAt: s?.at ? new Date(s.at) : null };
    }));
    const [jobs] = await this.db.query(`
      SELECT count(*) FILTER (WHERE status = 'queued')::int AS queued, count(*) FILTER (WHERE status = 'running')::int AS running,
             count(*) FILTER (WHERE status = 'done' AND "finishedAt" > now() - interval '1 day')::int AS done,
             count(*) FILTER (WHERE status = 'failed' AND "finishedAt" > now() - interval '1 day')::int AS failed
      FROM media_jobs`);
    const providers = await this.db.query(`
      SELECT s->>'provider' AS provider, count(*) FILTER (WHERE (s->>'ok')::boolean)::int AS ok, count(*) FILTER (WHERE NOT (s->>'ok')::boolean)::int AS errors
      FROM media_jobs, jsonb_array_elements(steps) s WHERE "createdAt" > now() - interval '1 day' GROUP BY 1 ORDER BY 1`);
    return { dashscope: !!config.dashscope.apiKey, accounts, jobs, providers };
  }

  /** The generator picks this up within a minute and sends the login link to the admins in Telegram. */
  @Post('generator/pixverse/:acc/login')
  @HttpCode(202)
  async pixverseLogin(@Param('acc') acc: string) {
    if (!/^acc\d+$/.test(acc) || Number(acc.slice(3)) > config.pixverse.accounts) throw new BadRequestException('bad account');
    await this.kv.save({ key: `gen:login-request:${acc}`, value: Date.now() });
    return { ok: true };
  }

  @Get('users')
  async list() {
    const users = await this.users.find({ order: { id: 'ASC' } });
    return Promise.all(users.map(async (u) => ({ ...this.auth.view(u), createdAt: u.createdAt, pages: await this.pages.countBy({ ownerId: u.id }) })));
  }

  @Patch('users/:id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() b: { status?: User['status']; maxPages?: number }) {
    if (b.maxPages !== undefined) {
      if (!Number.isInteger(b.maxPages) || b.maxPages < 0 || b.maxPages > 100) throw new BadRequestException('maxPages: 0-100');
      await this.users.update(id, { maxPages: b.maxPages });
    }
    if (b.status !== undefined) {
      if (!['active', 'pending', 'blocked'].includes(b.status)) throw new BadRequestException('bad status');
      const u = await this.users.findOneByOrFail({ id });
      if (u.role === 'admin' && b.status !== 'active') throw new BadRequestException('Админа заблокировать нельзя');
      await this.auth.setStatus(id, b.status);
    }
    const u = await this.users.findOneByOrFail({ id });
    return { ...this.auth.view(u), createdAt: u.createdAt, pages: await this.pages.countBy({ ownerId: u.id }) };
  }
}
