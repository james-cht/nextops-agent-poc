const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function upsertDotEnvAssignment(text: string, key: string, value: string): string {
  if (!KEY_RE.test(key)) throw new Error(`Invalid env key: ${key}`);
  const val = value.trim();
  if (!val) throw new Error(`${key} is required`);
  if (/[\r\n]/.test(val)) throw new Error(`${key} must be a single line`);
  const normalized = text.replace(/\r\n/g, '\n');
  const hadTrailingNewline = normalized.endsWith('\n');
  const lines = normalized.split('\n');
  if (hadTrailingNewline && lines[lines.length - 1] === '') lines.pop();
  let found = false;
  const next = lines.map((line) => {
    const body = line.startsWith('\ufeff') ? line.slice(1) : line;
    if (body.startsWith(`${key}=`)) {
      found = true;
      return `${key}=${val}`;
    }
    return line;
  });
  if (!found) next.push(`${key}=${val}`);
  return `${next.join('\n')}\n`;
}
