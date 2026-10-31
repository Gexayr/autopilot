import { MigrationInterface, QueryRunner } from 'typeorm';

/** Post number inside its page (#1, #2, …): the global id meant nothing to the user. */
export class PostNum1762200000000 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(`ALTER TABLE posts ADD COLUMN num int`);
    await q.query(`
      UPDATE posts p SET num = x.n FROM (
        SELECT id, row_number() OVER (PARTITION BY "pageId" ORDER BY id) AS n FROM posts WHERE "pageId" IS NOT NULL
      ) x WHERE x.id = p.id`);
  }

  async down(q: QueryRunner) {
    await q.query(`ALTER TABLE posts DROP COLUMN num`);
  }
}
