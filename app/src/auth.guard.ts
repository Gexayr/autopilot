import { CanActivate, createParamDecorator, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { User } from './entities';

/** Lets a pending (not yet approved) user through: only for /api/me and login linking. */
export const AllowPending = () => SetMetadata('allowPending', true);
export const AdminOnly = () => SetMetadata('adminOnly', true);
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): User => ctx.switchToHttp().getRequest().user);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService, private readonly reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const header: string = req.headers.authorization ?? '';
    const user = await this.auth.fromToken(header.replace(/^Bearer\s+/i, ''));
    const flag = (k: string) => this.reflector.getAllAndOverride<boolean>(k, [ctx.getHandler(), ctx.getClass()]);
    if (user.status !== 'active' && !flag('allowPending')) throw new ForbiddenException('Доступ ещё не одобрен');
    if (flag('adminOnly') && user.role !== 'admin') throw new ForbiddenException();
    req.user = user;
    return true;
  }
}
