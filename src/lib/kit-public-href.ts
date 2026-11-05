import { base } from '$app/paths';
import { withPublicBasePath } from './public-base-path';

/** Root-relative NextOps href under the baked Public Base Path. */
export function publicHref(href: string): string {
  return withPublicBasePath(href, base);
}
