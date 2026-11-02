import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Logger, Param, ParseIntPipe, Patch, Post as HttpPost, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectRepository } from '@nestjs/typeorm';
import { diskStorage } from 'multer';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { Repository } from 'typeorm';
import { AuthGuard, CurrentUser } from './auth.guard';
import { config, mediaUrl } from './config';
import { randomName } from './crypto.util';
import { Page, Post, PostStatus, User } from './entities';
import { PostsService } from './posts.service';
import { bt } from './bot.i18n';
import { formatSlot } from './slots';

const STATUSES: PostStatus[] = ['draft', 'generating', 'frame_approval', 'awaiting_approval', 'approved', 'publishing', 'published', 'failed', 'rejected'];
const MIME: Record<string, { kind: Post['kind']; ext: string }> = {
  'image/jpeg': { kind: 'IMAGE', ext: 'jpg' }, 'image/png': { kind: 'IMAGE', ext: 'png' }, 'image/webp': { kind: 'IMAGE', ext: 'webp' },
  'video/mp4': { kind: 'VIDEO', ext: 'mp4' }, 'video/quicktime': { kind: 'VIDEO', ext: 'mov' },
};

const view = (p: Post) => ({
  id: p.id, num: p.num, pageId: p.pageId, kind: p.kind, source: p.source, status: p.status, quote: p.quote, caption: p.caption,
  mediaUrl: p.mediaFile ? mediaUrl(p.mediaFile) : null, frameUrl: p.status === 'frame_approval' && p.render.aiImage ? mediaUrl(p.render.aiImage) : null, scheduledFor: p.scheduledFor, publishedAt: p.publishedAt,
  permalink: p.permalink, error: p.error, stats: p.stats, createdAt: p.createdAt,
});

const date = (s?: string) => {
  if (!s) return undefined;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new BadRequestException(`bad date: ${s}`);
  return d;
};

@Controller('api')
@UseGuards(AuthGuard)
export class PostsController {
  private readonly log = new Logger(PostsController.name);

  constructor(
    private readonly posts: PostsService,
    @InjectRepository(Post) private readonly postRepo: Repository<Post>,
    @InjectRepository(Page) private readonly pages: Repository<Page>,
  ) {}

  /** AI Reels this month and the limit (null = no limit: admin or PRO). */
  @Get('video-quota')
  videoQuota(@CurrentUser() user: User) {
    return this.posts.videoQuota(user);
  }

  @HttpPost('pro-request')
  @HttpCode(200)
  async proRequest(@CurrentUser() user: User) {
    await this.posts.requestPro(user);
    return { ok: true };
  }

  @Get('posts')
  async list(@CurrentUser() user: User, @Query() q: Record<string, string>) {
    const status = q.status ? q.status.split(',').filter((s) => STATUSES.includes(s as PostStatus)) as PostStatus[] : undefined;
    const list = await this.posts.listPosts(user.id, { pageId: Number(q.pageId) || undefined, status, from: date(q.from), to: date(q.to) });
    return list.map(view);
  }

  @HttpPost('posts/:id/approve')
  @HttpCode(200)
  async approve(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number, @Body('now') now?: boolean) {
    const { post, page } = await this.posts.ownedPost(user.id, id);
    if (post.status !== 'awaiting_approval' && post.status !== 'draft' && post.status !== 'failed')
      throw new BadRequestException('Этот пост уже обработан');
    if (post.status === 'failed') await this.postRepo.update(id, { status: 'draft', attempts: 0 });
    // now = publish within a minute instead of the next free slot
    const done = now ? await this.posts.approveNow(id) : await this.posts.approve(id);
    await this.posts.closePreview(post, page, (l) => now ? bt(l, 'publishing') : bt(l, 'web.approved', { at: formatSlot(done.scheduledFor!, page.timezone, l) }));
    return view(await this.postRepo.findOneByOrFail({ id }));
  }

  /** AI Reels: the still is fine, make the clip (it goes straight to the queue when ready). */
  @HttpPost('posts/:id/frame/approve')
  @HttpCode(200)
  async approveFrame(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number, @Body('now') now?: boolean) {
    const { post, page } = await this.posts.ownedPost(user.id, id);
    await this.posts.approveFrame(id, !!now);
    await this.posts.closePreview(post, page, (l) => bt(l, 'animating'));
    return { ok: true };
  }

  /** AI Reels: another still with a different scene for the same quote. */
  @HttpPost('posts/:id/frame/new')
  @HttpCode(202)
  async newFrame(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    const { post, page } = await this.posts.ownedPost(user.id, id);
    await this.posts.closePreview(post, page, (l) => bt(l, 'newFrameWorking'));
    await this.posts.newFrame(id);
    return { ok: true };
  }

  @HttpPost('posts/:id/reject')
  @HttpCode(200)
  async reject(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    const { post, page } = await this.posts.ownedPost(user.id, id);
    await this.posts.reject(id);
    await this.posts.closePreview(post, page, (l) => bt(l, 'web.rejected'));
    return { ok: true };
  }

  /** Answers at once: a new AI variant (especially a Reels) takes up to a minute; the list refreshes. */
  @HttpPost('posts/:id/regenerate')
  @HttpCode(202)
  async regenerate(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    const { post, page } = await this.posts.ownedPost(user.id, id);
    if (post.status !== 'awaiting_approval') throw new BadRequestException('Другой вариант можно сделать только для поста на одобрении');
    await this.posts.closePreview(post, page, (l) => bt(l, 'web.other'));
    void this.posts.regenerate(id).catch((e) => this.log.warn(`regenerate #${id}: ${e.message}`));
    return { ok: true };
  }

  @Patch('posts/:id')
  async update(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number, @Body() b: { quote?: string; caption?: string; scheduledFor?: string }) {
    const { post } = await this.posts.ownedPost(user.id, id);
    if (post.status === 'published' || post.status === 'publishing') throw new BadRequestException('Пост уже опубликован');
    if (b.caption !== undefined) await this.postRepo.update(id, { caption: String(b.caption).slice(0, 2200) });
    if (b.quote !== undefined && b.quote.trim() !== (post.quote ?? '')) {
      if (post.source !== 'ai') throw new BadRequestException('Текст на картинке есть только у AI-постов');
      if (!b.quote.trim() || b.quote.length > 200) throw new BadRequestException('Текст на картинке: 1-200 символов');
      await this.posts.editQuote(id, b.quote, false);
    }
    if (b.scheduledFor) await this.posts.reschedule(id, date(b.scheduledFor)!);
    return view(await this.postRepo.findOneByOrFail({ id }));
  }

  @HttpPost('posts/:id/publish-now')
  @HttpCode(200)
  async publishNow(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    const { post } = await this.posts.ownedPost(user.id, id);
    if (post.status !== 'approved') throw new BadRequestException('Опубликовать сейчас можно только пост из очереди');
    await this.postRepo.update({ id, status: 'approved' }, { scheduledFor: new Date() });
    return { ok: true };
  }

  @Delete('posts/:id')
  async remove(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    const { post, page } = await this.posts.ownedPost(user.id, id);
    if (post.status === 'published' || post.status === 'publishing') throw new BadRequestException('Опубликованный пост удаляется в самом Instagram');
    await this.posts.reject(id);
    await this.posts.closePreview(post, page, (l) => bt(l, 'web.deleted'));
    return { ok: true };
  }

  /** Own photo/video from the website (no 20 MB Telegram limit): goes to the next free slot or the chosen time. */
  @HttpPost('uploads')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({ destination: config.mediaDir, filename: (_req, f, cb) => cb(null, randomName(MIME[f.mimetype]?.ext ?? 'bin')) }),
    limits: { fileSize: config.maxUploadMb * 1024 * 1024 },
    fileFilter: (_req, f, cb) => cb(MIME[f.mimetype] ? null : new BadRequestException('Нужен JPEG/PNG/WebP или MP4/MOV'), !!MIME[f.mimetype]),
  }))
  async upload(@CurrentUser() user: User, @UploadedFile() file: Express.Multer.File, @Body() b: { pageId?: string; caption?: string; scheduledFor?: string }) {
    if (!file) throw new BadRequestException('Файл не получен');
    let name = file.filename;
    try {
      const page = await this.pages.findOneBy({ id: Number(b.pageId), ownerId: user.id });
      if (!page) throw new BadRequestException('Выберите контент');
      const { kind } = MIME[file.mimetype];
      if (kind === 'IMAGE') { // Instagram takes JPEG only; also keeps the ratio within 4:5 … 1.91:1
        const jpg = randomName('jpg');
        const img = sharp(file.path).rotate();
        const { width = 1080, height = 1080 } = await img.metadata();
        const ratio = width / height;
        const fit = ratio < 0.8 ? { width, height: Math.round(width / 0.8) } : ratio > 1.91 ? { width, height: Math.round(width / 1.91) } : null;
        await (fit ? img.resize({ ...fit, fit: 'cover' }) : img).jpeg({ quality: 90 }).toFile(join(config.mediaDir, jpg));
        await rm(file.path, { force: true });
        name = jpg;
      }
      const draft = await this.posts.addUpload(null, kind, name, String(b.caption ?? ''));
      await this.posts.assignPage(draft.id, page.id);
      if (b.scheduledFor) await this.posts.reschedule(draft.id, date(b.scheduledFor)!).catch(async (e) => {
        await this.posts.reject(draft.id);
        throw e;
      });
      return view(await this.postRepo.findOneByOrFail({ id: draft.id }));
    } catch (e) {
      await rm(join(config.mediaDir, name), { force: true }).catch(() => undefined);
      throw e;
    }
  }
}
