import {
  getReleaseCatalog,
  releaseNotesUnread,
  type ReleaseNotesSnapshot,
} from '../release-notes.ts';
import type { LocalSettingsStore } from './local-settings-store.ts';

export function releaseNotesSnapshot(
  store: LocalSettingsStore,
  operatorKey: string,
): ReleaseNotesSnapshot {
  const catalog = getReleaseCatalog();
  const lastRead = store.getReleaseNotesLastRead(operatorKey);
  return {
    runningVersion: catalog.runningVersion,
    lastRead,
    unread: releaseNotesUnread(catalog.runningVersion, lastRead),
    releases: catalog.releases,
  };
}

export function markReleaseNotesRead(
  store: LocalSettingsStore,
  operatorKey: string,
): ReleaseNotesSnapshot {
  store.putReleaseNotesLastRead(operatorKey, getReleaseCatalog().runningVersion);
  return releaseNotesSnapshot(store, operatorKey);
}
