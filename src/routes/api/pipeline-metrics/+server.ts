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

export const GET: RequestHandler = async ({ url }) => {
  const parsed = parsePipelineQueryParams(url);
  if ('error' in parsed) {
    return json(createErrorResponse(ErrorCode.BAD_REQUEST, parsed.error), { status: 400 });
  }

  const { thresholdSec, windowHours } = parsed;
  const excluded = pipelineExcludedUserPlaceholders();

  try {
    const query = `
      SELECT 
          COUNT(*) AS total_builds,
          SUM(CASE WHEN build_status = 'SUCCESS' THEN 1 ELSE 0 END) AS success_builds,
          ROUND(
              SUM(CASE WHEN build_status = 'SUCCESS' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 
              2
          ) AS success_rate,
          SUM(CASE WHEN build_duration > ? THEN 1 ELSE 0 END) AS timeout_builds,
          ROUND(
              SUM(CASE WHEN build_duration > ? THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 
              2
          ) AS timeout_rate
      FROM jenkins_build_info
      WHERE build_user NOT IN (${excluded})
        AND build_time >= NOW() - INTERVAL ? HOUR
    `;

    const params = [
      thresholdSec,
      thresholdSec,
      ...PIPELINE_EXCLUDED_BUILD_USERS,
      windowHours,
    ];

    const [rows] = (await pool.query(query, params)) as any[];

    clearError('MySQL Database');

    if (rows && rows.length > 0) {
      const row = rows[0];
      const totalBuilds = row.total_builds ? parseInt(row.total_builds, 10) : 0;

      if (totalBuilds > 0) {
        const successRate = row.success_rate !== null ? parseFloat(row.success_rate) : 0;
        const timeoutRate = row.timeout_rate !== null ? parseFloat(row.timeout_rate) : 0;
        return json({ successRate, timeoutRate, thresholdSec, windowHours });
      }
    }

    return json(
      createErrorResponse(ErrorCode.NOT_FOUND, `No build data in the last ${windowHours} hours`),
      { status: 404 },
    );
  } catch (error: any) {
    registerError('MySQL Database', error?.message || 'MySQL Error', error?.stack);
    return json(
      createErrorResponse(ErrorCode.UPSTREAM_ERROR, error?.message || 'MySQL Error'),
      { status: 500 },
    );
  }
};
