/**
 * Strips `readonly` recursively from a JSON-shaped DTO type.
 *
 * Public DTOs are `readonly` because the client hands out deep-frozen data. Internal
 * code that works on its **own** `structuredClone` copy (before freezing it) uses this
 * type to build the result without casts on every assignment.
 */
export type DeepMutable<T> = T extends readonly (infer Item)[]
  ? DeepMutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
    : T;

/** Deep clone typed as mutable: the caller owns the copy until it freezes it. */
export function cloneMutable<T>(value: T): DeepMutable<T> {
  return structuredClone(value) as DeepMutable<T>;
}
