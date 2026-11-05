import {
  parseImageRolloutPointer,
  recordImageRollout,
  rollbackImageRollout,
  serializeImageRolloutPointer,
} from './image-rollout-pointer.ts';
import { upsertDotEnvAssignment } from './image-rollout-env.ts';

export type ImageRolloutCliResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

const USAGE =
  'Usage: image-rollout.mts record <json|null> <tag> | rollback <json> | current <json> | previous <json> | show <json|null> | pin-env <key> <value>';

export function runImageRolloutCommand(argv: string[], stdinText = ''): ImageRolloutCliResult {
  const [cmd, ...args] = argv;

  if (cmd === 'record') {
    try {
      const pointer = parseImageRolloutPointer(args[0] ?? 'null');
      return {
        exitCode: 0,
        stdout: serializeImageRolloutPointer(recordImageRollout(pointer, args[1] ?? '')),
        stderr: '',
      };
    } catch (err) {
      return {
        exitCode: 2,
        stdout: '',
        stderr: `${err instanceof Error ? err.message : String(err)}\n`,
      };
    }
  }

  if (cmd === 'rollback') {
    const pointer = parseImageRolloutPointer(args[0] ?? '');
    if (!pointer) {
      return { exitCode: 2, stdout: '', stderr: 'Invalid image rollout pointer\n' };
    }
    const result = rollbackImageRollout(pointer);
    if (!result.ok) {
      return { exitCode: 2, stdout: '', stderr: `${result.error}\n` };
    }
    return { exitCode: 0, stdout: serializeImageRolloutPointer(result.pointer), stderr: '' };
  }

  if (cmd === 'current') {
    const pointer = parseImageRolloutPointer(args[0] ?? '');
    if (!pointer) {
      return { exitCode: 2, stdout: '', stderr: 'Invalid image rollout pointer\n' };
    }
    return { exitCode: 0, stdout: pointer.current, stderr: '' };
  }

  if (cmd === 'previous') {
    const pointer = parseImageRolloutPointer(args[0] ?? '');
    if (!pointer) {
      return { exitCode: 2, stdout: '', stderr: 'Invalid image rollout pointer\n' };
    }
    return { exitCode: 0, stdout: pointer.previous ?? '', stderr: '' };
  }

  if (cmd === 'show') {
    const pointer = parseImageRolloutPointer(args[0] ?? 'null');
    if (!pointer) {
      return { exitCode: 0, stdout: 'current=\nprevious=\n', stderr: '' };
    }
    return {
      exitCode: 0,
      stdout: `current=${pointer.current}\nprevious=${pointer.previous ?? ''}\n`,
      stderr: '',
    };
  }

  if (cmd === 'pin-env') {
    const key = args[0];
    const value = args[1];
    if (!key || value == null) {
      return { exitCode: 2, stdout: '', stderr: `${USAGE}\n` };
    }
    return {
      exitCode: 0,
      stdout: upsertDotEnvAssignment(stdinText, key, value),
      stderr: '',
    };
  }

  return { exitCode: 2, stdout: '', stderr: `${USAGE}\n` };
}
