import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DateTime } from 'luxon';
import { Repository } from 'typeorm';
import { Kv } from './entities';
import { InstagramService } from './instagram.service';
import { PostsService } from './posts.service';

/** One loop, once a minute. Single process, so a simple "busy" flag prevents overlapping runs. */
@Injectable()
export class SchedulerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger(SchedulerService.name);
  private timer?: NodeJS.Timeout;
  private busy = false;

  constructor(
    private readonly posts: PostsService,
    private readonly ig: InstagramService,
    @InjectRepository(Kv) private readonly kv: Repository<Kv>,
  ) {}

  onApplicationBootstrap() {
    if (process.env.SCHEDULER === 'off') return;
    this.timer = setInterval(() => void this.tick(), 60_000);
    setTimeout(() => void this.tick(), 5_000);
  }

  onApplicationShutdown() {
    clearInterval(this.timer);
  }

  /** Runs `fn` if `key` last ran more than `everyMs` ago (remembered across restarts). */
  private async every(key: string, everyMs: number, fn: () => Promise<unknown>) {
    const last = await this.kv.findOneBy({ key });
    if (last && Date.now() - Number(last.value) < everyMs) return;
    await this.kv.save({ key, value: Date.now() });
    await fn().catch((e) => this.log.error(`${key}: ${(e as Error).message}`));
  }

  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.posts.recoverStuck();
      await this.posts.publishDue();
      await this.every('last:generate', 10 * 60_000, () => this.posts.ensureBuffers());
      await this.every('last:refresh', 24 * 3600_000, () => this.ig.refreshTokens());
      if (DateTime.now().setZone('Asia/Yerevan').hour >= 3)
        await this.every('last:stats', 20 * 3600_000, () => this.posts.collectStats());
    } catch (e) {
      this.log.error(e);
    } finally {
      this.busy = false;
    }
  }
}
