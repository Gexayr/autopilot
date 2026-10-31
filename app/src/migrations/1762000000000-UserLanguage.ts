import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserLanguage1762000000000 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(`ALTER TABLE users ADD COLUMN language varchar`);
  }

  async down(q: QueryRunner) {
    await q.query(`ALTER TABLE users DROP COLUMN language`);
  }
}
