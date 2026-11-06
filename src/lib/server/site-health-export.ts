/**
 * Server-side site health export.
 * Loads site health snapshot rows for the export API.
 */
import mysql from 'mysql2/promise';
import { env as privateEnv } from '$env/dynamic/private';
import { formatSaturationLabel } from '$lib/site-health-export-format';

export type SiteHealthExportRow = {
  siteId: string;
  cpu: number | null;
  memory: number | null;
  disk: number | null;
  labels: { cpu: string; memory: string; disk: string };
};

let pool: mysql.Pool | null = null;

function getPool(): mysql.Pool {
  if (!pool) {
    // Feature-local pool for the export query path.
    pool = mysql.createPool({
      host: privateEnv.ROBUSTA_MYSQL_HOST || '127.0.0.1',
      user: privateEnv.ROBUSTA_MYSQL_USER || 'nextops',
      password: privateEnv.ROBUSTA_MYSQL_PASSWORD || '',
      database: privateEnv.ROBUSTA_MYSQL_DATABASE || 'robusta',
      waitForConnections: true,
      connectionLimit: 4,
    });
  }
  return pool;
}

export async function loadSiteHealthExport(siteId: string): Promise<SiteHealthExportRow> {
  const [rows] = await getPool().query(
    'SELECT site_id, cpu_pct, mem_bytes, disk_pct FROM site_health_snapshot WHERE site_id = ? LIMIT 1',
    [siteId],
  );
  const row = Array.isArray(rows) ? (rows[0] as Record<string, unknown> | undefined) : undefined;
  const cpu = typeof row?.cpu_pct === 'number' ? row.cpu_pct : null;
  const memory = typeof row?.mem_bytes === 'number' ? row.mem_bytes : null;
  const disk = typeof row?.disk_pct === 'number' ? row.disk_pct : null;
  return {
    siteId,
    cpu,
    memory,
    disk,
    labels: {
      cpu: cpu == null ? 'n/a' : formatSaturationLabel('cpu', cpu),
      memory: memory == null ? 'n/a' : formatSaturationLabel('memory', memory),
      disk: disk == null ? 'n/a' : formatSaturationLabel('disk', disk),
    },
  };
}

export async function fetchUpstreamHealthJson(url: string): Promise<unknown> {
  // Upstream probe used when ?upstream= is set.
  const res = await fetch(url);
  return res.json();
}
