# Activity-Aware & Suspense Internals

This document covers internal implementation details of JsxRx's activity tracking system (ActivityAwareObservable) and Suspense boundary mechanics. It is intended for developers who want to contribute to JsxRx or understand its internals. Reading this is not necessary for using JsxRx in applications.

For the user-facing guides, see [Suspending Unready Subtrees](../guide/06-suspense.md) and [Activity-Aware Suspense](../guide/08-activity-aware-suspense.md).

---

## Table of Contents

1. [ActivityAwareObservable Internals](#1-activityawareobservable-internals)
   - [The `ActivityAwareObservable` Class](#11-the-activityawareobservable-class)
   - [`activity()` — Imperative Tracker](#12-activity--imperative-tracker)
   - [`toActivityAware()` — Declarative Tracker](#13-toactivityaware--declarative-tracker)
   - [`pending()` — Deriving Loading State](#14-pending--deriving-loading-state)
2. [Suspense Internals](#2-suspense-internals)
   - [The `<Suspense>` Marker Component](#21-the-suspense-marker-component)
   - [SuspensionContext and SuspensionController](#22-suspensioncontext-and-suspensioncontroller)
   - [How Suspense Boundaries Are Created in the VDOM](#23-how-suspense-boundaries-are-created-in-the-vdom)
   - [Auto-Detection of Activity-Aware Observables](#24-auto-detection-of-activity-aware-observables)
   - [How `suspended$` Combines Manual + Auto-Detection](#25-how-suspended-combines-manual--auto-detection)
   - [Tolerance Debounce Implementation](#26-tolerance-debounce-implementation)
   - [Fallback/Children Swap Mechanics](#27-fallbackchildren-swap-mechanics)
   - [Nested Suspense Resolution](#28-nested-suspense-resolution)
   - [Observable Nodes and Their Pending Detection](#29-observable-nodes-and-their-pending-detection)
   - [`rawHtml()` and Suspense Integration](#210-rawhtml-and-suspense-integration)
3. [API Client Activity Awareness](#3-api-client-activity-awareness)
   - [`endpoint.fetch()` — Reactive Pipeline](#31-endpointfetch--reactive-pipeline)
   - [`endpoint.action()` — Imperative State Machine](#32-endpointaction--imperative-state-machine)

---

## 1. ActivityAwareObservable Internals

### 1.1 The `ActivityAwareObservable` Class

**Source file:** [`packages/core/src/observable.js`](../../packages/core/src/observable.js#L85-L134)

`ActivityAwareObservable` extends `Observable` and carries an additional `.pending$` property — a secondary `Observable<boolean>` that tracks whether an async operation is in-flight.

```js
// packages/core/src/observable.js (lines 85-134)
export class ActivityAwareObservable extends Observable {
  constructor(observable, pending$) {
    super()
    this.#delegate = observable
    this.operator = observable.operator
    this.pending$ = pending$
  }

  #delegate

  forEach(each) {
    return this.#delegate.forEach(each)
  }

  lift(operator) {
    return this.#delegate.lift(operator)
  }

  toPromise() {
    return this.#delegate.toPromise()
  }

  pipe(...operators) {
    return new ActivityAwareObservable(
      this.#delegate.pipe(
        ...operators,
        shareReplay({ refCount: true, bufferSize: 1 }),
      ),
      this.pending$,
    )
  }

  subscribe(...args) {
    return this.#delegate.subscribe(...args)
  }
}
```

**Key design decisions:**

- **`.pipe()` preserves `.pending$`:** The `pipe()` method on `ActivityAwareObservable` returns a *new* `ActivityAwareObservable` with the same `pending$` reference. This means any RxJS operator pipeline derived from an activity-aware source retains the loading signal. For example, `data$.pipe(map(...)).pending$` is the same `pending$` observable as `data$.pending$`.
- **No pending$ transformation through operators:** The `pending$` is passed through unchanged — it is not transformed by the pipe operators. This is intentional: the loading state is defined by the root observable's lifecycle, not by downstream transformations.
- **`shareReplay` is always appended:** Every `.pipe()` call on `ActivityAwareObservable` automatically appends `shareReplay({ refCount: true, bufferSize: 1 })`, caching the last emitted value and sharing subscriptions.
- **`#delegate` pattern:** The actual `Observable` implementation is stored in a private `#delegate` field. All `Observable` methods (`subscribe`, `forEach`, `lift`, `toPromise`, `pipe`) delegate to it. This allows `ActivityAwareObservable` to intercept `pipe()` while keeping the standard `Observable` contract.

---

### 1.2 `activity()` — Imperative Tracker

**Source file:** [`packages/core/src/observable.js`](../../packages/core/src/observable.js#L428-L471)

`activity()` creates a lightweight pending tracker backed by a `BehaviorSubject<boolean>`:

```js
// packages/core/src/observable.js (lines 428-471)
export function activity() {
  const pending$ = new BehaviorSubject(true)
  return {
    pending$: pending$.pipe(distinctUntilChanged()),
    start() {
      return tap({
        next: () => pending$.next(true),
        error: () => pending$.next(false),
        complete: () => pending$.next(false),
      })
    },
    complete() {
      return tap({
        next: () => pending$.next(false),
        error: () => pending$.next(false),
        complete: () => pending$.next(false),
      })
    },
    toObservable(observable) {
      return new ActivityAwareObservable(observable, pending$)
    },
    pipe(operator) {
      return pipe(this.start(), operator, this.complete())
    },
  }
}
```

**Return value:**

| Property       | Type                     | Description                                                     |
|----------------|--------------------------|-----------------------------------------------------------------|
| `pending$`     | `Observable<boolean>`    | Starts as `true`, emits `true` while active, `false` when idle. |
| `start()`      | factory → RxJS `tap` operator | Sets `pending$` to `true` on `next`.                            |
| `complete()`   | factory → RxJS `tap` operator | Sets `pending$` to `false` on `next`, `error`, or `complete`.   |
| `pipe(op)`     | function                 | Composes `start()`, the given operator, and `complete()`.       |
| `toObservable` | function                 | Wraps an observable into an `ActivityAwareObservable`.          |

**How `pending$` works:**

1. `pending$` is initialized to `new BehaviorSubject(true)` — meaning the tracker starts in the "pending" state by default.
2. The `start` operator is a `tap` that calls `pending$.next(true)` on `next`, setting the state back to pending whenever a new emission flows through.
3. The `complete` operator is a `tap` that calls `pending$.next(false)` on any terminal event (`next`, `error`, `complete`), marking the operation as complete.
4. The returned `pending$` is piped through `distinctUntilChanged()` to avoid redundant `true`/`false` toggles.

**Usage in an observable pipeline:**

```js
const tracker = activity()

const data$ = source$.pipe(
  tracker.start(),   // sets pending$ = true when subscribed
  switchMap(...),    // async work
  tracker.complete(), // sets pending$ = false when value arrives
)
```

The `start` operator should be placed before the async switch; the `complete` operator after it. This ensures `pending$` is `true` while the inner observable is active and `false` when it resolves.

---

### 1.3 `toActivityAware()` — Declarative Tracker

**Source file:** [`packages/core/src/observable.js`](../../packages/core/src/observable.js#L455-L472)

`toActivityAware(attacher)` creates an `ActivityAwareObservable` by wrapping an observable builder function. It automatically tracks pending state, including nested activity-aware observables:

```js
// packages/core/src/observable.js (lines 455-472)
export function toActivityAware(attacher) {
  const pending$ = new BehaviorSubject(false)

  return new ActivityAwareObservable(
    attacher(observable => {
      if (isActivityAwareObservable(observable)) {
        return new Observable(subscriber => {
          subscriber.add(observable.subscribe(subscriber))
          subscriber.add(observable.pending$.subscribe(pending$))
          return subscriber
        })
      }
      return observable
    }),
    pending$,
  )
}
```

**The `attach()` mechanism:**

1. `toActivityAware` creates its own `pending$` (`BehaviorSubject(false)` — starting as not-pending).
2. It passes an `attach` function to the `attacher` callback. The user calls `attach(someObservable)` for each source observable they want to track.
3. When `attach()` receives an observable:
   - **If the observable is `ActivityAwareObservable`:** It creates a new `Observable` that subscribes to both the observable's values (forwarded to the subscriber) and the observable's `pending$` (fed into the parent's `pending$`). This means **nested activity-aware observables automatically propagate their loading state**.
   - **If the observable is a plain `Observable`:** It is returned unchanged — no pending tracking for non-activity-aware sources.

4. The result is wrapped in a `new ActivityAwareObservable(...)` with the composite `pending$`.

**Nested propagation example:**

```js
const combined$ = toActivityAware(attach => {
  const users$ = toActivityAware(/* ... */)     // has its own pending$
  const settings$ = toActivityAware(/* ... */)  // has its own pending$
  return combineLatest({ users: attach(users$), settings: attach(settings$) })
})
// combined$.pending$ is true while either child is pending
```

This works recursively — if `users$` itself was composed with `toActivityAware` and internal `attach` calls, the pending signal propagates all the way up.

---

### 1.4 `pending()` — Deriving Loading State

**Source file:** [`packages/core/src/observable.js`](../../packages/core/src/observable.js#L407-L423)

`pending(value, debounce?)` extracts a loading `Observable<boolean>` from various async constructs. It has three overloads:

```js
// packages/core/src/observable.js (lines 407-423)
export function pending(value, debounce = 5) {
  if (isAsyncState(value)) {
    return value.pending$.pipe(debounceTime(debounce), distinctUntilChanged())
  }
  if (isActivityAwareObservable(value)) {
    return value.pending$.pipe(debounceTime(debounce), distinctUntilChanged())
  }
  return value.pipe(
    map(value => {
      if (isPendingState(value)) return value.state === "pending"
      return false
    }),
    debounceTime(1),
    startWith(false),
    distinctUntilChanged(),
  )
}
```

**Overloads:**

| Input Type                      | Behavior                                                             | Default Debounce |
|----------------------------------|----------------------------------------------------------------------|------------------|
| `AsyncState<T>`                  | Extracts `.pending$`, applies `debounceTime(debounce)`.              | `5` ms           |
| `ActivityAwareObservable<T>`     | Extracts `.pending$`, applies `debounceTime(debounce)`.              | `5` ms           |
| Raw `Observable<PendingState<T>>`| Maps each emission: `PendingState.state === "pending"` → `true`.     | `1` ms           |

**Debounce behavior:**

- For `AsyncState` and `ActivityAwareObservable`, the default debounce is `5`ms. This prevents rapid toggling when the `pending$` signal briefly flips. The `debounce` parameter overrides this.
- For raw observables (fallback path), the debounce is hardcoded to `1`ms regardless of the `debounce` parameter. This is because raw observables may not have a stable `pending$` signal and need a shorter window for responsiveness.
- The raw observable path also applies `startWith(false)`, ensuring the derived observable always starts as "not pending" even if the source hasn't emitted yet.

**Type guards used:**

```js
// packages/core/src/observable.js (lines 488-504)
export function isAsyncState(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    "kind" in value &&
    value.kind === "async" &&
    "state$" in value &&
    isObservable(value.state$)
  )
}

export function isActivityAwareObservable(observable) {
  return observable instanceof ActivityAwareObservable
}
```

The `isPendingState` guard (private, not exported) checks for the `PendingState` discriminated union shape:

```js
// packages/core/src/observable.js (lines 511-520)
function isPendingState(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    "state" in value &&
    typeof value.state === "string" &&
    /^idle|pending|success|error$/.test(value.state) &&
    "value" in value &&
    "error" in value
  )
}
```

---

## 2. Suspense Internals

### 2.1 The `<Suspense>` Marker Component

**Source file:** [`packages/core/src/suspense.js`](../../packages/core/src/suspense.js#L1-L19)

The `<Suspense>` component itself is a **lightweight marker** — it is a function component that always returns `null`. The real work happens in the JSX runtime and VDOM layer:

```js
// packages/core/src/suspense.js (lines 13-19)
export function Suspense(_) {
  return null
}
```

The JSX runtime intercepts `<Suspense>` tags during VDOM construction. When the VDOM builder encounters a `Suspense` component, it creates a `RenderSuspenseNode` instead of a regular component node:

```js
// packages/core/src/vdom/render.js (line 69)
return new RenderSuspenseNode(id, props, children, key)
```

The `RenderSuspenseNode` holds the parsed props (`fallback`, `tolerance`, `suspended`) and children:

```js
// packages/core/src/vdom/render.js (lines 217-248)
export class RenderSuspenseNode {
  constructor(id, { fallback, tolerance, suspended }, children, key) {
    this.id = id
    this.fallback = fallback
    this.children = children
    this.key = key
    this.tolerance = tolerance
    this.suspended = suspended
  }

  type = VDOMType.SUSPENSE

  compareTo(node) {
    if (node === null || node === undefined) return false
    if (node.id !== this.id) return false
    if (node.type !== VDOMType.SUSPENSE) return false
    if (node.tolerance !== this.tolerance) return false
    if (node.suspended !== this.suspended) return false
    if (!shallowComparator(node.fallback, this.fallback, compareRenderNode))
      return false
    return shallowComparator(node.children, this.children, compareRenderNode)
  }
}
```

The VDOM dispatcher routes `VDOMType.SUSPENSE` nodes to `createSuspenseNode()`:

```js
// packages/core/src/vdom/vdom.js (lines 96-108)
if (isRenderNode(node)) {
  switch (node.type) {
    case VDOMType.ELEMENT:
      return createElementNode(renderer, node, instance)
    case VDOMType.FRAGMENT:
      return createFragmentNode(renderer, node, instance)
    case VDOMType.COMPONENT:
      return createComponentNode(renderer, node, instance)
    case VDOMType.SUSPENSE:
      return createSuspenseNode(renderer, node, instance)
    case VDOMType.RAW_HTML:
      return createRawHtmlNode(renderer, node, instance)
  }
}
```

---

### 2.2 SuspensionContext and SuspensionController

**Source file:** [`packages/core/src/jsx.d.ts`](../../packages/core/src/jsx.d.ts#L66-L77)

Two types form the suspension protocol used throughout the VDOM:

```ts
// packages/core/src/jsx.d.ts
export type SuspensionController = {
  suspend(): void
  resume(): void
  downstream(): SuspensionController
  complete(): void
}

export type SuspensionContext = {
  suspended$: Observable<boolean>
  downstream(): SuspensionController
  complete(): void
}
```

**How they differ:**

- `SuspensionContext` is the **authoritative** object that owns the `suspended$` observable. It is created by `createSuspensionContext()` and held by the `Suspense` VNode.
- `SuspensionController` is a **capability** — a downstream-facing handle returned by `context.downstream()`. It has `suspend()`, `resume()`, `complete()`, and its own `downstream()` for further nesting, but no access to the authoritative `suspended$`.

This is a capability-security pattern: child nodes can report suspension activity, but they cannot read or manipulate the aggregate `suspended$` state of their ancestors.

**Implementation in `createSuspensionContext()`:**

```js
// packages/core/src/vdom/vdom.js (lines 1120-1155)
function createSuspensionContext() {
  const symbols = new Set()
  const control$ = new BehaviorSubject(symbols)

  return {
    suspended$: control$.pipe(
      map(suspensions => suspensions.size > 0),
      debounceTime(1),
      distinctUntilChanged(),
    ),
    downstream,
    complete() {
      symbols.clear()
      control$.complete()
    },
  }

  function downstream() {
    const symbol = Symbol()
    return {
      suspend() {
        symbols.add(symbol)
        control$.next(symbols)
      },
      resume() {
        symbols.delete(symbol)
        control$.next(symbols)
      },
      complete() {
        symbols.delete(symbol)
        control$.next(symbols)
      },
      downstream,
    }
  }
}
```

**How it works:**

1. A `Set<symbol>` holds one unique `Symbol()` per downstream consumer.
2. `suspended$` emits `true` when the set is non-empty, `false` when empty.
3. Each call to `downstream()` creates a new `Symbol`, adds/removes it from the set on `suspend()`/`resume()`, and exposes the same `downstream` function for further nesting.
4. The `control$` BehaviorSubject is updated with the **same Set reference** on every mutation — `distinctUntilChanged` in `suspended$` still works because the `map` produces a boolean, and `debounceTime(1)` coalesces rapid add/remove cycles.

---

### 2.3 How Suspense Boundaries Are Created in the VDOM

**Source file:** [`packages/core/src/vdom/vdom.js`](../../packages/core/src/vdom/vdom.js#L968-L1100)

`createSuspenseNode()` constructs a VNode that manages the lifecycle of a Suspense boundary:

```js
function createSuspenseNode(renderer, node, instance) {
  let children = null
  let fallback = null
  let current = null

  const suspendedProp$ = new BehaviorSubject(node.suspended)
  const context = createSuspensionContext()

  const suspended$ = combineLatest([
    suspendedProp$.pipe(
      switchMap(suspended => {
        if (isObservable(suspended)) return suspended
        return of(suspended)
      }),
    ),
    context.suspended$,
  ]).pipe(
    map(suspensions => suspensions.some(suspended => suspended)),
    distinctUntilChanged(),
  )

  const node$ = new Subject()
  const position$ = new Subject()
  const source$ = combineLatest({
    node: node$,
    position: position$,
  }).pipe(
    node.tolerance ? debounceTime(node.tolerance) : identity,
    distinctUntilChanged(
      (a, b) => a.node === b.node && a.position === b.position,
    ),
  )

  return {
    type: VDOMType.SUSPENSE,
    // ...
  }
}
```

**Lifecycle of a Suspense VNode:**

1. **`mount()`:** Creates two child VNodes — `fallback` (from `node.fallback`) and `children` (from `node.children`). Both are mounted. The `children` subtree receives a **downstream** suspension controller, so observable nodes inside the children can report pending state to this boundary.
2. **`update(nextNode)`:** Updates the `fallback` and `children` subtrees via their own `update()` methods, and pushes the new `suspended` prop value through `suspendedProp$`.
3. **`placeIn(position)`:** Pushes the position to a `position$` subject.
4. **`remove()`:** Pushes `null` to `node$` to trigger cleanup.

---

### 2.4 Auto-Detection of Activity-Aware Observables

The auto-detection works at two levels in the VDOM:

#### 2.4.1 Observable Nodes (Child Position)

When an observable is placed as a child node in JSX, it goes through `createObservableNode()`:

**Source file:** [`packages/core/src/vdom/vdom.js`](../../packages/core/src/vdom/vdom.js#L697-L831)

```js
function createObservableNode(renderer, parentId, input$, instance) {
  const selfPending$ = new BehaviorSubject(true)
  const inputPending$ = subject$.pipe(switchMap(input$ => pending(input$)))
  const pending$ = combineLatest([selfPending$, inputPending$]).pipe(
    map(pendings => pendings.some(pending => pending)),
    distinctUntilChanged(),
  )

  return {
    // ...
    mount() {
      // ...
      subscription.add(
        pending$.subscribe(isPending => {
          if (isPending) return instance.suspension.suspend()
          return instance.suspension.resume()
        }),
      )
      // ...
    },
  }
}
```

The observable node tracks **two** pending signals:
- `selfPending$`: Starts as `true` (the observable hasn't emitted its first value yet). Set to `false` when the first value arrives.
- `inputPending$`: Derived by calling `pending(input$)` on the observable itself. If the observable is `ActivityAwareObservable`, this extracts its `.pending$`. If it's a plain observable, it's the fallback path of `pending()`.

The combination (`some(pending => pending)`) ensures the boundary is suspended if either the node hasn't emitted yet OR the observable reports activity.

#### 2.4.2 Observable as Element Attribute

When an observable is used as an attribute value on an HTML element:

**Source file:** [`packages/core/src/vdom/vdom.js`](../../packages/core/src/vdom/vdom.js#L346-L368)

```js
// Inside createElementNode's updateProps():
if (isObservable(value)) {
  propsSuspensions[name] ??= instance.suspension.downstream()
  const suspension = propsSuspensions[name]
  subscriptions.suspensions[name]?.unsubscribe()

  if (isActivityAwareObservable(value)) {
    subscriptions.suspensions[name] = value.pending$
      .pipe(debounceTime(1), distinctUntilChanged())
      .subscribe(pending =>
        pending ? suspension.suspend() : suspension.resume(),
      )
  } else {
    subscriptions.suspensions[name] = value
      .pipe(
        map(() => false),
        startWith(true),
        debounceTime(1),
        distinctUntilChanged(),
      )
      .subscribe(pending =>
        pending ? suspension.suspend() : suspension.resume(),
      )
  }
}
```

**Two paths for attribute observables:**

- **`ActivityAwareObservable`:** Subscribes directly to `value.pending$`. When `pending$` emits `true`, it calls `suspension.suspend()` on a dedicated `SuspensionController` for that prop. When `false`, it calls `suspension.resume()`.
- **Plain observable:** Emits `true` initially (`startWith(true)`), then maps every emission to `false`. This means a plain observable on an attribute causes suspension until it emits its first value. After that, it never suspends again (unless the observable itself is replaced).

Each attribute gets its own `SuspensionController` via `propsSuspensions[name]` — this allows multiple attributes to independently report activity.

---

### 2.5 How `suspended$` Combines Manual + Auto-Detection

**Source file:** [`packages/core/src/vdom/vdom.js`](../../packages/core/src/vdom/vdom.js#L979-L990)

```js
const suspended$ = combineLatest([
  suspendedProp$.pipe(
    switchMap(suspended => {
      if (isObservable(suspended)) return suspended
      return of(suspended)
    }),
  ),
  context.suspended$,
]).pipe(
  map(suspensions => suspensions.some(suspended => suspended)),
  distinctUntilChanged(),
)
```

The final `suspended$` signal is a `combineLatest` of two sources:

| Source                | Type                                | Description                                        |
|-----------------------|-------------------------------------|----------------------------------------------------|
| `suspendedProp$`      | User-provided `suspended` prop      | Static `boolean` or `Observable<boolean>`.         |
| `context.suspended$`  | Auto-detected from subtree          | Emits `true` if any descendant reports pending.    |

**Resolution:** The boundary suspends if **either** source reports `true` (logical OR via `.some()`). This means:
- Manual `suspended={true}` forces the fallback regardless of auto-detection.
- Auto-detected pending activity triggers the fallback even if `suspended` is `false`.
- The `suspended` prop can be an `Observable<boolean>` — it's unwrapped via `switchMap`.

---

### 2.6 Tolerance Debounce Implementation

**Source file:** [`packages/core/src/vdom/vdom.js`](../../packages/core/src/vdom/vdom.js#L996-L1004)

```js
const source$ = combineLatest({
  node: node$,
  position: position$,
}).pipe(
  node.tolerance ? debounceTime(node.tolerance) : identity,
  distinctUntilChanged(
    (a, b) => a.node === b.node && a.position === b.position,
  ),
)
```

**How tolerance works:**

1. When the boundary switches from non-suspended to suspended, `suspended$` emits `true`, which triggers `node$.next(fallback)`.
2. This emission flows through `source$`, which applies `debounceTime(node.tolerance)` if `tolerance > 0`.
3. If the boundary switches back to non-suspended (children) within the tolerance window, the debounce discards the intermediate suspended emission.
4. The fallback is **never shown** — the children remain visible the entire time.

Without tolerance, a brief loading spike (e.g., a cached response) would flash the fallback and immediately replace it — creating a jarring visual flicker.

**Key detail:** The `identity` function (from RxJS) is used when `tolerance` is `0` or falsy, making the debounce a no-op. This avoids unnecessary timer creation for the common case of no tolerance.

---

### 2.7 Fallback/Children Swap Mechanics

**Source file:** [`packages/core/src/vdom/vdom.js`](../../packages/core/src/vdom/vdom.js#L1040-L1066)

```js
// In mount():
fallback = createNode(renderer, node.id, node.fallback, instance)
children = createNode(
  renderer,
  node.id,
  node.children,
  downstream(context),  // <-- children get the downstream suspension controller
)
subscription.add(fallback.mount())
subscription.add(children.mount())

// Subscribe to suspended$:
subscription.add(
  suspended$.pipe(distinctUntilChanged()).subscribe(suspended => {
    assert(
      fallback,
      "suspense node's fallback VDOM must not be null on suspend event",
    )
    assert(
      children,
      "suspense node's children VDOM must not be null on suspend event",
    )
    const next = suspended ? fallback : children
    node$.next(next)
  }),
)
```

**The swap process:**

1. **Both subtrees are always mounted.** Both `fallback` and `children` VNodes are created and mounted during the Suspense boundary's `mount()`. The `fallback` is created with the upstream `instance` (no special suspension controller). The `children` are created with a **downstream** suspension controller that reports to this boundary's context.
2. **Only one is placed in the DOM at a time.** When `suspended$` emits `true`, `node$.next(fallback)` places the fallback into the DOM. When `false`, `node$.next(children)` swaps it back.
3. **The swap is a DOM replacement.** The `source$` subscription in `mount()` listens for `node` changes. When the current node differs from the new one, it calls `current?.remove()` on the old node and `current.placeIn(position)` on the new one.
4. **Children remain active while suspended.** Both subtrees continue to receive updates via their own `update()` methods, even when hidden. This means observable subscriptions stay alive and state continues to update behind the scenes.

---

### 2.8 Nested Suspense Resolution

**Source file:** [`packages/core/src/vdom/vdom.js`](../../packages/core/src/vdom/vdom.js#L1094-L1099)

Each `<Suspense>` creates its own `SuspensionContext`. The children of a Suspense boundary receive a **downstream** controller that points into the boundary's own context:

```js
function downstream(context) {
  return {
    ...instance,
    suspension: context.downstream(),
  }
}
```

When this downstream controller's `downstream()` is called further (by a nested `<Suspense>` or by any observable/attribute node), it creates a **new symbol** in the parent boundary's set.

**Resolution order:**

1. An observable node in the innermost child calls `instance.suspension.suspend()`.
2. Its immediate `SuspensionController` adds its symbol to the **nearest ancestor** `Suspense` boundary's context (the `Set<symbol>` from `createSuspensionContext()`).
3. That boundary's `suspended$` emits `true`, and its fallback is shown.
4. The outer boundary is **not affected** — unless the inner boundary itself is suspended, the outer boundary's context has no symbols added by the inner boundary's children.

This means each boundary tracks only its direct subtree descendants. Nested boundaries are isolated — they create their own contexts that their respective children report into, not into their grandparent's context.

---

### 2.9 Observable Nodes and Their Pending Detection

**Source file:** [`packages/core/src/vdom/vdom.js`](../../packages/core/src/vdom/vdom.js#L710-L774)

When an observable is placed as a child in JSX (e.g., `{data$}` inside a JSX subtree), the VDOM creates an observable VNode:

```js
const selfPending$ = new BehaviorSubject(true)
const inputPending$ = subject$.pipe(switchMap(input$ => pending(input$)))
const pending$ = combineLatest([selfPending$, inputPending$]).pipe(
  map(pendings => pendings.some(pending => pending)),
  distinctUntilChanged(),
)
```

**Two pending signals:**

| Signal            | Source          | Starts As | Behavior                                                    |
|-------------------|-----------------|-----------|-------------------------------------------------------------|
| `selfPending$`    | The VNode itself | `true`    | Set to `false` when the observable emits its first value.   |
| `inputPending$`   | The observable   | Varies    | Calls `pending(input$)` on the inner observable.            |

- **While no value has been received:** `selfPending$` is `true`, so `pending$` emits `true` → `instance.suspension.suspend()`.
- **After first emission:** `selfPending$` becomes `false`. If the observable is an `ActivityAwareObservable` (e.g., from `endpoint.fetch()`), `inputPending$` still tracks its `.pending$` — so subsequent re-fetches continue to suspend the boundary.
- **If the observable changes** (e.g., a new observable is passed to an update), `subject$.next()` triggers a new `switchMap`, which resets `selfPending$` to `true` for the new subscription.

---

### 2.10 `rawHtml()` and Suspense Integration

**Source file:** [`packages/core/src/vdom/vdom.js`](../../packages/core/src/vdom/vdom.js#L1184-L1308)

The `rawHtml()` VNode also participates in suspension:

```js
const pending$ = new BehaviorSubject(true)

// In mount():
subscription.add(
  pending$
    .pipe(debounceTime(1), distinctUntilChanged())
    .subscribe(pending => {
      if (pending) instance.suspension.suspend()
      else instance.suspension.resume()
    }),
)
```

`pending$` starts as `true` (the raw HTML content hasn't been resolved yet) and emits `false` when the content arrives (in `subscribeContent()`):

```js
function subscribeContent(node) {
  let observable

  if (isObservable(node.content)) observable = node.content
  else if (node.content instanceof Promise) observable = from(node.content)
  else observable = of(node.content)

  return observable.pipe(distinctUntilChanged()).subscribe(raw => {
    content = raw
    if (content) nodes$.next(renderer.createElementsFromRaw(content))
    else nodes$.next([])
    pending$?.next(false)
  })
}
```

This means `rawHtml()` with a `Promise` or observable content will automatically suspend the nearest `<Suspense>` boundary until the content resolves.

---

## 3. API Client Activity Awareness

### 3.1 `endpoint.fetch()` — Reactive Pipeline

**Source file:** [`packages/api/src/api.js`](../../packages/api/src/api.js#L93-L110)

`endpoint.fetch(input$)` returns an `ActivityAwareObservable` by leveraging the `activity()` tracker:

```js
// packages/api/src/api.js (lines 93-110)
const { start, complete, toObservable } = activity()

return {
  send,
  fetch(input$) {
    return toObservable(
      input$.pipe(
        debounceTime(1),
        distinctUntilChanged(shallowComparator),
        start,
        switchMap(
          input => from(send(input)),
        ),
        complete,
        shareReplay({ bufferSize: 1, refCount: true }),
      ),
    )
  },
}
```

**Pipeline breakdown:**

| Step                    | Operator                | Effect                                                          |
|-------------------------|-------------------------|-----------------------------------------------------------------|
| 1. Coalesce             | `debounceTime(1)`       | Collapses rapid successive input emissions into one.            |
| 2. Deduplicate          | `distinctUntilChanged(shallowComparator)` | Ignores identical inputs using shallow comparison. |
| 3. Start tracking       | `start` (tap operator)  | Sets `pending$` to `true` when subscription begins.            |
| 4. Execute request      | `switchMap(input => from(send(input)))` | Cancels previous in-flight request, starts new one. |
| 5. Complete tracking    | `complete` (tap operator) | Sets `pending$` to `false` on next/error/complete.            |
| 6. Cache result         | `shareReplay({ bufferSize: 1, refCount: true })` | Replays last result to late subscribers. |

The `activity()` tracker is closed over at endpoint creation time (in `createEndpoint`), so **every `fetch()` call on the same endpoint shares the same `pending$` BehaviorSubject**. This means if multiple consumers call `endpoint.fetch()` with different inputs, they all share a single `pending$` — though in practice, each `fetch()` call creates its own `toObservable()` call, and the tracker instance is created once per endpoint.

**Key behavior:** The `start` operator is placed **before** `switchMap` and `complete` is placed **after**. This ensures `pending$` is `true` for the duration of the async request — from the moment the input triggers a switchMap until the inner observable completes.

---

### 3.2 `endpoint.action()` — Imperative State Machine

**Source file:** [`packages/api/src/api.js`](../../packages/api/src/api.js#L111-L152)

`endpoint.action()` returns an `Action<I, O>` that implements `AsyncState<O>`. It is backed by a `State<PendingState<O>>`:

```js
// packages/api/src/api.js (lines 111-152)
action() {
  const state$ = state({
    state: "idle",
    value: null,
    error: null,
  })
  return {
    kind: "async",
    state$: state$.pipe(debounceTime(1)),
    pending$: state$.pipe(
      debounceTime(1),
      map(state => state.state === "pending"),
      distinctUntilChanged(),
    ),
    value$: state$.pipe(
      debounceTime(1),
      filter(state => state.state === "success"),
      map(state => state.value),
    ),
    error$: state$.pipe(
      debounceTime(1),
      filter(state => state.state === "error"),
      map(state => state.error),
    ),
    reset() {
      state$.set({ state: "idle", value: null, error: null })
    },
    async perform(input) {
      try {
        state$.set({ state: "pending", value: null, error: null })
        const value = await send(input)
        state$.set({ state: "success", value, error: null })
        return value
      } catch (error) {
        state$.set({ state: "error", value: null, error })
        throw error
      }
    },
  }
}
```

**State machine lifecycle:**

```
  idle  ──perform()──▶  pending  ──resolve──▶  success
    ▲                      │
    │                      │ reject
    │                      ▼
    └─────reset()────   error
```

**Observable derivations:**

| Observable   | Derivation                         | Emits                                      |
|--------------|------------------------------------|--------------------------------------------|
| `state$`     | `state$.pipe(debounceTime(1))`     | Full `PendingState<Output>` on each change |
| `pending$`   | `state.state === "pending"`        | `true` during request, `false` otherwise   |
| `value$`     | Filter `state === "success"`       | The resolved value on success              |
| `error$`     | Filter `state === "error"`         | The error object on failure                |

All derived observables apply `debounceTime(1)` to coalesce rapid state transitions (e.g., `idle` → `pending` → `success` in quick succession).

**The `PendingState<Output>` discriminated union** (defined in `packages/core/src/jsx.d.ts`):

```ts
type PendingState<T> =
  | { state: "idle" | "pending"; value: null; error: null }
  | { state: "success"; value: T; error: null }
  | { state: "error"; value: null; error: unknown }
```

**Action vs. fetch — design distinction:**

| Aspect               | `fetch()`                          | `action()`                               |
|----------------------|------------------------------------|------------------------------------------|
| Paradigm             | Reactive (observable-driven)       | Imperative (promise-based `.perform()`)  |
| Return type          | `ActivityAwareObservable<Output>`   | `Action<Input, Output>` (implements `AsyncState`) |
| Re-trigger           | Auto on input$ emission            | Manual via `.perform()`                  |
| Cancellation         | Via `switchMap`                    | N/A (one-shot)                           |
| State machine        | Start/complete taps on observable  | Explicit `State<PendingState>`           |

---

## Source Files Referenced

| Concept                                  | Source File                                                       |
|------------------------------------------|-------------------------------------------------------------------|
| `ActivityAwareObservable` class          | [`packages/core/src/observable.js`](../../packages/core/src/observable.js) |
| `activity()`                             | [`packages/core/src/observable.js`](../../packages/core/src/observable.js) |
| `toActivityAware()`                      | [`packages/core/src/observable.js`](../../packages/core/src/observable.js) |
| `pending()`                              | [`packages/core/src/observable.js`](../../packages/core/src/observable.js) |
| `Suspense` component (marker)            | [`packages/core/src/suspense.js`](../../packages/core/src/suspense.js) |
| `RenderSuspenseNode`                     | [`packages/core/src/vdom/render.js`](../../packages/core/src/vdom/render.js) |
| `createSuspenseNode()` / Suspense VNode  | [`packages/core/src/vdom/vdom.js`](../../packages/core/src/vdom/vdom.js) |
| `createSuspensionContext()`              | [`packages/core/src/vdom/vdom.js`](../../packages/core/src/vdom/vdom.js) |
| `createObservableNode()`                 | [`packages/core/src/vdom/vdom.js`](../../packages/core/src/vdom/vdom.js) |
| `createElementNode()` (attribute suspense)| [`packages/core/src/vdom/vdom.js`](../../packages/core/src/vdom/vdom.js) |
| `createRoot()` (root suspension warning) | [`packages/core/src/vdom/vdom.js`](../../packages/core/src/vdom/vdom.js) |
| `createRawHtmlNode()` (rawHtml suspense) | [`packages/core/src/vdom/vdom.js`](../../packages/core/src/vdom/vdom.js) |
| `SuspensionContext` / `SuspensionController` types | [`packages/core/src/jsx.d.ts`](../../packages/core/src/jsx.d.ts) |
| `endpoint.fetch()`                       | [`packages/api/src/api.js`](../../packages/api/src/api.js) |
| `endpoint.action()`                      | [`packages/api/src/api.js`](../../packages/api/src/api.js) |
