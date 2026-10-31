import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { I18nFilter } from './i18n.filter';
import { config } from './config';

// Built web app (web/ → Docker build stage); everything that isn't an API route falls back to index.html.
const WEB_DIR = join(__dirname, '..', 'web');
const API_PREFIXES = /^\/(api|tg|ig|health|media)(\/|$)/;

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableShutdownHooks();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.useGlobalFilters(new I18nFilter(app.getHttpAdapter()));
  if (existsSync(join(WEB_DIR, 'index.html'))) {
    app.useStaticAssets(WEB_DIR, {
      index: false,
      setHeaders: (res, path) => res.setHeader('cache-control', path.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache'),
    });
    app.use((req: any, res: any, next: () => void) => {
      if (req.method !== 'GET' || API_PREFIXES.test(req.path)) return next();
      res.setHeader('cache-control', 'no-cache');
      res.sendFile(join(WEB_DIR, 'index.html'));
    });
  }
  await app.listen(config.port);
}
void bootstrap();
