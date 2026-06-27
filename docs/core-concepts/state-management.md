# State Management

JsxRx provides a set of reactive state management primitives built directly on RxJS. Unlike frameworks that rely on hooks, virtual DOM diffing, or compiler-driven reactivity, JsxRx gives you **observable streams** as the single source of truth. This guide covers every state management construct — from the fundamental `state()` cell to the async tracking utilities and decoupled event emission.

---

## Table of Contents

1. [No Hooks — RxJS Operators](#no-hooks--rxjs-operators)
2. [state() — Reactive State Cell](#state--reactive-state-cell)
3. [combine() — Merging Multiple Observables](#combine--merging-multiple-observables)
4. [defer() — Deferred Observable in combine()](#defer--deferred-observable-in-combine)
5. [activity() / toActivityAware() — Tracking Async Operations](#activity--toactivityaware--tracking-async-operations)
6. [pending() — Deriving Loading State](#pending--deriving-loading-state)
7. [emitter() — Decoupled Event Emission](#emitter--decoupled-event-emission)
8. [Comparison with React](#comparison-with-react)

---

## No Hooks — RxJS Operators

JsxRx has no equivalent to `useState`, `useMemo`, `useEffect`, or `useCallback`. All derived state is computed using standard RxJS operators:

```tsx
import { map } from "rxjs"
import { Props } from "@jsxrx/core"

function Component(props$: Observable<{ items: Item[] }>) {
  const { items$ } = Props.take(props$)

  const total$ = items$.pipe(
    map(items => items.reduce((sum, item) => sum + item.price, 0)),
  )

  return <p>Total: {total$}</p>
}
```

- **No dependency arrays**: RxJS `pipe()` automatically tracks which source observables affect a derivation. There is no `useEffect([dep])` — you simply subscribe or `pipe(map(...))`.
- **No `useCallback`**: Function references never change because components never re-run. Event handlers defined inside a component are stable for the entire lifecycle (see [`emitter()`](#emitter--decoupled-event-emission) for the reactive callback pattern).
- **No `useMemo`**: Derived state is just `source$.pipe(map(...))`. The `ObservableDelegate.pipe()` method automatically appends `shareReplay({ refCount: true, bufferSize: 1 })`, so the derivation is shared and cached.
- **No `useRef`**: Use `ref()` for DOM references (see [JSX in Depth](./jsx-in-depth.md)).

---

## state() — Reactive State Cell

**Source files:** [`packages/core/src/component.js`](../../packages/core/src/component.js#L22-L24), [`packages/core/src/observable.js`](../../packages/core/src/observable.js#L309-L330), [`packages/core/src/jsx.d.ts`](../../packages/core/src/jsx.d.ts#L11-L14)

`state(initialValue)` creates a reactive state cell that wraps a `BehaviorSubject`. It returns an `IState<T>` — an object that is both `Observable<T>` and provides synchronous read/write access:

```tsx
import { state } from "@jsxrx/core"

const count$ = state(0)

// Read the current value (synchronously)
console.log(count$.value) // 0

// Set a new value (triggers emission to all subscribers)
count$.set(5)
console.log(count$.value) // 5

// Subscribe to changes
count$.subscribe(value => console.log(value))
```

### Interface

```ts
interface IState<T> extends Observable<T> {
  value: T
  set(value: T): void
}
```

- **`IState<T>` extends `Observable<T>`** — you can embed it directly in JSX, pipe it through operators, or subscribe to it.
- **`.value`** — reads the current value synchronously from the underlying `BehaviorSubject`. Unlike React, there is no stale closure problem because `.value` always returns the latest snapshot.
- **`.set(value)`** — pushes a new value through the `BehaviorSubject`, emitting to all subscribers. Triggers DOM updates at every point where the state cell is embedded in JSX.

### Derived State

Derive new observables with standard RxJS operators:

```tsx
import { state } from "@jsxrx/core"
import { map } from "rxjs"

function Temperature() {
  const celsius$ = state(25)
  const fahrenheit$ = celsius$.pipe(map(c => (c * 9) / 5 + 32))

  return (
    <p>
      {celsius$}°C = {fahrenheit$}°F
    </p>
  )
}
```

### Object State with Immutable Updates

```tsx
function Form() {
  const form$ = state({ name: "", email: "" })

  function updateName(name: string) {
    form$.set({ ...form$.value, name })
  }

  return (
    <input
      value={form$.pipe(map(f => f.name))}
      onInput={e => updateName(e.target.value)}
    />
  )
}
```

> **Note:** `state()` always emits the exact value passed to `.set()`. For objects and arrays, ensure you pass a new reference (immutable update pattern) so that `distinctUntilChanged` (used internally by `Input.take()`) detects the change.

---

## combine() — Merging Multiple Observables

**Source files:** [`packages/core/src/observable.js`](../../packages/core/src/observable.js#L379-L400), [`packages/core/src/jsx.d.ts`](../../packages/core/src/jsx.d.ts#L85-L91)

`combine(data)` merges multiple observables — and plain values — into a single observable of combined objects. It is the reactive equivalent of `combineLatest` with automatic unwrapping:

```tsx
import { combine, state } from "@jsxrx/core"
import { map } from "rxjs"

function Greeting() {
  const firstName$ = state("John")
  const lastName$ = state("Doe")

  return (
    <p>
      {combine({
        firstName: firstName$,
        lastName: lastName$,
        greeting: "Hello", // plain values are wrapped in of()
      }).pipe(
        map(({ firstName, lastName, greeting }) =>
          `${greeting}, ${firstName} ${lastName}`,
        ),
      )}
    </p>
  )
}
```

### How It Works

1. Each value in the input object is inspected:
   - **Observable** → used directly as a source
   - **`Defer` instance** → emits the inner observable itself (see [`defer()`](#defer--deferred-observable-in-combine))
   - **Render node** (JSX element) → wrapped with `of()`
   - **Any other plain value** → wrapped with `of()`
2. `combineLatest` is applied to all entries.
3. The result is piped through `debounceTime(1)` and `distinctUntilChanged(shallowComparator)` to avoid unnecessary emissions.

### Return Type

```ts
type CombineOutput<T> = {
  [K in keyof T]: T[K] extends IDeferred<infer V>
    ? Observable<V>       // deferred observables remain as observables
    : T[K] extends Observable<infer V>
      ? V                 // observables are unwrapped to their value type
      : T[K]              // plain values pass through unchanged
}
```

Observable properties are **unwrapped** — `combine()` emits an object where each observable key is replaced by its last emitted value. This makes `combine()` ideal for assembling multiple reactive values into a single view model.

---

## defer() — Deferred Observable in combine()

**Source files:** [`packages/core/src/component.js`](../../packages/core/src/component.js#L58-L60), [`packages/core/src/observable.js`](../../packages/core/src/observable.js#L353-L363), [`packages/core/src/jsx.d.ts`](../../packages/core/src/jsx.d.ts#L21-L24)

`defer(value)` wraps an observable so that `combine()` treats it as a **nested observable** rather than resolving its value:

```tsx
import { combine, defer, state } from "@jsxrx/core"
import { map, switchMap } from "rxjs"

const count$ = state(0)
const countDeferred$ = defer(count$)

// With defer, combine() emits the observable itself (count$)
// Without defer, combine() would resolve count$ to its current number value
const result$ = combine({
  count: countDeferred$, // → Observable<number> (not number)
  label: "The count is",
}).pipe(
  switchMap(({ count }) => count.pipe(map(c => `${c} items`))),
)
```

### When to Use `defer()`

Use `defer()` when you need to pass an entire observable **as a value** through `combine()`. This is useful when:

- A downstream consumer needs to subscribe to the observable itself (e.g., passing a stream to a child component)
- You want to use `switchMap` to switch to the latest inner observable
- The observable identity must be preserved rather than resolved

### Interface

```ts
interface IDeferred<T> {
  kind: "stream"
  value$: Observable<T>
}
```

The `kind: "stream"` discriminator tells `combine()` to emit `value$` as-is rather than subscribing to it.

---

## activity() / toActivityAware() — Tracking Async Operations

**Source files:** [`packages/core/src/observable.js`](../../packages/core/src/observable.js#L85-L134), [`packages/core/src/observable.js`](../../packages/core/src/observable.js#L425-L472)

These utilities create `ActivityAwareObservable` instances — observables with a built-in `.pending$` property for tracking loading state.

### activity()

`activity()` creates a lightweight pending tracker:

```tsx
import { activity } from "@jsxrx/core"
import { switchMap, of, delay } from "rxjs"

function DataLoader() {
  const { pending$, start, complete, toObservable } = activity()

  const data$ = toObservable(
    of("loaded").pipe(
      delay(1000), // simulate async work
      start,       // sets pending$ to true when subscribed
      complete,    // sets pending$ to false when value emits
    ),
  )

  return (
    <>
      <p>Loading: {pending$}</p>
      <p>Data: {data$}</p>
    </>
  )
}
```

**Returns:**

| Property       | Type                     | Description                                          |
|----------------|--------------------------|------------------------------------------------------|
| `pending$`     | `Observable<boolean>`    | Emits `true` while active, `false` when idle         |
| `start`        | `tap` operator           | Sets `pending$` to `true` on subscribe               |
| `complete`     | `tap` operator           | Sets `pending$` to `false` on next/error/complete    |
| `toObservable` | function                 | Wraps an observable into an `ActivityAwareObservable` |

### toActivityAware()

`toActivityAware(attacher)` wraps an observable and makes it activity-aware by tracking nested async state automatically:

```tsx
import { toActivityAware } from "@jsxrx/core"
import { map, from } from "rxjs"

const data$ = toActivityAware(attach =>
  from(fetch("/api/data")).pipe(
    map(response => response.json()),
  ),
)

// data$ has a .pending$ property
// data$.pending$ emits true while fetching, false when done
```

The `attach` callback is called with each source observable. If the source is already activity-aware (has its own `.pending$`), the pending state propagates — nested activity-aware observables automatically chain their loading state to the parent.

### ActivityAwareObservable

`ActivityAwareObservable` extends `Observable` and preserves `.pending$` through `.pipe()`:

```ts
class ActivityAwareObservable<T> extends Observable<T> {
  pending$: Observable<boolean>

  pipe(...operators): ActivityAwareObservable<R>
  subscribe(...args): Subscription
}
```

Any `.pipe()` call on an `ActivityAwareObservable` returns a new `ActivityAwareObservable` with the same `pending$`, so the loading state follows the derived observable.

---

## pending() — Deriving Loading State

**Source files:** [`packages/core/src/observable.js`](../../packages/core/src/observable.js#L407-L423)

`pending(value, debounce?)` extracts a loading state observable from various async constructs:

```tsx
import { pending } from "@jsxrx/core"

const isPending$ = pending(data$)

function MyComponent() {
  return (
    <>
      {isPending$.pipe(
        map(loading =>
          loading ? <Spinner /> : <DataView />,
        ),
      )}
    </>
  )
}
```

### Overloads

`pending()` handles three types of input:

1. **`AsyncState<T>`** — extracts `.pending$` with `debounceTime(5)`
2. **`ActivityAwareObservable<T>`** — extracts `.pending$` with `debounceTime(5)`
3. **Raw observable** — maps each emission: if the emitted value is a `PendingState`, returns `true` for `state === "pending"`; otherwise returns `false`

```ts
// Signature
function pending(value: Observable<unknown> | AsyncState<unknown>, debounce?: number): Observable<boolean>
```

The optional `debounce` parameter (default: `5` for activity-aware observables, `1` for raw observables) prevents flickering during rapid state transitions.

---

## emitter() — Decoupled Event Emission

**Source files:** [`packages/core/src/component.js`](../../packages/core/src/component.js#L43-L51), [`packages/core/src/jsx.d.ts`](../../packages/core/src/jsx.d.ts#L39-L51)

`emitter(value$)` creates an object with an `.emit(...args)` method that always invokes the **latest callback function** emitted by the observable. This solves the problem of callbacks changing over time without stale closures or re-subscriptions:

```tsx
import { emitter, Props } from "@jsxrx/core"

function Form(props$: Observable<{ onSubmit: (data: FormData) => void }>) {
  const { onSubmit$ } = Props.take(props$)
  const submitEmitter = emitter(onSubmit$)

  function handleSubmit() {
    submitEmitter.emit({ name: "John" })
  }

  return <button onClick={handleSubmit}>Submit</button>
}
```

### How It Works

1. `emitter()` creates the emitter wrapper without subscribing.
2. When `.emit(...args)` is called, it uses `lastValueFrom(value$.pipe(take(1)))` to resolve the latest callback from the observable, then invokes it with the provided arguments.
3. Because the observable always provides the current callback, `.emit()` never captures a stale reference.

### Interfaces

```ts
interface Emitter<T extends Fn> {
  emit: AsyncFn<T>                     // always expects a callback to be available
}

interface OptionalEmitter<T extends Fn> {
  emit: AsyncFn<(...args: Parameters<T>) => ReturnType<T> | undefined>
}
```

- **`Emitter<T>`** — created when the observable emits a non-nullable function type. `.emit()` awaits the callback and returns its result.
- **`OptionalEmitter<T>`** — created when the observable type includes `null | undefined`. `.emit()` may resolve to `undefined` if no callback is currently available.

### Why emitter() Instead of a Direct Callback

Without `emitter()`, you would need to subscribe to the callback observable and manually store the latest value:

```tsx
// Manual approach — error-prone
let latestSubmit: ((data: FormData) => void) | null = null
onSubmit$.subscribe(fn => { latestSubmit = fn })

function handleSubmit() {
  latestSubmit?.({ name: "John" })
}
```

`emitter()` encapsulates this pattern cleanly and handles the async edge case where the callback may not be immediately available.

---

## Comparison with React

| Concept            | React                                   | JsxRx                                              |
|--------------------|-----------------------------------------|----------------------------------------------------|
| **State creation** | `useState(initial)` → `[value, setter]` | `state(initial)` → `{ value, set }` (extends Observable) |
| **Derived state**  | `useMemo(() => ..., [deps])`            | `source$.pipe(map(...))`                           |
| **Side effects**   | `useEffect(() => ..., [deps])`          | `source$.subscribe(...)` or RxJS operators         |
| **Callbacks**      | `useCallback(fn, [deps])`               | `emitter(callback$)` — no wrappers needed          |
| **DOM references** | `useRef()`                              | `ref()` (see JSX in Depth)                         |
| **Re-renders**     | Full component re-run                   | Specific DOM nodes subscribed to observables update |
| **Dependency array** | Manual (can cause stale closures)    | Automatic (RxJS tracks the observable graph)       |

- **No re-renders**: When a `state()` cell changes, only the DOM nodes that subscribe to that exact observable are updated. The component function does not re-execute.
- **No dependency arrays**: RxJS automatically tracks which observables a derivation depends on. There is no equivalent of `useEffect`'s dependency list to maintain.
- **No `useCallback` / `useMemo`**: Since components run once and never re-render, function references and computed values are naturally stable. Use `pipe(map(...))` for derived values and `emitter()` for reactive callbacks.
- **Derived state is just `pipe(map(...))`**: No need for `useMemo`. The `ObservableDelegate` automatically appends `shareReplay({ refCount: true, bufferSize: 1 })` to every piped observable, caching the last value and sharing the subscription.

---

## Source Files Referenced

| Concept                       | Source File                                                       |
|-------------------------------|-------------------------------------------------------------------|
| `state()`, `emitter()`, `defer()` | [`packages/core/src/component.js`](../../packages/core/src/component.js) |
| `State`, `combine`, `Defer`, `activity`, `toActivityAware`, `pending` | [`packages/core/src/observable.js`](../../packages/core/src/observable.js) |
| `IState<T>`, `IDeferred<T>`, `Emitter<T>`, `CombineOutput<T>` | [`packages/core/src/jsx.d.ts`](../../packages/core/src/jsx.d.ts) |
