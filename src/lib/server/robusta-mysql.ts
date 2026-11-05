import { env as privateEnv } from '$env/dynamic/private';
import { createMysqlPool } from '$lib/server/mysql';
import {
  describeMissingRobustaStoreEnv,
  listMissingRobustaStoreEnv,
} from '$lib/server/robusta-store-env';

const host = privateEnv.ROBUSTA_DB_HOST ?? '';
const port = parseInt(privateEnv.ROBUSTA_DB_PORT || '3306', 10);
const user = privateEnv.ROBUSTA_DB_USER ?? '';
const password = privateEnv.ROBUSTA_DB_PASSWORD ?? '';
const database = privateEnv.ROBUSTA_DB_NAME ?? '';

export function isRobustaStoreConfigured(): boolean {
  return listMissingRobustaStoreEnv({ host, user, database }).length === 0;
}

export function robustaStoreConfigGapMessage(): string {
  return describeMissingRobustaStoreEnv(listMissingRobustaStoreEnv({ host, user, database }));
}

export const robustaPool = createMysqlPool({
  host,
  port,
  user,
  password,
  database,
  connectionLimit: 5,
});
