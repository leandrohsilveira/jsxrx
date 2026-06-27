# Observable Reactivity

JsxRx's reactivity model is fundamentally different from other JSX-based frameworks. Instead of relying on a framework-controlled re-render loop (like React's state-setter → re-render cycle) or a compiler-driven reactivity graph (like Solid's signals), JsxRx puts **RxJS Observables** directly in charge of all DOM updates. Components are not re-run — Observables are.

---

## Table of Contents

1. [Observable-Driven Reactivity](#observable-driven-reactivity)
2. [Components Never Re-render](#components-never-re-render)
3. [JSX Reconciliation Is Triggered by Observables](#jsx-reconciliation-is-triggered-by-observables)
4. [How Reconciliation Works](#how-reconciliation-works)
5. [Observable Patterns in JSX](#observable-patterns-in-jsx)
6. [The ObservableDelegate Class](#the-observabledelegate-class)
7. [The Input Class: Component Props as Observables](#the-input-class-component-props-as-observables)
8. [The State Class: Mutable Observable Values](#the-state-class-mutable-observable-values)
9. [Batch Rendering](#batch-rendering)
10. [Key Takeaway](#key-takeaway)

---

## Observable-Driven Reactivity

In JsxRx, **RxJS Observables are the sole source of reactivity**. The framework does not maintain its own reactivity graph, scheduling queue, or virtual DOM diffing loop. Instead:

- **Components never re-render**: The component function is executed exactly once when the component is mounted. It only re-executes when the component is unmounted and mounted again (or when the component function itself is replaced by a different function — for example, during HMR or conditional rendering with a different component type).
- **JSX reconciliation is triggered by observables**: Only observables embedded in JSX trigger DOM updates when they emit new values.
- **The developer has full control of re-renders**: By choosing where to embed observables in JSX, the developer controls exactly which parts of the DOM tree update, with surgical precision. There are no dependency arrays, no `useMemo`/`useCallback` wrappers, and no implicit re-renders.

This model can be summarized as: **RxJS owns the values; JsxRx owns the DOM projection of those values.**

### Contrast with Other Frameworks

| Framework   | Reactivity Source        | Component Execution Model                  |
|-------------|--------------------------|--------------------------------------------|
| React       | State setter (useState)  | Re-runs component function on state change |
| Solid       | Signals (compiler)       | Component runs once; effects re-run        |
| Vue         | ref() / reactive()       | Re-runs render function on dependency change |
| **JsxRx**   | **RxJS Observables**     | **Component runs once; observables update DOM** |

---

## Components Never Re-render

This is the most important mental model shift when working with JsxRx. A component function is **not a render function** — it is an **initialization function** that sets up an observable pipeline and returns a JSX tree. Let's look at the code to understand why.

Consider this component:

```jsx
import { state } from "@jsxrx/core"
import { map } from "rxjs"

function Counter() {
  const count$ = state(0)

  function increase() {
    count$.set(count$.value + 1)
  }

  function decrease() {
    count$.set(count$.value - 1)
  }

  return (
    <>
      <p>The count is: {count$}</p>
      {count$.pipe(
        map(count => {
          // This callback runs every time count$ emits.
          // When it returns new JSX, only this subtree reconciles.
          if (count % 2 === 0) return <p>The count is even</p>
          return <p>The count is odd</p>
        }),
      )}
      <p>This text never changes</p>
    </>
  )
}
```

### What Happens When `count$` Emits

1. **`<p>The count is: {count$}</p>`** — The `{count$}` expression embeds an Observable directly into JSX. At mount time, the renderer creates an `observableNode` (type `OBSERVABLE` in the VDOM) that subscribes to `count$`. Each time `count$` emits a new number, that text node is updated in the DOM. **Only that text node is touched.**

2. **`{count$.pipe(map(...))}`** — The `pipe(map(...))` expression creates a derived Observable that maps each count value to a JSX element. When `count$` emits, this derived Observable emits a new `<p>` element. The VDOM reconciles this subtree — if the new element is different (e.g., from "even" to "odd"), the DOM is patched. **Only this subtree is touched.**

3. **`<p>This text never changes</p>`** — This is a static `<p>` element with no embedded observables. It is created once at mount time and **never updated again** for the lifetime of the component. The VDOM ignores it during reconciliation because there is no observable node above it that would trigger a re-evaluation.

### The Component Function Runs Exactly Once

Under the hood, when JsxRx mounts a component, `createComponentNode` (in [`packages/core/src/vdom/vdom.js`](../../packages/core/src/vdom/vdom.js)) calls the component function exactly once:

```js
// Simplified from createComponentNode():
const render = node.component(input, {
  context: instance.context,
  subscription,
  mounted$: mounted$.asObservable(),
  unmounted$: mounted$.pipe(map(mounted => !mounted)),
})

content = createNode(renderer, node.id, render, instance)
```

When the parent re-renders and passes new props, `createComponentNode.update()` does **not** call the component function again. Instead, it simply pushes new props into the `props$` BehaviorSubject:

```js
// Simplified from createComponentNode.update():
props$.next(nextNode.props)
```

Any observable derived from `props$` (via `Input.take()` or `Input.spread()`) will automatically emit the new values, triggering reconciliation of the subtrees that depend on those props. The component function itself is never re-invoked.

The only exception is when the component's **identity** changes (e.g., `<OldComponent />` is replaced by `<NewComponent />`). In that case, the old component is unmounted (its subscription is cleaned up) and the new component function is called during a fresh mount.

---

## JSX Reconciliation Is Triggered by Observables

### The `observableNode` in the VDOM

When an Observable is found as a child in JSX, the renderer creates an **observable node** — a special VDOM node of type `"OBSERVABLE"` — via `createObservableNode()` (in [`packages/core/src/vdom/vdom.js`](../../packages/core/src/vdom/vdom.js)):

```js
// Simplified flow from createNode():
if (isObservable(node))
  return createObservableNode(renderer, `${parentId}:observable`, node, instance)
```

The observable node subscribes to the source Observable. Every emission triggers reconciliation of the subtree rooted at that node. The key design is that the `observableNode` acts as a **boundary**: only its subtree is reconciled; the rest of the component tree is completely unaware of the emission.

### Observable Recognition

JsxRx uses RxJS's `isObservable` function to detect observables. Any value that returns `true` from `isObservable(value)` and is not already a known VDOM render node type will be treated as an observable and wrapped in an `observableNode`. This includes:

- `State` instances (created via `state()`)
- `ObservableDelegate` instances (the result of `.pipe()` on any JsxRx observable)
- `Input` instances (component prop observables)
- Any plain RxJS Observable

### What Happens on Each Emission

When the source Observable emits, the `observableNode` receives the new value and determines what to do:

1. **If the emitted value is a primitive** (string, number, boolean, bigint): A text node is created or updated in the DOM. This is the case for `{count$}`.

2. **If the emitted value is a JSX element** (a render node): The new element is compared to the previous one using `compareRenderNode()`. If they differ, the old content is removed and the new content is placed in the DOM. This is the case for `{count$.pipe(map(c => <p>{c}</p>))}`.

3. **If the emitted value is `null` or `undefined`**: The content is removed from the DOM.

4. **If the emitted value is an Array**: A children list is created, and each child is reconciled individually with keyed diffing.

The subscription is managed via `switchMap` — if the `observableNode` receives a new Observable (e.g., if the parent expression changes from one observable to another), the old subscription is unsubscribed and a new one is created. This prevents leaks and ensures up-to-date bindings.

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

## Observable Patterns in JSX

JsxRx supports several patterns for embedding observables in JSX. All of these create `observableNode` boundaries in the VDOM.

### 1. Direct Embedding (Text Binding)

```jsx
<p>The count is: {count$}</p>
```

The Observable emits primitive values (string, number, boolean, bigint). Each emission updates the text content of the parent element's text node. **This is the most efficient pattern** — it only touches a single text node.

### 2. Conditional Rendering

Use `map` with a ternary to conditionally render content:

```jsx
{show$.pipe(
  map(show => show ? <VisibleContent /> : null)
)}
```

When `show$` emits `true`, the observable emits `<VisibleContent />` and the component mounts. When `show$` becomes `false`, it emits `null`, causing the previous content to be unmounted.

To toggle between two different views, return either element from the ternary:

```jsx
{condition$.pipe(
  map(ok => ok ? <SuccessView /> : <ErrorView />)
)}
```

When the condition changes, the `observableNode` reconciles the subtree. If the emitted JSX tree has a different root ID than the previous one, the old tree is unmounted and the new one is mounted.

> **Important:** Do not use `filter()` to hide content. `filter()` prevents the observable from emitting when the predicate is false — it suppresses downstream updates entirely, so previously rendered content stays visible in the DOM. Use `map(condition ? <Element /> : null)` instead.

### 3. List Rendering

```jsx
{items$.pipe(
  map(items => items.map(item => <Item key={item.id} data={item} />))
)}
```

The Observable emits an array, and the `map` callback produces an array of JSX elements. The array is treated as a children list, with each child reconciled by its `key` prop. Items with matching keys are updated in place; new items are inserted; removed items are unmounted.

For optimal performance with large lists, ensure each item has a stable, unique `key`.

### 4. Derived Values

```jsx
<p>Double: {count$.pipe(map(c => c * 2))}</p>
<p>Formatted: {date$.pipe(map(d => d.toLocaleDateString()))}</p>
```

Any RxJS operator can be used to derive values. The derived Observable emits transformed values, which are rendered as text. This keeps transformation logic in the Observable pipeline rather than in the component body.

### 5. Combining Multiple Observables

```jsx
import { combineLatest } from "rxjs"

{combineLatest([firstName$, lastName$]).pipe(
  map(([first, last]) => <p>Hello, {first} {last}!</p>)
)}
```

Use RxJS's `combineLatest` (or JsxRx's `combine()` utility) to merge multiple observables. The result emits whenever any source observable emits, triggering reconciliation of the combined subtree.

### 6. Dynamic Component Rendering

```jsx
{componentType$.pipe(
  map(Component => <Component propA={valueA$} propB={valueB$} />)
)}
```

The Observable emits a component function. Each emission creates a new component instance. If the component function changes, the old component is unmounted and the new one is mounted with fresh state. Props can themselves be observables, creating nested reactivity.

### 7. Observables as Element Props

```jsx
<div className={class$} style={style$}>
  {content$}
</div>
```

Observables can be passed directly as element props. The VDOM element node subscribes to each observable prop and updates the DOM attribute whenever the observable emits. This is handled in `createElementNode.updateProps()`.

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

## Key Takeaway

JsxRx gives you **precise control over what updates and when**. You decide the granularity of reactivity by choosing where to place observables in your JSX tree:

- Embed `{count$}` for text that should update → only that text node updates
- Embed `{count$.pipe(map(c => <ComplexTree />))}` for subtrees that should re-render → only that subtree reconciles
- Leave static content as plain JSX → it never updates

There are no magic re-renders, no dependency arrays to maintain, no `useMemo` or `useCallback` wrappers to prevent unnecessary work. The mental model is simple: **Observables produce values; JSX projects those values into the DOM. When an Observable emits, the DOM updates at exactly that projection point.**

This model is particularly powerful for applications with complex, independent data streams — real-time dashboards, collaborative editors, financial tickers, monitoring systems — where different parts of the UI update at different frequencies and from different sources. In JsxRx, each data stream maps cleanly to its own Observable, and each Observable drives its own DOM subtree, without interference.

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
