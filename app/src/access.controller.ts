import { BadRequestException, Body, Controller, Get, Param, ParseIntPipe, Patch, Post as HttpPost, UseGuards } from '@nestjs/common';
import { AccessService, metaRolesUrl } from './access.service';
import { AdminOnly, AuthGuard, CurrentUser } from './auth.guard';
import { User } from './entities';

@Controller('api')
@UseGuards(AuthGuard)
export class AccessController {
  constructor(private readonly access: AccessService) {}

  @Get('access-requests')
  mine(@CurrentUser() user: User) {
    return this.access.mine(user.id);
  }

  @HttpPost('access-requests')
  create(@CurrentUser() user: User, @Body() b: { username?: string }) {
    return this.access.create(user, b.username ?? '');
  }

  @Get('admin/access-requests')
  @AdminOnly()
  async all() {
    return { metaUrl: metaRolesUrl(), requests: await this.access.all() };
  }

  @Patch('admin/access-requests/:id')
  @AdminOnly()
  decide(@Param('id', ParseIntPipe) id: number, @Body() b: { status?: string }) {
    if (b.status !== 'invited' && b.status !== 'rejected') throw new BadRequestException('status: invited или rejected');
    return this.access.decide(id, b.status);
  }
}
