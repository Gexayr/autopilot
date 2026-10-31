import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessController } from './access.controller';
import { AccessService } from './access.service';
import { AdminController } from './admin.controller';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { BotController } from './bot.controller';
import { dataSourceOptions } from './data-source';
import { ENTITIES } from './entities';
import { GeminiService } from './gemini.service';
import { InstagramController } from './instagram.controller';
import { InstagramService } from './instagram.service';
import { PagesController } from './pages.controller';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { RenderService } from './render.service';
import { SchedulerService } from './scheduler.service';
import { TelegramApi } from './telegram.api';

@Module({
  imports: [TypeOrmModule.forRoot(dataSourceOptions), TypeOrmModule.forFeature(ENTITIES)],
  controllers: [BotController, InstagramController, AuthController, PagesController, PostsController, AdminController, AccessController],
  providers: [TelegramApi, AuthService, AccessService, AuthGuard, InstagramService, GeminiService, RenderService, PostsService, SchedulerService],
})
export class AppModule {}
