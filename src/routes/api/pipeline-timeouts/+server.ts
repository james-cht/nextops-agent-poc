import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pool } from '$lib/server/mysql';
import { registerError, clearError } from '$lib/server/diagnosis';
import { ErrorCode, createErrorResponse } from '$lib/errors';
import {
  PIPELINE_EXCLUDED_BUILD_USERS,
  parsePipelineQueryParams,
  pipelineExcludedUserPlaceholders,
} from '$lib/server/pipeline-filters';

function toIso(value: unknown): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

interface BuildRow {
  build_number: number;
  build_time: Date | string;
  build_duration: number;
  build_status: string;
  build_user: string | null;
  project_path: string | null;
  gitlab_url: string | null;
  manager_email: string | null;
  security_ticket_num: string | null;
}

interface PipelineRow {
  app_name: string;
  name_space: string | null;
  timeout_count: number;
  total_builds: number;
  timeout_rate: number | string | null;
  last_timeout_at: Date | string | null;
}

export const GET: RequestHandler = async ({ url }) => {
  const parsed = parsePipelineQueryParams(url);
  if ('error' in parsed) {
    return json(createErrorResponse(ErrorCode.BAD_REQUEST, parsed.error), { status: 400 });
  }

  const { thresholdSec, windowHours } = parsed;
  const appName = url.searchParams.get('appName')?.trim() || null;
  const excluded = pipelineExcludedUserPlaceholders();

  try {
    if (appName) {
      const query = `
        SELECT
          build_number,
          build_time,
          build_duration,
          build_status,
          build_user,
          project_path,
          gitlab_url,
          manager_email,
          security_ticket_num
        FROM jenkins_build_info
        WHERE build_user NOT IN (${excluded})
          AND build_time >= NOW() - INTERVAL ? HOUR
          AND app_name = ?
          AND build_duration > ?
        ORDER BY build_time DESC
      `;

      const params = [...PIPELINE_EXCLUDED_BUILD_USERS, windowHours, appName, thresholdSec];
      const [rows] = (await pool.query(query, params)) as unknown as [BuildRow[]];

      clearError('MySQL Database');

      const builds = (rows ?? []).map((row: BuildRow) => ({
        buildNumber: Number(row.build_number),
        buildTime: toIso(row.build_time) ?? '',
        buildDuration: Number(row.build_duration),
        buildStatus: row.build_status ?? '',
        buildUser: row.build_user ?? null,
        projectPath: row.project_path ?? null,
        gitlabUrl: row.gitlab_url ?? null,
        managerEmail: row.manager_email ?? null,
        securityTicketNum: row.security_ticket_num ?? null,
      }));

      return json({ appName, thresholdSec, windowHours, builds });
    }

    const query = `
      SELECT
        app_name,
        name_space,
        SUM(CASE WHEN build_duration > ? THEN 1 ELSE 0 END) AS timeout_count,
        COUNT(*) AS total_builds,
        ROUND(
          SUM(CASE WHEN build_duration > ? THEN 1 ELSE 0 END) * 100.0 / COUNT(*),
          2
        ) AS timeout_rate,
        MAX(CASE WHEN build_duration > ? THEN build_time END) AS last_timeout_at
      FROM jenkins_build_info
      WHERE build_user NOT IN (${excluded})
        AND build_time >= NOW() - INTERVAL ? HOUR
      GROUP BY app_name, name_space
      HAVING SUM(CASE WHEN build_duration > ? THEN 1 ELSE 0 END) > 0
      ORDER BY timeout_count DESC
    `;

    const params = [
      thresholdSec,
      thresholdSec,
      thresholdSec,
      ...PIPELINE_EXCLUDED_BUILD_USERS,
      windowHours,
      thresholdSec,
    ];

    const [rows] = (await pool.query(query, params)) as unknown as [PipelineRow[]];

    clearError('MySQL Database');

    const pipelines = (rows ?? []).map((row: PipelineRow) => ({
      appName: row.app_name ?? '',
      nameSpace: row.name_space ?? null,
      timeoutCount: Number(row.timeout_count),
      totalBuilds: Number(row.total_builds),
      timeoutRate: row.timeout_rate !== null ? parseFloat(String(row.timeout_rate)) : 0,
      lastTimeoutAt: toIso(row.last_timeout_at),
    }));

    return json({ thresholdSec, windowHours, pipelines });
  } catch (error: any) {
    registerError('MySQL Database', error?.message || 'MySQL Error', error?.stack);
    return json(
      createErrorResponse(ErrorCode.UPSTREAM_ERROR, error?.message || 'MySQL Error'),
      { status: 500 },
    );
  }
};
