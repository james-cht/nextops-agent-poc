export function listMissingRobustaStoreEnv(input: {
  host: string;
  user: string;
  database: string;
}): string[] {
  const missing: string[] = [];
  if (!input.host.trim()) missing.push('ROBUSTA_DB_HOST');
  if (!input.user.trim()) missing.push('ROBUSTA_DB_USER');
  if (!input.database.trim()) missing.push('ROBUSTA_DB_NAME');
  return missing;
}

function labelMissingKey(key: string): string {
  if (key === 'ROBUSTA_DB_NAME') {
    return 'ROBUSTA_DB_NAME (MySQL database name, not a table)';
  }
  return key;
}

export function describeMissingRobustaStoreEnv(missing: string[]): string {
  if (missing.length === 0) return '';
  const labels = missing.map(labelMissingKey);
  if (missing.length === 1) {
    return `Robusta Store env is missing ${labels[0]}`;
  }
  return `Robusta Store env is missing: ${labels.join(', ')}`;
}
