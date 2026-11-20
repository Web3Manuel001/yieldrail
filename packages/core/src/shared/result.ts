export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
export const ok = <T>(value: T) => ({ ok: true, value }) as const;
export const err = <E>(error: E) => ({ ok: false, error }) as const;
