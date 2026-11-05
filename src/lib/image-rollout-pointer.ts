export type ImageRolloutPointer = {
  current: string;
  previous: string | null;
};

export type RollbackImageResult =
  | { ok: true; pointer: ImageRolloutPointer }
  | { ok: false; error: string };

export function recordImageRollout(
  pointer: ImageRolloutPointer | null,
  newTag: string,
): ImageRolloutPointer {
  const tag = newTag.trim();
  if (!tag) throw new Error('IMAGE_TAG is required');
  if (!pointer) return { current: tag, previous: null };
  if (pointer.current === tag) return pointer;
  return { current: tag, previous: pointer.current };
}

export function rollbackImageRollout(pointer: ImageRolloutPointer): RollbackImageResult {
  const previous = pointer.previous?.trim() || null;
  if (!previous) return { ok: false, error: 'No previous image tag to roll back to' };
  return {
    ok: true,
    pointer: { current: previous, previous: pointer.current },
  };
}

export function parseImageRolloutPointer(raw: string | null | undefined): ImageRolloutPointer | null {
  if (raw == null) return null;
  const text = raw.trim();
  if (!text || text === 'null') return null;
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as { current?: unknown; previous?: unknown };
    const current = typeof record.current === 'string' ? record.current.trim() : '';
    if (!current) return null;
    const previous =
      record.previous == null || record.previous === ''
        ? null
        : typeof record.previous === 'string'
          ? record.previous.trim() || null
          : null;
    return { current, previous };
  } catch {
    return null;
  }
}

export function serializeImageRolloutPointer(pointer: ImageRolloutPointer): string {
  return `${JSON.stringify({ current: pointer.current, previous: pointer.previous })}\n`;
}
