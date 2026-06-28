# Lifecycle

Every JsxRx component receives a second parameter — the `Lifecycle` object — after the `props$` Observable. It provides utilities for managing subscriptions, tracking mount state, and accessing context. This chapter formally introduces each member of the `Lifecycle` type and shows practical patterns for using them.

---

## Table of Contents

1. [The Lifecycle Type](#the-lifecycle-type)
2. [subscription — Automatic Cleanup](#subscription--automatic-cleanup)
3. [mounted$ / unmounted$ — Lifecycle Observables](#mounted--unmounted--lifecycle-observables)
4. [context — Context API Access](#context--context-api-access)
5. [Declaring the Lifecycle Parameter](#declaring-the-lifecycle-parameter)

---

## The Lifecycle Type

The `Lifecycle` interface gives you three categories of utilities — subscription management, mount-state observables, and context access:

```ts
interface Lifecycle {
  subscription: Subscription           // auto-cleanup on unmount
  mounted$: Observable<boolean>        // emits true when mounted
  unmounted$: Observable<boolean>      // emits true before unmount
  context: IContextMap                 // context API (covered in next chapter)
}
```

Every component function receives this object as its second argument:

```tsx
import type { Observable, Lifecycle } from "@jsxrx/core"

function MyComponent(
  props$: Observable<{ name: string }>,
  lifecycle: Lifecycle,
) {
  // lifecycle.subscription, lifecycle.mounted$, etc.
  return <p>{/* ... */}</p>
}
```

In practice you almost always destructure the properties you need rather than using the full `lifecycle` object directly.

---

## subscription — Automatic Cleanup

`lifecycle.subscription` is an RxJS `Subscription` object. Any child subscription added to it is automatically unsubscribed when the component unmounts. This is the primary mechanism for preventing memory leaks from manual subscriptions.

### Basic Pattern

```tsx
import { state, Props } from "@jsxrx/core"
import type { Observable, Lifecycle } from "@jsxrx/core"

function Clock(
  props$: Observable<{}>,
  { subscription }: Lifecycle,
) {
  const now$ = state(new Date().toLocaleTimeString())

  // Add the subscription — auto-cleaned on unmount
  subscription.add(
    interval(1000).pipe(
      map(() => new Date().toLocaleTimeString()),
    ).subscribe(time => now$.set(time)),
  )

  return <p>{now$}</p>
}
```

Without `subscription.add(...)`, the `interval(1000).subscribe(...)` would continue running indefinitely even after `Clock` is removed from the DOM. By registering it with `subscription.add()`, the interval is torn down automatically when the component unmounts.

### Multiple Subscriptions

You can add multiple subscriptions to the same `subscription` object. Calling `subscription.add()` multiple times attaches each one; when the parent subscription is unsubscribed, all children are cleaned up together:

```tsx
function MultiSourceWidget(
  props$: Observable<{}>,
  { subscription }: Lifecycle,
) {
  subscription.add(sourceA$.subscribe(...))
  subscription.add(sourceB$.subscribe(...))
  subscription.add(sourceC$.pipe(debounceTime(300)).subscribe(...))

  return <div>{/* ... */}</div>
}
```

### Subscription as a Return Value

RxJS operators like `interval()` and `fromEvent()` return `Observable`, not `Subscription`. Calling `.subscribe()` returns a `Subscription` that you can pass directly to `subscription.add()`:

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

### When to Use subscription

| Scenario | Manual subscription cleanup needed |
|---|---|
| You call `.subscribe()` directly | ✅ Always use `subscription.add()` |
| You embed an Observable in JSX (`{name$}`) | ❌ Handled automatically |
| You use `Props.take()` or `state()` | ❌ No manual subscription needed |
| You call `fromRefEvent()` | ✅ Use `subscription.add()` for the subscription (see [Event Handling](./05-event-handling.md)) |

---

## mounted$ / unmounted$ — Lifecycle Observables

`mounted$` and `unmounted$` are boolean Observables that indicate the current mount state of the component:

- **`mounted$`** — emits `true` once when the component is first mounted. It completes when the component unmounts.
- **`unmounted$`** — emits `true` once just before the component unmounts, then completes.

Use these to gate subscriptions or side effects so they only run while the component is alive.

### Pattern: `takeWhile(() => mounted$)`

Because `mounted$` is an `Observable<boolean>`, you can combine it with `takeWhile` to keep a subscription active only while the component is mounted:

```tsx
import { takeWhile, map } from "rxjs"
import { state, Props } from "@jsxrx/core"
import type { Observable, Lifecycle } from "@jsxrx/core"

function AnalyticsTracker(
  props$: Observable<{ pageId: string }>,
  { subscription, mounted$ }: Lifecycle,
) {
  const { pageId$ } = Props.take(props$)

  // Track page views only while the component is mounted
  subscription.add(
    pageId$.pipe(
      takeWhile(() => mounted$),
      tap(pageId => analytics.track("page_view", { pageId })),
    ).subscribe(),
  )

  return <div>{/* ... */}</div>
}
```

### Pattern: `takeUntil(unmounted$)`

`takeUntil(unmounted$)` is a cleaner alternative — the stream stays active until the component unmounts, at which point `takeUntil` completes it automatically:

```tsx
import { takeUntil, tap } from "rxjs"
import { state, Props } from "@jsxrx/core"
import type { Observable, Lifecycle } from "@jsxrx/core"

function SessionLogger(
  props$: Observable<{ sessionId: string }>,
  { subscription, unmounted$ }: Lifecycle,
) {
  const { sessionId$ } = Props.take(props$)

  subscription.add(
    sessionId$.pipe(
      tap(id => console.log("Session started:", id)),
      takeUntil(unmounted$),
    ).subscribe(),
  )

  return <div>{/* ... */}</div>
}
```

### When to Prefer Each Pattern

| Pattern | Best for |
|---|---|
| `takeUntil(unmounted$)` | Most use cases — clean, declarative, completes automatically |
| `takeWhile(() => mounted$)` | When you need additional dynamic conditions beyond mount state |
| `subscription.add(...)` alone | Simple subscriptions that don't need mount-state gating |

### Example: Component Lifecycle Tracking

Combine `mounted$` and `unmounted$` to perform setup and teardown actions:

```tsx
function LifecycleDemo(
  props$: Observable<{}>,
  { subscription, mounted$, unmounted$ }: Lifecycle,
) {
  // Log mount event
  subscription.add(
    mounted$.pipe(
      tap(() => console.log("Component mounted")),
    ).subscribe(),
  )

  // Log unmount event
  subscription.add(
    unmounted$.pipe(
      tap(() => console.log("Component unmounted")),
    ).subscribe(),
  )

  return <p>Check the console on mount/unmount</p>
}
```

---

## context — Context API Access

The `context` property on `Lifecycle` provides access to JsxRx's Context API — a reactive key–value store that flows through the component tree.

This is a brief teaser; the full Context API is covered in the next chapter.

```ts
interface IContextMap {
  set<T>(context: IContext<T>, value$: Observable<T>): void
  require<T extends IContext<any>>(context: T): Observable<T["initialValue"]>
  optional(context: Context<T>): Observable<T>
  downstream(): IContextMap
}
```

- **`context.set(key, value$)`** — registers a context value for all descendant components.
- **`context.require(key)`** — reads a context value, throwing if none was set by an ancestor.
- **`context.optional(key)`** — reads a context value, falling back to the context's `initialValue`.
- **`context.downstream()`** — creates a scoped child context that inherits from the parent.

Every context value is an **Observable**, making all consumers inherently reactive from the ground up.

For full details with examples, see the [next chapter](./10-context.md).

---

## Declaring the Lifecycle Parameter

You can declare the second parameter in several ways depending on which `Lifecycle` members you need.

### Full Parameter with Destructuring

The most common pattern — destructure only the members you use:

```tsx
import type { Observable, Lifecycle } from "@jsxrx/core"

function MyComponent(
  props$: Observable<{ name: string }>,
  { subscription, mounted$ }: Lifecycle,
) {
  // subscription and mounted$ are available
  return <p>{/* ... */}</p>
}
```

### Full `lifecycle` Object

When you need to pass the entire `Lifecycle` to a helper function or store it:

```tsx
function MyComponent(
  props$: Observable<{ name: string }>,
  lifecycle: Lifecycle,
) {
  helperFunction(lifecycle)
  return <p>{/* ... */}</p>
}
```

### Omitting the Lifecycle Parameter Entirely

If your component does not need any `Lifecycle` features, you can omit the second parameter altogether. TypeScript will not complain because unused parameters are optional in function types:

```tsx
function StaticComponent(props$: Observable<{ name: string }>) {
  const { name$ } = Props.take(props$)
  return <h1>Hello, {name$}</h1>
}
```

The component system never requires you to accept the lifecycle parameter. Only add it when you need `subscription`, `mounted$`, `unmounted$`, or `context`.

### Destructuring Quick Reference

```tsx
// Only subscription
function A(props$: Observable<P>, { subscription }: Lifecycle) {}

// Only mounted$
function B(props$: Observable<P>, { mounted$ }: Lifecycle) {}

// Only context
function C(props$: Observable<P>, { context }: Lifecycle) {}

// Subscription + unmounted$
function D(props$: Observable<P>, { subscription, unmounted$ }: Lifecycle) {}

// Everything
function E(props$: Observable<P>, lifecycle: Lifecycle) {}
```

---

**Next**: [Context API](./10-context.md)
