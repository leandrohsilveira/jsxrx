# Observables Internals

This document covers internal implementation details of JsxRx's observable reactivity system. It is intended for developers who want to contribute to JsxRx or understand its internals. Reading this is not necessary for using JsxRx in applications.

For the user-facing guide, see [Observables as the Source of Reactivity](../guide/03-observables.md).

---

## Table of Contents

1. [How Reconciliation Works](#how-reconciliation-works)
2. [The ObservableDelegate Class](#the-observabledelegate-class)
3. [The Input Class: Component Props as Observables](#the-input-class-component-props-as-observables)
4. [The State Class: Mutable Observable Values](#the-state-class-mutable-observable-values)
5. [Batch Rendering](#batch-rendering)

---

## How Reconciliation Works

JsxRx reconciliation is **minimalist and efficient**. Since observables drive updates, the framework only needs to reconcile when an observable emits — it never needs to traverse the entire component tree looking for changes.

### The Diffing Primitives

Reconciliation is built on two core comparison functions (defined in [`packages/core/src/vdom/render.js`](../../packages/core/src/vdom/render.js)):

#### `compareRenderNode(a, b)`

Compares two render nodes for equality:
1. Identity check (`a === b`)
2. Null check (if either is null, they're not equal)
3. Type check (both must be render nodes)
4. ID check (`a.id === b.id`)
5. Type discriminator check (`a.type === b.type`)
6. Delegates to the node's `compareTo()` method

#### `compareProps(a, b)`

Compares two props objects:
1. Uses `shallowComparator` with a custom equality function
2. For render nodes found in props (e.g., `children`), calls `compareRenderNode`
3. For arrays of render nodes, compares each element pairwise

### Reconciliation Flow

When an `observableNode` receives a new value:

1. **ID-based identity**: The new render node's ID is compared to the current node's ID. If the IDs match, the existing VDOM node is **updated in place** via `node.update(nextNode)`. This is the fast path — only properties and children that changed are applied to the DOM.

2. **ID mismatch**: If the IDs differ, the old content is **unmounted** (subscription cleaned up, DOM nodes removed) and a new VDOM node is created from scratch via `createNode()`.

3. **Children reconciliation**: For arrays of children, a keyed diffing algorithm walks both the old and new child lists:
   - Matching IDs → update in place
   - New ID not in old list → create and insert
   - Old ID not in new list → unmount and remove
   - Both exist but mismatched → swap (remove old, place new)

### Suspension During Reconciliation

While an `observableNode` is processing an emission (i.e., the source Observable has started emitting but the derived value hasn't settled yet), the node signals to its parent `Suspense` boundary that it is **pending**. This allows the parent to show a fallback UI if configured. The pending state is tracked via `BehaviorSubject` and resolved once the emission completes.

---

## The ObservableDelegate Class

**Source:** [`packages/core/src/observable.js`](../../packages/core/src/observable.js)

`ObservableDelegate` is the base class for all JsxRx observables. It extends RxJS's `Observable` class and wraps an internal "delegate" Observable. Its key behavior is in the `pipe()` method:

```js
pipe(...operators) {
  return new ObservableDelegate(
    this.#delegate.pipe(
      ...operators,
      shareReplay({ refCount: true, bufferSize: 1 }),
    ),
    this.source,
  )
}
```

Every time `.pipe()` is called on an `ObservableDelegate`, the resulting Observable is automatically:
1. Wrapped in a new `ObservableDelegate` (preserving the chain identity)
2. Appended with `shareReplay({ refCount: true, bufferSize: 1 })` at the end of the operator chain

### Why `shareReplay` Matters

`shareReplay({ refCount: true, bufferSize: 1 })` serves two critical purposes:

1. **Multicasting**: Without `share`, each subscriber to a cold Observable would trigger a separate execution of the source. With `shareReplay`, multiple subscribers share a single execution, and late subscribers receive the most recent value immediately.

2. **Reference counting**: `refCount: true` means the shared subscription is automatically cleaned up when the last subscriber unsubscribes. This prevents memory leaks when components are unmounted.

3. **Buffering the latest value**: `bufferSize: 1` ensures that any new subscriber receives the most recently emitted value immediately, preventing the "missed emission" problem.

### Class Hierarchy

```text
Observable (RxJS)
  └── ObservableDelegate
        ├── State          (mutable state with .value and .set())
        ├── Input          (component props as observable)
        └── ObservableDelegate  (result of any .pipe() call)
```

Every observable in a JsxRx application is an instance of `ObservableDelegate` (or its subclass `State` or `Input`), ensuring consistent multicast behavior throughout the Observable chain.

---

## The Input Class: Component Props as Observables

**Source:** [`packages/core/src/observable.js`](../../packages/core/src/observable.js) (line 140–302)

`Input` extends `ObservableDelegate` and represents a component's props as an Observable stream. It is automatically instantiated when a component is mounted.

### How Input Works

When `createComponentNode` mounts a component, it creates an `Input` instance:

```js
const props$ = new BehaviorSubject(node.props)  // initial props
const input = new Input(props$, instance)        // wraps props in Input
```

The `Input` constructor:
1. Pipes the raw `props$` through `debounceTime(1)` (coalesces rapid prop updates)
2. Uses `switchMap` to flatten each prop that is itself an Observable
3. Applies `distinctUntilChanged(compareProps)` to avoid re-emitting identical props
4. Creates an `unmounted$` Observable that emits `true` when the component unmounts

### Accessing Props with `Input.take()`

`Input.take()` returns a Proxy object where each property access returns an Observable of that prop's values:

```jsx
function Greeting(input$) {
  const { name$, greeting$ } = Input.take(input$)  // Proxy with $ suffix

  return <p>{greeting$}, {name$}!</p>
}
```

Properties accessed via the Proxy have `$` appended to their names (the "suffix" naming strategy), making it clear they are Observables. Each property Observable:
- Flattens nested Observables automatically
- Provides the default value when the prop is `undefined`
- Is `distinctUntilChanged` so it only emits on actual value changes

### Accessing Props with `Input.spread()`

`Input.spread()` returns an Observable that emits an object where each key is an Observable of that prop's value:

```jsx
function Profile(input$) {
  const props$ = Input.spread(input$)  // Observable<{ name: Observable<string>, ... }>

  return props$.pipe(
    map(({ name, avatar }) => (
      <div>
        <span>{name}</span>
        <img src={avatar} />
      </div>
    ))
  )
}
```

This is useful when you need to react to the set of available prop keys changing (e.g., conditional props).

### Lifecycle Management

The `Input` instance has an `observe(subscription)` method that ties external subscriptions to the component's lifecycle. When the component unmounts, all observed subscriptions are automatically cleaned up.

---

## The State Class: Mutable Observable Values

**Source:** [`packages/core/src/observable.js`](../../packages/core/src/observable.js) (line 309–330)

`State` extends `ObservableDelegate` and provides a **writable observable** — the JsxRx equivalent of React's `useState` or Solid's `createSignal`.

### API

```js
import { state } from "@jsxrx/core"

const count$ = state(0)

count$.value    // → 0 (get the current value synchronously)
count$.set(1)   // emits 1 to all subscribers
count$.value    // → 1
```

Under the hood, `State` wraps a `BehaviorSubject`:

```js
export class State extends ObservableDelegate {
  #value$  // BehaviorSubject<T>

  constructor(value$) {
    super(value$.asObservable(), value$.asObservable())
    this.#value$ = value$
  }

  get value() {
    return this.#value$.value     // synchronous access to current value
  }

  set(value) {
    this.#value$.next(value)      // emits to all subscribers
  }
}
```

### Usage Patterns

**Simple counter:**
```jsx
function Counter() {
  const count$ = state(0)
  return (
    <>
      <p>{count$}</p>
      <button onClick={() => count$.set(count$.value + 1)}>+</button>
    </>
  )
}
```

**Derived state:**
```jsx
function Temperature() {
  const celsius$ = state(25)
  const fahrenheit$ = celsius$.pipe(map(c => c * 9/5 + 32))

  return <p>{celsius$}°C = {fahrenheit$}°F</p>
}
```

**Object state with immutable updates:**
```jsx
function Form() {
  const form$ = state({ name: "", email: "" })

  function updateName(name) {
    form$.set({ ...form$.value, name })
  }

  return <input value={form$.pipe(map(f => f.name))} onInput={e => updateName(e.target.value)} />
}
```

### Important: `.value` Reads the Current Snapshot

`count$.value` reads the value synchronously from the underlying `BehaviorSubject`. This is useful in event handlers where you need the current value to compute the next value. Unlike React, there is no stale closure problem because the value is always current.

---

## Batch Rendering

**Source:** [`packages/core/src/vdom/batch-renderer.js`](../../packages/core/src/vdom/batch-renderer.js)

JsxRx includes a `BatchRenderer` that collects DOM mutations over a configurable time window and applies them in batches. This is important because multiple observables can emit within the same synchronous tick, and applying each mutation individually would be wasteful.

The `BatchRenderer`:
1. Intercepts `place`, `remove`, and `move` operations
2. Buffers them for the configured `batchTime` (e.g., 16ms for 60fps)
3. Deduplicates operations (e.g., a node that was both placed and removed in the same batch is optimized out)
4. Applies the remaining operations to the real DOM renderer

This means that even if 50 observables emit simultaneously, the DOM is updated at most once per batch window. Combined with the `shareReplay({ refCount: true, bufferSize: 1 })` behavior of `ObservableDelegate`, this provides automatic batching without developer intervention.

---

## Source Files Referenced

| Concept | Source File |
|---------|-------------|
| Component mounting & props | [`packages/core/src/component.js`](../../packages/core/src/component.js) |
| ObservableDelegate, State, Input | [`packages/core/src/observable.js`](../../packages/core/src/observable.js) |
| VDOM node creation & reconciliation | [`packages/core/src/vdom/vdom.js`](../../packages/core/src/vdom/vdom.js) |
| Render node types & comparison | [`packages/core/src/vdom/render.js`](../../packages/core/src/vdom/render.js) |
| Batch rendering | [`packages/core/src/vdom/batch-renderer.js`](../../packages/core/src/vdom/batch-renderer.js) |
| VDOM type constants | [`packages/core/src/constants/vdom.js`](../../packages/core/src/constants/vdom.js) |
