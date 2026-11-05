import { env as privateEnv } from '$env/dynamic/private';
import { robustaPool, isRobustaStoreConfigured, robustaStoreConfigGapMessage } from '$lib/server/robusta-mysql';
import { resolveRobustaStoreSchema } from '$lib/server/robusta-store-schema';
import {
  assembleRobustaClusterInsight,
  type RobustaClusterSnapshot,
  type RobustaEventFact,
} from '$lib/robusta-cluster-snapshot';
import {
  listRobustaEventFacts as listEventFactsWithQuery,
  listRobustaInvestigationSteps as listStepsWithQuery,
  listRobustaInvestigations as listInvestigationsWithQuery,
  type RobustaInvestigationRow,
  type RobustaInvestigationStepRow,
  type RobustaQueryFn,
} from '$lib/server/robusta-store-query';
import type { RobustaHistoryKindFilter } from '$lib/robusta-history';

export class RobustaStoreNotConfiguredError extends Error {
  constructor(message = 'Robusta Store is not configured') {
    super(message);
    this.name = 'RobustaStoreNotConfiguredError';
  }
}

export type { RobustaInvestigationRow, RobustaInvestigationStepRow, RobustaQueryFn };
export type { RobustaClusterSnapshot, RobustaEventFact };

async function defaultQuery(sql: string, params: unknown[]): Promise<unknown[]> {
  const [rows] = (await robustaPool.query(sql, params)) as unknown as [unknown[]];
  return rows ?? [];
}

function requireStore(): void {
  if (!isRobustaStoreConfigured()) {
    throw new RobustaStoreNotConfiguredError(robustaStoreConfigGapMessage());
  }
}

function storeSchema() {
  return resolveRobustaStoreSchema(privateEnv.ROBUSTA_STORE_SCHEMA);
}

export async function listRobustaInvestigations(
  opts: {
    clusterKey: string;
    windowHours: number;
    page: number;
    pageSize?: number;
    kindFilter?: RobustaHistoryKindFilter;
  },
): Promise<{ total: number; items: RobustaInvestigationRow[] }> {
  requireStore();
  return listInvestigationsWithQuery({ ...opts, schema: storeSchema() }, defaultQuery);
}

export async function listRobustaInvestigationSteps(opts: {
  investigationId: string;
  clusterKey: string;
}): Promise<RobustaInvestigationStepRow[]> {
  requireStore();
  return listStepsWithQuery({ ...opts, schema: storeSchema() }, defaultQuery);
}

export async function loadRobustaClusterInsight(opts: {
  clusterKey: string;
  windowHours: number;
}): Promise<{
  snapshot: RobustaClusterSnapshot;
  exemplars: RobustaEventFact[];
  generateBlocked: boolean;
}> {
  requireStore();
  const facts = await listEventFactsWithQuery(
    { ...opts, schema: storeSchema() },
    defaultQuery,
  );
  return assembleRobustaClusterInsight(facts, { windowHours: opts.windowHours });
}
