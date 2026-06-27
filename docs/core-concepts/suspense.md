# Suspense & Loading States

`<Suspense>` is JsxRx's declarative mechanism for showing fallback UI (skeletons, spinners) while observable-driven content is loading. Unlike React's Suspense, which is tied to the framework's internal data-fetching conventions, JsxRx's `<Suspense>` is a **surgical pending boundary** that automatically detects activity anywhere in its subtree — no manual wiring required.

---

## Table of Contents

1. [What is Suspense?](#1-what-is-suspense)
2. [Basic Usage: Boundary for Unemitted Observables](#2-basic-usage-boundary-for-unemitted-observables)
3. [ActivityAwareObservable: Auto-Suspending](#3-activityawareobservable-auto-suspending)
4. [Observables on HTML Attributes Also Trigger Suspense](#4-observables-on-html-also-trigger-suspense)
5. [Real-World Example: API Client Fetch](#5-real-world-example-api-client-fetch)
6. [Good Practice: Surgical Pending Boundaries](#6-good-practice-surgical-pending-boundaries)
7. [Manual Control with `suspended`](#7-manual-control-with-suspended)
8. [The `pending()` Helper](#8-the-pending-helper)
9. [`tolerance` — Preventing Flash](#9-tolerance--preventing-flash)
10. [Nested Suspense](#10-nested-suspense)
11. [Activity Tracking Utilities](#11-activity-tracking-utilities)

---

## 1. What is Suspense?

`<Suspense>` is a **boundary component**. You wrap a subtree of your JSX with it, and whenever loading activity is detected inside that subtree, the boundary automatically shows a fallback (a skeleton, spinner, or placeholder) instead of the children. When loading completes, the children appear.

The `<Suspense>` component function itself is lightweight — the real work happens in the JSX runtime and VDOM layer. The runtime intercepts `<Suspense>` tags and creates a dedicated `RenderSuspenseNode` that the renderer handles natively.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `fallback` | `ElementNode` | — | The UI shown while suspended. **Required.** |
| `suspended` | `Observable<boolean> \| boolean` | `false` | Manual control. When `true`, the fallback is shown. |
| `tolerance` | `number` (ms) | `0` | Debounce window. If loading completes within this time, the fallback is never shown. |

---

## 2. Basic Usage: Boundary for Unemitted Observables

The simplest use case: wrap observable-driven content in `<Suspense>`. While an observable in the subtree hasn't emitted its first value yet, the fallback is shown. Once it emits, the children appear.

```tsx
import { Suspense, state } from "@jsxrx/core"
import { map } from "rxjs"

function UserProfile() {
  const name$ = state("Alice")

  return (
    <Suspense fallback={<p>Loading...</p>}>
      <h1>Hello, {name$.pipe(map(n => n.toUpperCase()))}</h1>
    </Suspense>
  )
}
```

Here, the observables inside the subtree (the `map` pipeline on `name$`) are embedded as child nodes. JsxRx detects these unemitted observable nodes and suspends the boundary until they produce their first value.

This works for any observable embedded anywhere in the subtree — deeply nested components, passed as children, etc. The `<Suspense>` boundary automatically discovers them.

---

## 3. ActivityAwareObservable: Auto-Suspending

This is where `<Suspense>` truly shines. An `ActivityAwareObservable` is an observable that carries a built-in `pending$` signal — a secondary observable that emits `true` when the operation is in-flight and `false` when it's complete.

When you render an `ActivityAwareObservable` **anywhere** in a `<Suspense>` subtree — as a child node, as an attribute value, nested deeply inside other components — JsxRx **automatically detects** its `pending$` and suspends the boundary while `pending$` is `true`. When `pending$` emits `false`, the boundary resumes.

**You never need to manually wire `suspended`.** Just place the observable in the subtree, and the boundary does the rest.

```tsx
import { Suspense, toActivityAware } from "@jsxrx/core"
import { map, switchMap } from "rxjs"

function DataView({ input$ }) {
  const data$ = toActivityAware(attach =>
    input$.pipe(
      switchMap(id => attach(fetchData(id))),
      map(response => response.data),
    )
  )

  return (
    <Suspense fallback={<Skeleton />}>
      <div className="data-view">
        <h2>Results</h2>
        {data$.pipe(map(data => data.items.map(item => (
          <ResultCard key={item.id} item={item} />
        ))))}
      </div>
    </Suspense>
  )
}
// No manual suspended prop!
// While toActivityAware(...) is pending, Suspense auto-detects and shows <Skeleton />.
// When it resolves, the result cards appear.
```

The auto-detection works by the VDOM layer inspecting each observable it encounters. When it finds an `ActivityAwareObservable`, it subscribes to its `pending$` and signals the nearest `<Suspense>` boundary's suspension context. The boundary is suspended as long as **any** observable in its subtree reports pending.

---

## 4. Observables on HTML Attributes Also Trigger Suspense

Auto-detection extends to observables bound to element attributes. If an `ActivityAwareObservable` is used as an attribute value, it triggers the nearest `<Suspense>` boundary.

```tsx
function Avatar({ userId$ }) {
  const avatarUrl$ = getAvatarEndpoint.fetch(userId$)

  return (
    <Suspense fallback={<AvatarSkeleton />}>
      <img src={avatarUrl$} alt="User avatar" />
    </Suspense>
  )
}
```

Here, `avatarUrl$` is an `ActivityAwareObservable` (returned by `endpoint.fetch()`). It's used as the `src` attribute of `<img>`. The VDOM layer detects the observable on the attribute, subscribes to its `pending$`, and suspends the boundary while the avatar URL is being fetched. When the URL arrives, the image appears instantly.

This works identically for `class`, `style`, `href`, or any other attribute.

---

## 5. Real-World Example: API Client Fetch

The `@jsxrx/api` package's `endpoint.fetch(input$)` returns an `ActivityAwareObservable` that automatically re-fetches when `input$` changes. Placing this observable in JSX inside a `<Suspense>` boundary gives you automatic loading states — no manual wiring.

```tsx
import { Suspense, state } from "@jsxrx/core"
import { map } from "rxjs"

const listUsersEndpoint = client.createEndpoint({
  method: "GET",
  path: "/api/users",
  responseBodyParser: jsonParser,
})

function UserList() {
  const page$ = state(1)
  const users$ = listUsersEndpoint.fetch(page$)

  return (
    <Suspense fallback={<Skeleton />}>
      <div>
        {users$.pipe(
          map(users =>
            users.map(user => (
              <UserCard key={user.id} user={user} />
            ))
          )
        )}
      </div>
    </Suspense>
  )
}
```

**What happens step by step:**

1. `users$` is an `ActivityAwareObservable` from `endpoint.fetch()`. Its `pending$` starts as `true` (fetch in progress).
2. `<Suspense>` auto-detects `users$` in its subtree. Since `pending$` is `true`, the boundary shows `<Skeleton />`.
3. The fetch completes. `pending$` emits `false`. `<Suspense>` switches to showing the children — the user cards appear.
4. User clicks "Next Page", `page$` changes. `endpoint.fetch()` triggers a re-fetch. `pending$` goes `true` again. The skeleton re-appears.
5. New page data arrives. `pending$` goes `false`. The updated user list replaces the skeleton.

All of this happens **without a single manual `suspended` prop**. The boundary auto-detects activity from the `ActivityAwareObservable` and handles loading states transparently.

---

## 6. Good Practice: Surgical Pending Boundaries

Instead of wrapping your entire page in one giant `<Suspense>`, use **multiple fine-grained boundaries** to create surgical loading states — only the parts that are truly loading show skeletons.

Here's a real example from `apps/frontend/src/components/ui/Icon.tsx`:

```tsx
import { Props, rawHtml, Suspense } from "@jsxrx/core"
import { from, map, Observable, of, switchMap } from "rxjs"
import Skeleton from "./Skeleton.js"

export type IconProps = Readonly<{
  id: string
  content: string | Promise<string | { default: string }> | { default: string }
  className?: string
}>

export default function Icon(props$: Observable<IconProps>) {
  const { id$, content$, className$ } = Props.take(props$)

  return (
    <div className={tw("w-full h-full", className$)}>
      <Suspense fallback={<Skeleton />}>
        {id$.pipe(
          map(id =>
            rawHtml(
              id,
              content$.pipe(
                switchMap(content =>
                  content instanceof Promise ? from(content) : of(content),
                ),
                map(content =>
                  typeof content === "string" ? content : content.default,
                ),
              ),
            ),
          ),
        )}
      </Suspense>
    </div>
  )
}
```

**What makes this pattern powerful:**

- `content$` may involve a `Promise` (dynamic SVG import). While the promise resolves, the observable hasn't produced its value yet — it's "pending."
- `<Suspense>` detects the pending observable node in its subtree and shows `<Skeleton />`.
- Once the SVG content arrives, the skeleton is replaced with the rendered icon.
- This is **surgical** — only the icon shows a skeleton, not the entire page. Every other part of the UI (surrounding text, other icons) renders immediately.
- `rawHtml()` creates an observable-backed rendering node. The VDOM layer monitors it and automatically reports pending state to the nearest `<Suspense>` boundary.

Apply this pattern whenever a component has a loading dependency. Wrap just that component — not the entire page.

---

## 7. Manual Control with `suspended`

While auto-detection handles most cases, you can also take explicit control via the `suspended` prop. It accepts either a static `boolean` or an `Observable<boolean>`.

**With an observable boolean:**

```tsx
const isLoading$ = combineLatest([users$, settings$]).pipe(
  map(([users, settings]) => !users || !settings)
)

return (
  <Suspense suspended={isLoading$} fallback={<FullPageLoader />}>
    <Dashboard users$={users$} settings$={settings$} />
  </Suspense>
)
```

**With a static boolean:**

```tsx
// Always show fallback (useful for disabling a section)
<Suspense suspended={true} fallback={<MaintenanceNotice />}>
  <AdminPanel />
</Suspense>
```

**Combined auto and manual control:** When a boundary has both a `suspended` prop and auto-detected activity from descendants, the boundary is suspended if **either** source reports `true`. The two sources are combined with `combineLatest`, and the boundary suspends when any suspension is active.

---

## 8. The `pending()` Helper

`pending(value, debounce?)` derives a loading boolean from various async constructs. It's the standard way to produce a `suspended` signal when you need manual control.

```ts
function pending(
  value: Observable<unknown> | AsyncState<unknown>,
  debounce?: number,
): Observable<boolean>
```

**With `ActivityAwareObservable`:** Extracts the built-in `pending$` and applies `debounceTime(debounce)`.

```tsx
const data$ = toActivityAware(attach => attach(fetchSomething()))
const isLoading$ = pending(data$, 250)

return (
  <Suspense suspended={isLoading$} fallback={<Skeleton />}>
    <Content data$={data$} />
  </Suspense>
)
```

**With `AsyncState`:** Works identically — extracts the object's `pending$`.

**With raw observables:** Maps each emission to a boolean based on whether the value is a `PendingState` object with `state === "pending"`.

The `debounce` parameter (default `5`ms for activity-aware sources, `1`ms for raw observables) prevents rapid toggling. Increase it to match the desired sensitivity.

---

## 9. `tolerance` — Preventing Flash

When loading completes very quickly (e.g., cached data, optimistic responses), showing a skeleton for a split second creates a jarring visual flicker. The `tolerance` prop prevents this by applying a debounce window.

```tsx
<Suspense tolerance={300} fallback={<Spinner />}>
  <Content data$={data$} />
</Suspense>
```

**How it works:** If the boundary switches from non-suspended to suspended but reverts within `tolerance` milliseconds, the fallback is never shown in the DOM. The children remain visible the entire time.

**Choosing a tolerance value:**

| Value | Behavior |
|-------|----------|
| `0` (default) | No debounce. Fallback appears immediately on suspension. |
| `100`–`200` | Good for eliminating flash from cached or fast responses. |
| `300`–`500` | Adds a deliberate delay. Loading must genuinely be "slow" before the user sees a skeleton. |

Without tolerance, a 50ms loading spike would flash the spinner, then immediately show content — disorienting. With `tolerance={300}`, the spinner only appears if loading actually takes longer than 300ms.

---

## 10. Nested Suspense

Suspense boundaries can be nested for granular, independent loading states. Each boundary tracks its own subtree independently.

```tsx
function Dashboard() {
  return (
    <Suspense fallback={<DashboardShellSkeleton />}>
      <Header />
      <Suspense fallback={<UsersSkeleton />}>
        <UsersList users$={users$} />
      </Suspense>
      <Suspense fallback={<AnalyticsSkeleton />}>
        <AnalyticsChart data$={analytics$} />
      </Suspense>
      <Suspense fallback={<ActivitySkeleton />}>
        <ActivityFeed entries$={activity$} />
      </Suspense>
    </Suspense>
  )
}
```

**Resolution order:**

1. The outer boundary shows `DashboardShellSkeleton` while the dashboard shell is loading.
2. Once the shell resolves, `<Header>` and the three inner boundaries appear.
3. Each inner boundary resolves independently — `UsersList` may appear before `AnalyticsChart`, depending on which data arrives first.

The header becomes visible as soon as the outer boundary resolves, even while the inner sections are still loading. This progressive reveal feels significantly faster to users than a single monolithic loading state.

**How nesting works internally:** Each `<Suspense>` creates its own `SuspensionContext`. When a descendant node reports pending activity, it signals only the **nearest** ancestor `<Suspense>` — not every boundary in the tree. An outer boundary is not affected by inner boundary activity unless the inner boundary itself is suspended and has children that report pending.

---

## 11. Activity Tracking Utilities

While auto-detection covers most use cases, JsxRx provides utilities for creating `ActivityAwareObservable` instances from arbitrary observables.

### `toActivityAware()`

The declarative way to create an `ActivityAwareObservable`. It wraps an observable builder function and automatically tracks its pending state:

```tsx
import { toActivityAware } from "@jsxrx/core"

const data$ = toActivityAware(attach =>
  someService.getData().pipe(
    map(response => response.data),
  )
)
// data$ has a built-in .pending$ property
```

The `attach` callback receives a function that registers nested observables. If a nested observable is itself activity-aware (has its own `pending$`), the parent's pending state automatically propagates:

```tsx
const combined$ = toActivityAware(attach => {
  const users$ = toActivityAware(/* ... */)
  const settings$ = toActivityAware(/* ... */)
  return combineLatest({ users: attach(users$), settings: attach(settings$) })
})
// combined$.pending$ is true while either child is pending
```

### `activity()`

The imperative alternative. Creates a manual activity tracker with `start`/`complete` RxJS operators:

```tsx
import { activity, pending, Suspense } from "@jsxrx/core"
import { from, map } from "rxjs"

function DataLoader() {
  const tracker = activity()

  const data$ = tracker.toObservable(
    from(fetch("/api/data")).pipe(map(res => res.json())),
  )

  return (
    <Suspense suspended={pending(data$)} fallback={<Spinner />}>
      <DataDisplay data$={data$} />
    </Suspense>
  )
}
```

`activity()` returns:
- `pending$` — `Observable<boolean>`, starts as `true` by default.
- `start` — RxJS `tap` operator that sets pending to `true` on subscription.
- `complete` — RxJS `tap` operator that sets pending to `false` on next/error/complete.
- `toObservable(obs)` — Wraps an observable as an `ActivityAwareObservable` tracked by this tracker.

**Choosing between them:**

| Use Case | Utility |
|----------|---------|
| You have an observable and want its loading state | `toActivityAware()` |
| You need manual control (start/stop outside an observable chain) | `activity()` |
| You want to wrap an existing observable with tracking | `activity().toObservable(obs)` |
| You need to compose multiple async operations with nested tracking | `toActivityAware()` with `attach()` |

---

## Source Files Referenced

| Concept | Source File |
|---------|-------------|
| `Suspense` component | [`packages/core/src/suspense.js`](../../packages/core/src/suspense.js) |
| `pending()` helper | [`packages/core/src/observable.js`](../../packages/core/src/observable.js) |
| `activity()` / `toActivityAware()` | [`packages/core/src/observable.js`](../../packages/core/src/observable.js) |
| `ActivityAwareObservable` class | [`packages/core/src/observable.js`](../../packages/core/src/observable.js) |
| `endpoint.fetch()` (auto-suspending) | [`packages/api/src/api.js`](../../packages/api/src/api.js) |
| Real-world Icon component | [`apps/frontend/src/components/ui/Icon.tsx`](../../../apps/frontend/src/components/ui/Icon.tsx) |
