import { BadRequestException, Body, Controller, Get, HttpCode, Patch, Post, UseGuards } from '@nestjs/common';
import { AllowPending, AuthGuard, CurrentUser } from './auth.guard';
import { AuthService } from './auth.service';
import { isLang } from './bot.i18n';
import { config } from './config';
import { User } from './entities';
import { TelegramApi } from './telegram.api';

@Controller('api')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly tg: TelegramApi) {}

  /** What the login screen needs to render its buttons. */
  @Get('config')
  async publicConfig() {
    return {
      botUsername: await this.tg.botUsername().catch(() => null),
      googleClientId: config.google.clientId || null,
      instagramReady: !!(config.instagram.appId && config.instagram.appSecret),
    };
  }

  @Post('auth/webapp')
  @HttpCode(200)
  webApp(@Body('initData') initData: string) {
    return this.auth.webApp(String(initData ?? ''));
  }

  @Post('auth/telegram/start')
  @HttpCode(200)
  tgStart() {
    return this.auth.startTelegramLogin();
  }

  @Post('auth/telegram/poll')
  @HttpCode(200)
  async tgPoll(@Body('nonce') nonce: string) {
    return (await this.auth.pollTelegramLogin(String(nonce ?? ''))) ?? { pending: true };
  }

  @Post('auth/google')
  @HttpCode(200)
  google(@Body('idToken') idToken: string) {
    return this.auth.google(String(idToken ?? ''));
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @AllowPending()
  me(@CurrentUser() user: User) {
    return this.auth.view(user);
  }

  @Patch('me')
  @UseGuards(AuthGuard)
  @AllowPending()
  async update(@CurrentUser() user: User, @Body('language') language: unknown) {
    if (!isLang(language)) throw new BadRequestException('language: ru, en или hy');
    await this.auth.setLanguage(user, language);
    return this.auth.view({ ...user, language });
  }

  @Post('me/link/telegram/start')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  @AllowPending()
  linkTgStart(@CurrentUser() user: User) {
    return this.auth.startTelegramLogin(user.id);
  }

  @Post('me/link/telegram/poll')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  @AllowPending()
  async linkTgPoll(@CurrentUser() user: User, @Body('nonce') nonce: string) {
    return (await this.auth.pollTelegramLogin(String(nonce ?? ''), user)) ?? { pending: true };
  }

  @Post('me/link/google')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  @AllowPending()
  linkGoogle(@CurrentUser() user: User, @Body('idToken') idToken: string) {
    return this.auth.linkGoogle(user, String(idToken ?? ''));
  }
}
