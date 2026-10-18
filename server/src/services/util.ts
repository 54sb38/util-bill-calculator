/** Drops `undefined` values so partial updates only touch the fields that were sent. */
export function definedOnly<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export const isEmpty = (obj: object) => Object.keys(obj).length === 0;
