# Components & State Management

JsxRx components and state management are built on a single foundation: **Observables**. A component is a function that returns JSX. State is a reactive cell you can read synchronously, set imperatively, and embed directly in your markup. There are no hooks, no dependency arrays, and no re-renders — just RxJS Observables driving precise DOM updates.

---

## Table of Contents

- [Components](#components)
- [State Management](#state-management)
  - [No Hooks — RxJS Operators](#no-hooks--rxjs-operators)
  - [state() — Reactive State Cell](#state--reactive-state-cell)
  - [Derived State](#derived-state)
  - [Object State with Immutable Updates](#object-state-with-immutable-updates)
  - [Quick Comparison with React](#quick-comparison-with-react)

---

## Components

A component in JsxRx is simply a function that returns JSX:

```tsx
function Greeting() {
  return <h1>Hello, world!</h1>
}
```

No decorators. No class extension. No hooks registration. Just a function that returns markup. Components can use state, derived observables, and other reactive primitives directly in their body — the function executes once, and updates flow through the observable graph to the DOM nodes that need them.

---

## State Management

### No Hooks — RxJS Operators

JsxRx has no equivalent to `useState`, `useMemo`, `useEffect`, or `useCallback`. All reactive behavior is expressed with standard RxJS operators:

```tsx
import { map } from "rxjs"
import { state } from "@jsxrx/core"

function Counter() {
  const count$ = state(0)

  // Derived state — just pipe through a map operator
  const doubled$ = count$.pipe(map(c => c * 2))

  return (
    <div>
      <p>Count: {count$}</p>
      <p>Doubled: {doubled$}</p>
    </div>
  )
}
```

A few things to notice:

- There are **no dependency arrays** anywhere. RxJS automatically tracks which source observables feed into a derivation. You never write `[dep1, dep2]`.
- **Function references are stable** because components run once. There is no need for `useCallback` — an event handler defined inside a component stays the same reference for the component's entire lifetime.
- **Derived state is just `.pipe(map(...))`**. There is no `useMemo` — the derivation is automatically shared and cached.

### `state()` — Reactive State Cell

`state(initialValue)` is the fundamental unit of local state in JsxRx. It creates a reactive cell wrapping an RxJS `BehaviorSubject`, and it returns an object that is both an Observable and provides synchronous read/write access:

```tsx
import { state } from "@jsxrx/core"

const count$ = state(0)

// Read the current value synchronously
console.log(count$.value) // 0

// Set a new value — emits to all subscribers
count$.set(5)
console.log(count$.value) // 5

// Subscribe to changes
count$.subscribe(value => console.log(value)) // logs 5
```

The `state()` return type is `IState<T>`, which extends `Observable<T>`:

```ts
interface IState<T> extends Observable<T> {
  value: T          // synchronous getter — always returns the latest value
  set(value: T): void  // pushes a new value, emits to all subscribers
}
```

Because `IState<T>` is an Observable, you can embed it directly in JSX:

```tsx
function Counter() {
  const count$ = state(0)

  return (
    <div>
      <p>{count$}</p>
      <button onClick={() => count$.set(count$.value + 1)}>
        Increment
      </button>
    </div>
  )
}
```

When `count$.set(...)` is called, the `<p>` element's text content updates immediately — and nothing else in the component re-runs.

**Key properties of `state()`:**

- **`.value`** always returns the latest snapshot. There is no stale closure problem because the getter reads from the underlying `BehaviorSubject` directly.
- **`.set(value)`** pushes a value through the stream. Every subscriber — including DOM bindings created by `{count$}` in JSX — receives the update.
- **Immutable updates required for objects**: when storing objects or arrays, pass a new reference so that change detection works correctly (see [Object State](#object-state-with-immutable-updates) below).

### Derived State

Derive new observables from `state()` cells using standard RxJS operators:

```tsx
import { state } from "@jsxrx/core"
import { map } from "rxjs"

function TemperatureConverter() {
  const celsius$ = state(25)

  // Derived: fahrenheit automatically recomputes when celsius$ changes
  const fahrenheit$ = celsius$.pipe(
    map(c => (c * 9) / 5 + 32)
  )

  return (
    <div>
      <p>
        {celsius$}°C = {fahrenheit$}°F
      </p>
      <button onClick={() => celsius$.set(celsius$.value + 1)}>
        Warmer
      </button>
    </div>
  )
}
```

Every `pipe(map(...))` call automatically benefits from subscription sharing and caching. Multiple subscribers to the same derived observable share a single subscription to the source, and the last emitted value is replayed to late subscribers.

### Object State with Immutable Updates

When your state is an object, always spread into a new reference when updating individual fields:

```tsx
function SignupForm() {
  const form$ = state({ name: "", email: "" })

  return (
    <div>
      <input
        placeholder="Name"
        value={form$.pipe(map(f => f.name))}
        onInput={e => form$.set({ ...form$.value, name: e.target.value })}
      />
      <input
        placeholder="Email"
        value={form$.pipe(map(f => f.email))}
        onInput={e => form$.set({ ...form$.value, email: e.target.value })}
      />
    </div>
  )
}
```

The spread pattern `{ ...form$.value, name: newValue }` creates a new object reference. This is important because JsxRx uses reference equality to detect changes — without a new reference, updates to individual fields may not trigger downstream emissions.

### Quick Comparison with React

If you are coming from React, here is how the core concepts map to JsxRx:

| Concept | React | JsxRx |
|---|---|---|
| State creation | `useState(initial)` → `[value, setter]` | `state(initial)` → `{ value, set }` |
| Derived state | `useMemo(() => ..., [deps])` | `source$.pipe(map(...))` |
| Side effects | `useEffect(() => ..., [deps])` | `source$.subscribe(...)` or RxJS operators |
| Callbacks | `useCallback(fn, [deps])` | Stable by default (component runs once) |
| Re-renders | Full component function re-executes | Specific DOM nodes subscribed to observables update |
| Dependency tracking | Manual (error-prone) | Automatic (RxJS tracks the observable graph) |

JsxRx eliminates re-renders entirely. When a state cell changes, only the DOM nodes bound to that specific observable are updated. The rest of the component tree — including sibling elements and unrelated branches — is untouched.

---

**Next**: [Observables as the Source of Reactivity](./03-observables.md)
