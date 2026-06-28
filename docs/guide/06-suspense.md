# Suspense & Loading States

`<Suspense>` is JsxRx's declarative mechanism for showing fallback UI (skeletons, spinners) while observable-driven content is loading. You wrap a subtree of your JSX with it, and whenever loading activity is detected inside that subtree, the boundary automatically shows a fallback instead of the children. When loading completes, the children appear.

---

## What is Suspense?

`<Suspense>` is a **boundary component**. You wrap a subtree of your JSX with it, and whenever loading activity is detected inside that subtree, the boundary automatically shows a fallback (a skeleton, spinner, or placeholder) instead of the children. When loading completes, the children appear.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `fallback` | `ElementNode` | — | The UI shown while suspended. **Required.** |
| `suspended` | `Observable<boolean> \| boolean` | `false` | Manual control. When `true`, the fallback is shown. |
| `tolerance` | `number` (ms) | `0` | Debounce window. If loading completes within this time, the fallback is never shown. |

The `fallback` prop is the only required prop. The `suspended` prop exists for advanced manual control — in most cases, `<Suspense>` auto-detects loading activity from observables in its subtree without any manual wiring.

---

## Basic Usage: Boundary for Unemitted Observables

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

This works for any observable embedded anywhere in the subtree — deeply nested components, passed as children, etc. The `<Suspense>` boundary automatically discovers them. Even a plain observable that hasn't emitted its first value will trigger the fallback; the observable doesn't need to be "activity aware."

---

## `tolerance` — Preventing Flash

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

## Nested Suspense

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

---

**Next**: [API Client, Endpoints, Fetch and Action](./07-api-client.md)
