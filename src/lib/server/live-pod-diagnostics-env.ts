export function listMissingLivePodDiagnosticsTriggerEnv(input: {
  url: string;
  token: string;
}): Array<'ROBUSTA_ACTION_URL' | 'ROBUSTA_ACTION_TOKEN'> {
  const missing: Array<'ROBUSTA_ACTION_URL' | 'ROBUSTA_ACTION_TOKEN'> = [];
  if (!input.url.trim()) missing.push('ROBUSTA_ACTION_URL');
  if (!input.token.trim()) missing.push('ROBUSTA_ACTION_TOKEN');
  return missing;
}
