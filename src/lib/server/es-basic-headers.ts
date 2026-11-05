import { env as publicEnv } from '$env/dynamic/public';

/** Basic-auth headers for Elasticsearch when credentials are configured. */
export function elasticsearchHeaders(
  extra: Record<string, string> = { 'Content-Type': 'application/json' },
): Record<string, string> {
  const headers = { ...extra };
  const user = publicEnv.PUBLIC_DEFAULT_ELASTICSEARCH_USER;
  const password = publicEnv.PUBLIC_DEFAULT_ELASTICSEARCH_PASSWORD;
  if (user && password) {
    headers['Authorization'] = `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
  }
  return headers;
}
