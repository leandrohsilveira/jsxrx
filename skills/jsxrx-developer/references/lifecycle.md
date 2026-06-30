## Lifecycle & Cleanup

Every JsxRx component receives a second parameter — the `Lifecycle` object — after `props$`. It provides subscription management, mount-state observables, and context access. Only destructure it when you need these features.

### The Lifecycle Type

```ts
interface Lifecycle {
  subscription: Subscription          // auto-cleanup on unmount
  mounted$: Observable<boolean>       // emits true once when mounted
  unmounted$: Observable<boolean>     // emits true once before unmount
  context: IContextMap                // imperative context API (set/require/optional)
}
```

Type-import it from `@jsxrx/core` and destructure in the component's second parameter:

```tsx
import type { Observable, Lifecycle } from "@jsxrx/core"

function MyComponent(
  props$: Observable<{ name: string }>,
  { subscription, mounted$, unmounted$, context }: Lifecycle,
) {
  // lifecycle members available via destructuring
  return <p>{/* ... */}</p>
}
```

> **Full API reference**: See [references/api-quick-ref.md](api-quick-ref.md) for core API signatures, types, and imports.

---

### subscription.add() — THE MANDATORY RULE

> ⚠️ **CRITICAL: Every manual `.subscribe()` call MUST be added to `subscription.add()`.**
>
> This is the **single most common memory leak** in JsxRx apps. JSX bindings (`{count$}`)
> clean themselves up automatically, but explicit `.subscribe()` calls have no automatic
> lifecycle management — without `subscription.add()`, they will run indefinitely even
> after the component unmounts.

**WRONG — memory leak:**

```tsx
import { state } from "@jsxrx/core"
import { interval, map } from "rxjs"

function Clock(props$: Observable<{}>) {
  const now$ = state(new Date().toLocaleTimeString())

  // ❌ LEAK: subscription continues even after Clock unmounts
  interval(1000).pipe(
    map(() => new Date().toLocaleTimeString()),
  ).subscribe(time => now$.set(time))

  return <p>{now$}</p>
}
```

**RIGHT — registered with subscription.add():**

```tsx
import { state } from "@jsxrx/core"
import { interval, map } from "rxjs"
import type { Observable, Lifecycle } from "@jsxrx/core"

function Clock(
  props$: Observable<{}>,
  { subscription }: Lifecycle,
) {
  const now$ = state(new Date().toLocaleTimeString())

  // ✅ Add to subscription — auto-cleaned on unmount
  subscription.add(
    interval(1000).pipe(
      map(() => new Date().toLocaleTimeString()),
    ).subscribe(time => now$.set(time)),
  )

  return <p>{now$}</p>
}
```

**Multiple subscriptions** — call `subscription.add()` multiple times; when the parent unsubscribes, all children are cleaned up together:

```tsx
function MultiSourceWidget(
  props$: Observable<{}>,
  { subscription }: Lifecycle,
) {
  subscription.add(sourceA$.subscribe(/* ... */))
  subscription.add(sourceB$.subscribe(/* ... */))
  subscription.add(sourceC$.pipe(debounceTime(300)).subscribe(/* ... */))

  return <div>{/* ... */}</div>
}
```

**Return-value style** — `subscription.add()` returns the subscription, so you can inline it:

```tsx
import { fromEvent } from "rxjs"

function MouseTracker(
  props$: Observable<{}>,
  { subscription }: Lifecycle,
) {
  const clicks = subscription.add(
    fromEvent(document, "click").subscribe(event => {
      console.log("click at", event.clientX, event.clientY)
    }),
  )

  return <p>Click anywhere — check the console</p>
}
```

---

### When Cleanup Is Automatic

You do **not** need `subscription.add()` for:

| Scenario | Explanation |
|---|---|
| Embedding an Observable in JSX (`{count$}`) | JsxRx's DOM renderer manages the subscription — it unsubscribes when the element is removed |
| `Props.take(props$)` result streams | These are derived synchronously and cleaned up when the component unmounts |
| `state()` cells | State cells are garbage-collected when no longer referenced |
| RxJS operators (`pipe`, `map`, `filter`, etc.) | Operators are just transformations applied to streams — they don't create subscriptions |

**Only explicit `.subscribe()` calls** — on raw observables, `fromEvent`, `interval`, `timer`, HTTP observables, etc. — need manual `subscription.add()`.

---

### mounted$ / unmounted$

`mounted$` and `unmounted$` are boolean Observables that indicate the current mount state of the component:

- **`mounted$`** — emits `true` once when the component is first mounted, then completes on unmount.
- **`unmounted$`** — emits `true` once just before the component unmounts, then completes.

Use `takeUntil(unmounted$)` to auto-complete any observable stream when the component unmounts:

```tsx
import { takeUntil, tap } from "rxjs"
import { Props } from "@jsxrx/core"
import type { Observable, Lifecycle } from "@jsxrx/core"

function SessionLogger(
  props$: Observable<{ sessionId: string }>,
  { subscription, unmounted$ }: Lifecycle,
) {
  const { sessionId$ } = Props.take(props$)

  subscription.add(
    sessionId$.pipe(
      tap(id => console.log("Session started:", id)),
      takeUntil(unmounted$),     // ✅ completes when component unmounts
    ).subscribe(),
  )

  return <div>{/* ... */}</div>
}
```

Combine `mounted$` and `unmounted$` for setup/teardown actions:

```tsx
function LifecycleDemo(
  props$: Observable<{}>,
  { subscription, mounted$, unmounted$ }: Lifecycle,
) {
  subscription.add(
    mounted$.pipe(tap(() => console.log("Mounted"))).subscribe(),
  )
  subscription.add(
    unmounted$.pipe(tap(() => console.log("Unmounted"))).subscribe(),
  )

  return <p>Check the console on mount/unmount</p>
}
```

---

### Omitting the Lifecycle Parameter

When you don't need subscription cleanup, mount-state observables, or context, simply omit the second parameter. TypeScript won't complain — unused parameters are optional in the component signature:

```tsx
import { state } from "@jsxrx/core"
import type { Observable } from "@jsxrx/core"

// ✅ No lifecycle parameter needed
function StaticComponent(props$: Observable<{ name: string }>) {
  const { name$ } = Props.take(props$)
  return <h1>Hello, {name$}</h1>
}
```

Only add the `Lifecycle` parameter when you actually need `subscription`, `mounted$`, `unmounted$`, or `context`.

---

### Destructuring Patterns

Destructure only the members you need:

```tsx
import type { Observable, Lifecycle } from "@jsxrx/core"

// Only subscription
function A(props$: Observable<P>, { subscription }: Lifecycle) {}

// Only mounted$
function B(props$: Observable<P>, { mounted$ }: Lifecycle) {}

// Only context
function C(props$: Observable<P>, { context }: Lifecycle) {}

// Subscription + unmounted$ (common pair)
function D(props$: Observable<P>, { subscription, unmounted$ }: Lifecycle) {}

// All four members
function E(props$: Observable<P>, { subscription, mounted$, unmounted$, context }: Lifecycle) {}

// Full lifecycle object (for passing to a helper)
function F(props$: Observable<P>, lifecycle: Lifecycle) {
  helperFunction(lifecycle)
}
```

> **Full API reference**: See [references/api-quick-ref.md](api-quick-ref.md) for core API signatures, types, and imports.
