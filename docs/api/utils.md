# `@jsxrx/utils` API Reference

Source files: `packages/utils/assert.js`, `packages/utils/array.js`, `packages/utils/observable.js`, `packages/utils/object.js`

---

## `assert`

```ts
assert(value: unknown, error: string | Error): asserts value
```

Runtime assertion. Throws an error if `value` is falsy. If `error` is a string, it is wrapped in a `new Error(...)`. If `error` is an `Error` instance, it is thrown directly.

```js
import { assert } from "@jsxrx/utils"

assert(user, "User must be logged in")
assert(result, new TypeError("Expected a valid result"))
```

---

## `asArray`

```ts
asArray<T>(input: T | T[] | null | undefined): T[] | null
```

Wraps a single value in an array if it is not already an array. Returns `null` for `null` or `undefined` input.

```js
import { asArray } from "@jsxrx/utils"

asArray("hello")       // → ["hello"]
asArray([1, 2, 3])     // → [1, 2, 3]
asArray(null)          // → null
asArray(undefined)     // → null
```

---

## `asObservable`

```ts
asObservable<T>(value: T | Observable<T>): Observable<T>
```

Wraps a plain value in `of()` from RxJS if it is not already an observable. If the value is already an observable, it is returned as-is.

```js
import { asObservable } from "@jsxrx/utils"
import { of } from "rxjs"

asObservable(42)       // → Observable that emits 42
asObservable(of(1, 2)) // → the same Observable instance
```

---

## `shallowComparator`

```ts
shallowComparator<T>(
  a: T,
  b: T,
  comparator?: (a: any, b: any) => boolean
): boolean
```

Performs a shallow equality check between two values. Uses strict equality (`===`) by default, or an optional custom `comparator` function. Arrays are compared element-by-element. Non-object, non-array values fall back to reference equality.

```js
import { shallowComparator } from "@jsxrx/utils"

shallowComparator({ x: 1 }, { x: 1 })           // → true
shallowComparator({ x: 1 }, { x: 2 })           // → false
shallowComparator([1, 2], [1, 2])               // → true
shallowComparator(
  { a: "foo" }, { a: "FOO" },
  (x, y) => String(x).toLowerCase() === String(y).toLowerCase()
)                                               // → true
```

---

## `shallowDiff`

```ts
shallowDiff(a: any, b: any): string[]
```

Returns an array of keys whose values differ between two objects. Uses strict equality (`!==`) for comparison.

```js
import { shallowDiff } from "@jsxrx/utils"

shallowDiff({ x: 1, y: 2 }, { x: 1, y: 3 })
// → ["y"]

shallowDiff({ a: 1 }, { b: 2 })
// → ["a", "b"]
```

---

## `combinedKeys`

```ts
combinedKeys(obj1: any, obj2: any): string[]
```

Returns the union of all keys from both objects, preserving insertion order.

```js
import { combinedKeys } from "@jsxrx/utils"

combinedKeys({ a: 1, b: 2 }, { b: 3, c: 4 })
// → ["a", "b", "c"]
```

---

## `strictCompareKeys`

```ts
strictCompareKeys(a: any, b: any): boolean
```

Compares the keys of two objects in strict order. Returns `true` only if both objects have the same keys in the same order.

```js
import { strictCompareKeys } from "@jsxrx/utils"

strictCompareKeys({ a: 1, b: 2 }, { a: 1, b: 2 })
// → true

strictCompareKeys({ a: 1, b: 2 }, { b: 2, a: 1 })
// → false (different key order)
```
