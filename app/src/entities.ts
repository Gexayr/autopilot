import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type PostKind = 'IMAGE' | 'VIDEO';
export type PostStatus =
  | 'draft' // uploaded by hand, page not chosen yet
  | 'generating' // AI image / video is being made by the generator (media_jobs)
  | 'frame_approval' // AI Reels: the still waits for approval before the (paid) clip is made
  | 'awaiting_approval'
  | 'approved' // has scheduledFor
  | 'publishing'
  | 'published'
  | 'failed'
  | 'rejected';

export interface PageStyle {
  theme?: string; // key of THEMES in render.service.ts; empty = rotate
  font?: 'serif' | 'sans';
  signature?: string; // small text at the bottom, e.g. @handle
  media?: 'card' | 'ai'; // quote card (default) or AI image / video under the quote
  text?: boolean; // AI media: put the quote on top (default) or publish the pure picture / clip
  // brand: drawn by our renderer on every picture and clip (AI models distort logos, so they never draw it)
  brand?: boolean; // the switch; off keeps the settings below but nothing is drawn (unset = on when anything is set)
  logo?: string; // PNG in MEDIA_DIR, set only by the upload endpoint
  logoPos?: 'tl' | 'tr' | 'bl' | 'br';
  logoSize?: number; // % of the width, 8-35
  colors?: string[]; // up to 3 hex brand colors: AI scenes lean on them, the stripe uses them
  stripe?: boolean; // thin stripe in the brand colors along the bottom edge
  footer?: string; // short line at the bottom, e.g. a site or "18+"
}

/** World, picture style and an optional recurring character for AI scenes (column `character`, see visual.ts). */
export interface PageCharacter {
  enabled: boolean; // draw the character
  description: string; // e.g. "Astro, a small white robot with a blue visor"
  refs: string[]; // reference pictures (files in MEDIA_DIR)
  refsMode?: 'character' | 'style'; // the pictures show the character, or the world / art style to match
  style?: string; // key of VISUAL_STYLES or the user's own words
  world?: string; // the setting every scene happens in, e.g. a game universe
}

/** Raw AI media of a post, kept so the quote can be re-rendered on top after an edit. */
export interface PostRender {
  theme?: string;
  lang?: string; // set when it differs from the page's
  scene?: string; // English image prompt from Gemini
  motion?: string; // English camera / motion prompt for the clip
  aiImage?: string;
  aiVideo?: string;
  fallback?: boolean; // AI failed, the post got a quote card instead
  frameOk?: boolean; // the still was approved: make the clip and queue it right away
}

export type UserRole = 'admin' | 'user';
export type UserStatus = 'active' | 'pending' | 'blocked';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'bigint', nullable: true, unique: true }) telegramId: string | null; // also the chat for previews
  @Column({ type: 'varchar', nullable: true, unique: true }) email: string | null;
  @Column({ default: '' }) name: string;
  @Column({ type: 'varchar', nullable: true }) avatarUrl: string | null;
  @Column({ type: 'varchar', default: 'user' }) role: UserRole;
  @Column({ type: 'varchar', default: 'pending' }) status: UserStatus; // new users wait for an admin
  @Column({ default: 3 }) maxPages: number;
  @Column({ type: 'varchar', nullable: true }) language: string | null; // ru | en | hy: site and bot messages; null = not chosen yet
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

@Entity('ig_accounts')
export class IgAccount {
  @PrimaryGeneratedColumn() id: number;
  @Column() ownerId: number;
  @Column({ unique: true }) igUserId: string;
  @Column() username: string;
  @Column() tokenEnc: string;
  @Column({ type: 'timestamptz', nullable: true }) tokenExpiresAt: Date | null;
  @Column({ type: 'text', nullable: true }) lastError: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

@Entity('pages')
export class Page {
  @PrimaryGeneratedColumn() id: number;
  @Column() ownerId: number;
  @Column() slug: string; // unique per owner
  @Column() title: string;
  @Column() igAccountId: number;
  @Column({ type: 'text' }) niche: string; // what the page is about: goes into the AI prompt
  @Column({ default: 'ru' }) language: string;
  @Column({ type: 'jsonb', default: {} }) style: PageStyle;
  @Column({ type: 'real', default: 0 }) reelsRatio: number; // share of AI posts rendered as Reels
  @Column({ default: 'Asia/Yerevan' }) timezone: string;
  @Column({ type: 'text', array: true, default: '{10:00,19:00}' }) slots: string[];
  @Column({ default: 2 }) bufferDays: number; // keep this many days of posts generated ahead
  @Column({ default: true }) active: boolean;
  @Column({ default: true }) aiEnabled: boolean;
  @Column({ default: false }) autoApprove: boolean;
  @Column({ type: 'jsonb', nullable: true }) character: PageCharacter | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

@Entity('posts')
export class Post {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'int', nullable: true }) pageId: number | null;
  @Column({ type: 'int', nullable: true }) num: number | null; // #1, #2, … inside the page
  @Column({ type: 'varchar' }) kind: PostKind;
  @Column({ type: 'varchar', default: 'ai' }) source: 'ai' | 'upload';
  @Column({ type: 'varchar' }) status: PostStatus;
  @Column({ type: 'text', nullable: true }) quote: string | null;
  @Column({ type: 'text', default: '' }) caption: string;
  @Column({ type: 'varchar', nullable: true }) mediaFile: string | null;
  @Column({ type: 'jsonb', default: {} }) render: PostRender;
  @Column({ type: 'varchar', nullable: true }) contentHash: string | null;
  @Column({ type: 'timestamptz', nullable: true }) scheduledFor: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) publishingAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) publishedAt: Date | null;
  @Column({ type: 'varchar', nullable: true }) igMediaId: string | null;
  @Column({ type: 'varchar', nullable: true }) permalink: string | null;
  @Column({ default: 0 }) attempts: number;
  @Column({ type: 'text', nullable: true }) error: string | null;
  @Column({ type: 'bigint', nullable: true }) tgMessageId: string | null;
  @Column({ type: 'jsonb', nullable: true }) stats: Record<string, number> | null;
  @Column({ type: 'timestamptz', nullable: true }) statsAt: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

@Entity('page_stats')
export class PageStat {
  @PrimaryGeneratedColumn() id: number;
  @Column() pageId: number;
  @Column({ type: 'date' }) day: string;
  @Column() followers: number;
  @Column() mediaCount: number;
}

export type AccessRequestStatus = 'requested' | 'invited' | 'rejected' | 'connected';

/** A user asks the admin to add their Instagram account as a tester of the Meta app (needed while the app is in dev mode). */
@Entity('ig_access_requests')
export class IgAccessRequest {
  @PrimaryGeneratedColumn() id: number;
  @Column() userId: number;
  @Column() username: string; // Instagram username, lowercase, without @
  @Column({ type: 'varchar', default: 'requested' }) status: AccessRequestStatus;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}

export type MediaJobStatus = 'queued' | 'running' | 'done' | 'failed';

/** One AI media job per post, done by the generator container (src/generator.ts). */
@Entity('media_jobs')
export class MediaJob {
  @PrimaryGeneratedColumn() id: number;
  @Column() postId: number;
  @Column({ type: 'varchar', default: 'queued' }) status: MediaJobStatus;
  @Column({ default: 0 }) attempts: number;
  @Column({ type: 'text', nullable: true }) error: string | null;
  // every provider call: which one, whether it worked, how long it took
  @Column({ type: 'jsonb', default: [] }) steps: { step: 'image' | 'video'; provider: string; ok: boolean; ms: number; credits?: number; error?: string }[];
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @Column({ type: 'timestamptz', nullable: true }) startedAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) finishedAt: Date | null;
}

// Small key/value store: scheduler timestamps, pending Telegram edits.
@Entity('kv')
export class Kv {
  @Column({ primary: true }) key: string;
  @Column({ type: 'jsonb' }) value: unknown;
}

export const ENTITIES = [User, IgAccount, Page, Post, PageStat, Kv, IgAccessRequest, MediaJob];
