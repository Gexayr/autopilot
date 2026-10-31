import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';
import { config } from './config';
import { ENTITIES } from './entities';
import { Init1761700000000 } from './migrations/1761700000000-Init';
import { Users1761800000000 } from './migrations/1761800000000-Users';
import { AccessRequests1761900000000 } from './migrations/1761900000000-AccessRequests';
import { UserLanguage1762000000000 } from './migrations/1762000000000-UserLanguage';
import { AiMedia1762100000000 } from './migrations/1762100000000-AiMedia';

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: config.db.host,
  port: config.db.port,
  username: config.db.user,
  password: config.db.password,
  database: config.db.name,
  entities: ENTITIES,
  migrations: [Init1761700000000, Users1761800000000, AccessRequests1761900000000, UserLanguage1762000000000, AiMedia1762100000000],
  synchronize: false,
};

// used by the typeorm CLI (migration:run)
export default new DataSource(dataSourceOptions);
