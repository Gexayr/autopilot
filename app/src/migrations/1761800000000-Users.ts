import { MigrationInterface, QueryRunner } from 'typeorm';

/** Multi-user: everything that existed before belongs to the first admin (TG_ADMIN_CHAT_ID). */
export class Users1761800000000 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(`
      CREATE TABLE users (
        id serial PRIMARY KEY,
        "telegramId" bigint UNIQUE,
        email varchar UNIQUE,
        name varchar NOT NULL DEFAULT '',
        "avatarUrl" varchar,
        role varchar NOT NULL DEFAULT 'user',
        status varchar NOT NULL DEFAULT 'pending',
        "maxPages" int NOT NULL DEFAULT 3,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )`);
    const chat = Number(process.env.TG_ADMIN_CHAT_ID) || null;
    const [admin] = await q.query(
      `INSERT INTO users ("telegramId", name, role, status, "maxPages") VALUES ($1, 'Admin', 'admin', 'active', 100) RETURNING id`, [chat]);
    for (const t of ['ig_accounts', 'pages']) {
      await q.query(`ALTER TABLE ${t} ADD COLUMN "ownerId" int REFERENCES users(id)`);
      await q.query(`UPDATE ${t} SET "ownerId" = $1`, [admin.id]);
      await q.query(`ALTER TABLE ${t} ALTER COLUMN "ownerId" SET NOT NULL`);
    }
    await q.query(`ALTER TABLE pages DROP CONSTRAINT pages_slug_key`);
    await q.query(`CREATE UNIQUE INDEX pages_owner_slug ON pages ("ownerId", slug)`);
  }

  async down(q: QueryRunner) {
    await q.query(`DROP INDEX pages_owner_slug`);
    await q.query(`ALTER TABLE pages ADD CONSTRAINT pages_slug_key UNIQUE (slug)`);
    await q.query(`ALTER TABLE pages DROP COLUMN "ownerId"`);
    await q.query(`ALTER TABLE ig_accounts DROP COLUMN "ownerId"`);
    await q.query(`DROP TABLE users`);
  }
}
