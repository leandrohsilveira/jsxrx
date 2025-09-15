/**
 * @template {import("../types").Obj} T
 * @param {T} a 
 * @param {T} b 
 */
export function shallowEqual(a, b) {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (a[key] !== b[key]) return false;
  }

  return true;
}
