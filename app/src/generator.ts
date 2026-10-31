// Generator container entry point: docker-compose service `generator` runs `node dist/generator.js`.
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dataSourceOptions } from './data-source';
import { ENTITIES } from './entities';
import { GeminiService } from './gemini.service';
import { GeneratorService } from './generator.service';
import { InstagramService } from './instagram.service';
import { DashScope, PixVerse } from './media.providers';
import { PostsService } from './posts.service';
import { RenderService } from './render.service';
import { TelegramApi } from './telegram.api';

@Module({
  imports: [TypeOrmModule.forRoot(dataSourceOptions), TypeOrmModule.forFeature(ENTITIES)],
  providers: [TelegramApi, InstagramService, GeminiService, RenderService, PostsService, DashScope, PixVerse, GeneratorService],
})
class GeneratorModule {}

async function main() {
  const app = await NestFactory.createApplicationContext(GeneratorModule, { logger: ['log', 'warn', 'error'] });
  const gen = app.get(GeneratorService);
  const stop = () => { gen.stop(); setTimeout(() => process.exit(0), 2_000); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  await gen.run();
  await app.close();
}
void main();
