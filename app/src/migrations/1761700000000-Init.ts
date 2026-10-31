import { MigrationInterface, QueryRunner } from 'typeorm';

export class Init1761700000000 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(`
      CREATE TABLE ig_accounts (
        id serial PRIMARY KEY,
        "igUserId" varchar NOT NULL UNIQUE,
        username varchar NOT NULL,
        "tokenEnc" varchar NOT NULL,
        "tokenExpiresAt" timestamptz,
        "lastError" text,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE pages (
        id serial PRIMARY KEY,
        slug varchar NOT NULL UNIQUE,
        title varchar NOT NULL,
        "igAccountId" int NOT NULL REFERENCES ig_accounts(id),
        niche text NOT NULL,
        language varchar NOT NULL DEFAULT 'ru',
        style jsonb NOT NULL DEFAULT '{}',
        "reelsRatio" real NOT NULL DEFAULT 0,
        timezone varchar NOT NULL DEFAULT 'Asia/Yerevan',
        slots text[] NOT NULL DEFAULT '{10:00,19:00}',
        "bufferDays" int NOT NULL DEFAULT 2,
        active boolean NOT NULL DEFAULT true,
        "aiEnabled" boolean NOT NULL DEFAULT true,
        "autoApprove" boolean NOT NULL DEFAULT false,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE posts (
        id serial PRIMARY KEY,
        "pageId" int REFERENCES pages(id) ON DELETE CASCADE,
        kind varchar NOT NULL,
        source varchar NOT NULL DEFAULT 'ai',
        status varchar NOT NULL,
        quote text,
        caption text NOT NULL DEFAULT '',
        "mediaFile" varchar,
        render jsonb NOT NULL DEFAULT '{}',
        "contentHash" varchar,
        "scheduledFor" timestamptz,
        "publishingAt" timestamptz,
        "publishedAt" timestamptz,
        "igMediaId" varchar,
        permalink varchar,
        attempts int NOT NULL DEFAULT 0,
        error text,
        "tgMessageId" bigint,
        stats jsonb,
        "statsAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX posts_due ON posts (status, "scheduledFor");
      CREATE INDEX posts_page ON posts ("pageId", status);
      CREATE UNIQUE INDEX posts_page_hash ON posts ("pageId", "contentHash") WHERE "contentHash" IS NOT NULL;
      -- one post per page per slot
      CREATE UNIQUE INDEX posts_page_slot ON posts ("pageId", "scheduledFor")
        WHERE status IN ('approved', 'publishing', 'published');
      CREATE TABLE page_stats (
        id serial PRIMARY KEY,
        "pageId" int NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
        day date NOT NULL,
        followers int NOT NULL,
        "mediaCount" int NOT NULL,
        UNIQUE ("pageId", day)
      );
      CREATE TABLE kv (key varchar PRIMARY KEY, value jsonb NOT NULL);
    `);
  }

  async down(q: QueryRunner) {
    await q.query('DROP TABLE kv, page_stats, posts, pages, ig_accounts');
  }
}
