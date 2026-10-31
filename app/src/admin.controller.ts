import { BadRequestException, Body, Controller, Get, Param, ParseIntPipe, Patch, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminOnly, AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { Page, User } from './entities';

@Controller('api/admin')
@UseGuards(AuthGuard)
@AdminOnly()
export class AdminController {
  constructor(
    private readonly auth: AuthService,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Page) private readonly pages: Repository<Page>,
  ) {}

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
