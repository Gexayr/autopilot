import { MigrationInterface, QueryRunner } from 'typeorm';

export class AiMedia1762100000000 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(`ALTER TABLE pages ADD COLUMN "character" jsonb`);
    await q.query(`
      CREATE TABLE media_jobs (
        id serial PRIMARY KEY,
        "postId" int NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        status varchar NOT NULL DEFAULT 'queued',
        attempts int NOT NULL DEFAULT 0,
        error text,
        steps jsonb NOT NULL DEFAULT '[]',
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "startedAt" timestamptz,
        "finishedAt" timestamptz
      )`);
    await q.query(`CREATE INDEX media_jobs_status ON media_jobs (status, id)`);
  }

  async down(q: QueryRunner) {
    await q.query(`DROP TABLE media_jobs`);
    await q.query(`ALTER TABLE pages DROP COLUMN "character"`);
  }
}
