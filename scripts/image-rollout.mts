#!/usr/bin/env node
import { runImageRolloutCommand } from '../src/lib/image-rollout-cli.ts';

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (chunk) => chunks.push(chunk as Buffer));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', reject);
  });
}

const stdinText = process.argv[2] === 'pin-env' ? await readStdin() : '';
const result = runImageRolloutCommand(process.argv.slice(2), stdinText);
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.exitCode);
