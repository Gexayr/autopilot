import { MigrationInterface, QueryRunner } from 'typeorm';

export class AccessRequests1761900000000 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(`
      CREATE TABLE ig_access_requests (
        id serial PRIMARY KEY,
        "userId" int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        username varchar NOT NULL,
        status varchar NOT NULL DEFAULT 'requested',
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE INDEX ig_access_requests_user ON ig_access_requests ("userId")`);
  }

  async down(q: QueryRunner) {
    await q.query(`DROP TABLE ig_access_requests`);
  }
}
