import { MigrationInterface, QueryRunner } from 'typeorm';

/** PRO users (switched on by an admin) have no monthly limit on AI Reels. */
export class Pro1762300000000 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(`ALTER TABLE users ADD COLUMN pro boolean NOT NULL DEFAULT false`);
  }

  async down(q: QueryRunner) {
    await q.query(`ALTER TABLE users DROP COLUMN pro`);
  }
}
