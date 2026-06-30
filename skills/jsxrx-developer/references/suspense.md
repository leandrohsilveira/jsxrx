## Suspense & Loading States

### Suspense Basic Usage

`<Suspense>` is a boundary component that wraps a subtree and shows a fallback (spinner, skeleton, placeholder) while any observable-driven content inside is loading. Auto-detects pending observables without manual wiring.

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

While an observable in the subtree hasn't emitted its first value, the fallback is shown. Once it emits, the children appear. This works for any observable embedded anywhere in the subtree — deeply nested, passed as children, or bound to element attributes.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `fallback` | `ElementNode` | — | The UI shown while suspended. **Required.** |
| `suspended` | `Observable<boolean> \| boolean` | `false` | Manual control. When `true`, the fallback is shown. |
| `tolerance` | `number` (ms) | `0` | Debounce window. If loading completes within this time, the fallback is never shown. |

---

### tolerance Prop

Prevents visual flicker when loading completes very quickly (cached data, fast responses). The `tolerance` value acts as a debounce window — if the boundary switches from non-suspended to suspended but reverts within `tolerance` ms, the fallback is never shown in the DOM.

```tsx
import { Suspense } from "@jsxrx/core"

function DataView() {
  return (
    <Suspense tolerance={200} fallback={<Spinner />}>
      <Content data$={data$} />
    </Suspense>
  )
}
```

**Choosing a tolerance value:**

| Value | Behavior |
|-------|----------|
| `0` (default) | No debounce. Fallback appears immediately on suspension. |
| `100`–`200` | Eliminates flash from cached or fast responses. |
| `300`–`500` | Adds deliberate delay — loading must be genuinely "slow" before the user sees a skeleton. |

A 50ms loading spike without tolerance would flash the spinner then immediately show content — disorienting. With `tolerance={200}`, the spinner only appears if loading actually takes longer than 200ms.

---

### Auto-Detection

`<Suspense>` automatically detects loading activity from observables in its subtree. No manual `suspended` prop or wiring is needed. The following sources trigger auto-suspension:

1. **Unemitted observables** — any plain observable embedded in JSX that hasn't produced its first value yet causes the boundary to suspend. Once it emits, the boundary resumes.

2. **`ActivityAwareObservable.pending$`** — observables with a built-in `.pending$` signal auto-suspend. When `pending$` emits `true`, the fallback appears; when it emits `false`, children render. The boundary subscribes to `.pending$` automatically.

3. **API client `.fetch()`** — `endpoint.fetch(input$)` returns an `ActivityAwareObservable`. Placing it in JSX inside a `<Suspense>` boundary gives automatic loading states:

    ```tsx
    import { Suspense, state } from "@jsxrx/core"
    import { map } from "rxjs"

    function UserList() {
      const page$ = state(1)
      const users$ = listUsersEndpoint.fetch(page$)

      return (
        <Suspense fallback={<Skeleton />}>
          <div>
            {users$.pipe(
              map(users => users.map(user => <UserCard key={user.id} user={user} />)),
            )}
          </div>
        </Suspense>
      )
    }
    ```
    When `page$` changes and a re-fetch triggers, `pending$` goes `true` again and the skeleton re-appears — all without any manual wiring.

4. **Lazy components** — components loaded via `lazy()` automatically suspend while the import promise is pending. Always wrap lazy components in `<Suspense>`:

    ```tsx
    import { Suspense, lazy } from "@jsxrx/core"

    const Dashboard = lazy(() => import("./Dashboard"))

    function App() {
      return (
        <Suspense fallback={<DashboardSkeleton />}>
          <Dashboard />
        </Suspense>
      )
    }
    ```

5. **Observables on HTML attributes** — even observables bound to element attributes (e.g., `src`, `className`, `style`, `href`) trigger the nearest `<Suspense>` boundary if they are `ActivityAwareObservable` instances.

---

### Nested Suspense

Suspense boundaries can be nested for **surgical loading states** — only the parts that are truly loading show skeletons. Each boundary tracks its own subtree independently.

```tsx
import { Suspense, state } from "@jsxrx/core"

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
    </Suspense>
  )
}
```

**Resolution order:**
1. The outer boundary shows `DashboardShellSkeleton` while the shell loads.
2. Once the shell resolves, `<Header>` and the inner boundaries appear.
3. Each inner boundary resolves independently — `UsersList` may appear before `AnalyticsChart`, depending on which data arrives first.

This progressive reveal feels significantly faster than a single monolithic loading state. Apply this pattern whenever a component has a loading dependency — wrap just that component, not the entire page.

---

### toActivityAware()

Wraps an observable chain for custom loading detection. Returns an observable that has a built-in `.pending$` property, which `<Suspense>` auto-detects. The `attach` callback registers nested observables so their pending state propagates to the parent.

```tsx
import { Suspense, toActivityAware } from "@jsxrx/core"
import { map, switchMap } from "rxjs"

function DataView({ input$ }) {
  const data$ = toActivityAware(attach =>
    input$.pipe(
      switchMap(id => attach(fetchData(id))),
      map(response => response.data),
    ),
  )

  return (
    <Suspense fallback={<Skeleton />}>
      <div>{data$.pipe(map(data => <ResultCard data={data} />))}</div>
    </Suspense>
  )
}
// While toActivityAware(...) is pending, Suspense auto-detects and shows <Skeleton />.
```

The `attach()` function wraps an observable and makes the tracker aware of it. If the nested observable is itself activity-aware (has its own `.pending$`), the parent's pending state automatically propagates:

```tsx
const combined$ = toActivityAware(attach => {
  const users$ = toActivityAware(/* ... */)
  const settings$ = toActivityAware(/* ... */)
  return combineLatest({ users: attach(users$), settings: attach(settings$) })
})
// combined$.pending$ is true while either child is pending
```

---

### activity()

Imperative alternative to `toActivityAware()`. Creates a manual activity tracker with start/complete operators. Useful when you need explicit control outside an observable chain.

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

`activity()` returns an object with:

| Member | Signature | Description |
|--------|-----------|-------------|
| `pending$` | `Observable<boolean>` | Starts as `true` by default. |
| `start()` | `OperatorFunction<T, T>` | RxJS `tap` operator that sets pending to `true` on subscription. |
| `complete()` | `OperatorFunction<T, T>` | RxJS `tap` operator that sets pending to `false` on next/error/complete. |
| `pipe(op)` | `OperatorFunction<T, R>` | Composes `start()`, the given operator, and `complete()` into a single operator. |
| `toObservable(obs)` | `(obs: Observable<T>) => ActivityAwareObservable<T>` | Wraps an observable as an `ActivityAwareObservable` tracked by this tracker. |

**Choosing between `toActivityAware()` and `activity()`:**

| Use Case | Utility |
|---|---|
| You have an observable and want its loading state | `toActivityAware()` |
| You need manual control (start/stop outside an observable chain) | `activity()` |
| You want to wrap an existing observable with tracking | `activity().toObservable(obs)` |
| You need to compose multiple async operations with nested tracking | `toActivityAware()` with `attach()` |

---

### pending()

Derives a loading boolean from any observable. Accepts an `Observable`, `ActivityAwareObservable`, or `AsyncState`, and returns `Observable<boolean>`.

```tsx
import { pending, Suspense } from "@jsxrx/core"

function Profile() {
  const loading$ = pending(user$, 50)

  return (
    <Suspense suspended={loading$} fallback={<Spinner />}>
      <UserProfile user$={user$} />
    </Suspense>
  )
}
```

**Signature:** `pending(value: Observable<unknown> | AsyncState<unknown>, debounce?: number): Observable<boolean>`

- Handles `AsyncState`, `ActivityAwareObservable` (uses `.pending$`), and regular `Observable` (emits `true` until first emission).
- Default debounce is `5ms` — prevents micro-flash for synchronously resolving observables.
- The optional `debounce` parameter (in ms) is applied to the output — useful for preventing loading flicker.

---

### Manual Suspension

For full control, use the `suspended` prop. It accepts a static boolean or an `Observable<boolean>`.

```tsx
import { Suspense, state, pending } from "@jsxrx/core"
import { map } from "rxjs"

// Static boolean — always suspended
function AlwaysLoading() {
  return (
    <Suspense suspended={true} fallback={<Spinner />}>
      <Content />
    </Suspense>
  )
}

// Observable boolean — derived loading state
function ControlledLoading() {
  const loading$ = state(true)
  const data$ = state(null)

  // Simulate loading
  setTimeout(() => {
    data$.set("Loaded data")
    loading$.set(false)
  }, 2000)

  return (
    <Suspense suspended={loading$} fallback={<Spinner />}>
      <p>{data$}</p>
    </Suspense>
  )
}
```

This is useful for integrating with third-party libraries, wrapping non-observable async operations, or when you need precise control over when the fallback appears and disappears.
