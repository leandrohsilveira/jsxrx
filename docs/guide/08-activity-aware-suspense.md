# Activity-Aware Suspense

`<Suspense>` is JsxRx's declarative mechanism for showing fallback UI (skeletons, spinners) while observable-driven content is loading. This guide covers the advanced Suspense features — auto-suspending via `ActivityAwareObservable`, integration with the API client, surgical boundaries, and the utilities for creating activity-aware observables.

---

## 1. ActivityAwareObservable: Auto-Suspending

An `ActivityAwareObservable` is an observable that carries a built-in `pending$` signal — a secondary observable that emits `true` while the operation is in-flight and `false` when it's complete.

When you render an `ActivityAwareObservable` **anywhere** in a `<Suspense>` subtree — as a child node, as an attribute value, nested deeply inside other components — the boundary **automatically detects** its `pending$` and suspends while `pending$` is `true`. When `pending$` emits `false`, the boundary resumes.

**You never need to manually wire `suspended`.** Just place the observable in the subtree, and the boundary does the rest.

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
      <div className="data-view">
        <h2>Results</h2>
        {data$.pipe(
          map(data =>
            data.items.map(item => <ResultCard key={item.id} item={item} />),
          ),
        )}
      </div>
    </Suspense>
  )
}
// No manual suspended prop!
// While toActivityAware(...) is pending, Suspense auto-detects and shows <Skeleton />.
// When it resolves, the result cards appear.
```

---

## 2. API Client Fetch Auto-Suspends

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
            users.map(user => <UserCard key={user.id} user={user} />),
          ),
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
4. The user clicks "Next Page", `page$` changes. `endpoint.fetch()` triggers a re-fetch. `pending$` goes `true` again. The skeleton re-appears.
5. New page data arrives. `pending$` goes `false`. The updated user list replaces the skeleton.

All of this happens **without a single manual `suspended` prop**. The boundary auto-detects activity from the `ActivityAwareObservable` and handles loading states transparently.

---

## 3. Observables on HTML Attributes Also Trigger Suspense

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

Here, `avatarUrl$` is an `ActivityAwareObservable` (returned by `endpoint.fetch()`). It's used as the `src` attribute of `<img>`. The boundary detects the observable on the attribute, subscribes to its `pending$`, and suspends while the avatar URL is being fetched. When the URL arrives, the image appears instantly.

This works identically for `className`, `style`, `href`, or any other attribute.

---

## 4. Surgical Pending Boundaries

Instead of wrapping your entire page in one giant `<Suspense>`, use **multiple fine-grained boundaries** to create surgical loading states — only the parts that are truly loading show skeletons.

```tsx
import { Props, rawHtml, Suspense } from "@jsxrx/core"
import { from, map, switchMap } from "rxjs"

function Icon(props$) {
  const { id$, svgImport$ } = Props.take(props$)
  return (
    <Suspense fallback={<IconSkeleton />}>
      {id$.pipe(
        map(id =>
          rawHtml(
            id,
            svgImport$.pipe(
              switchMap(imp => from(imp())),
              map(mod => mod.default),
            ),
          ),
        ),
      )}
    </Suspense>
  )
}
```

Here the `svgImport$` observable may involve a dynamic SVG import (a Promise). While the promise resolves, the observable hasn't produced its value yet — it's "pending." `<Suspense>` detects the pending observable node in its subtree and shows `<IconSkeleton />`. Once the SVG content arrives, the skeleton is replaced with the rendered icon.

This is **surgical** — only the icon shows a skeleton, not the entire page. Every other part of the UI (surrounding text, other icons) renders immediately.

Apply this pattern whenever a component has a loading dependency. Wrap just that component — not the entire page:

```tsx
function ProfilePage() {
  return (
    <div>
      <h1>My Profile</h1>

      <Suspense fallback={<Skeleton circle />}>
        <Avatar userId={user.id} />
      </Suspense>

      <Suspense fallback={<Skeleton height={20} />}>
        <UserName userId={user.id} />
      </Suspense>

      <Suspense fallback={<Skeleton height={200} />}>
        <ActivityFeed userId={user.id} />
      </Suspense>
    </div>
  )
}
```

Each section resolves independently — the avatar may appear before the activity feed, depending on which data arrives first. This progressive reveal feels significantly faster to users than a single monolithic loading state.

---

## 5. `toActivityAware()` for Custom Observables

The declarative way to create an `ActivityAwareObservable`. It wraps an observable builder function and automatically tracks its pending state:

```tsx
import { toActivityAware } from "@jsxrx/core"

const data$ = toActivityAware(attach =>
  someService.getData().pipe(map(response => response.data)),
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

Any observable wrapped with `toActivityAware()` will auto-suspend when rendered inside a `<Suspense>` boundary. The boundary detects the built-in `pending$` signal and shows the fallback while the operation is in-flight.

---

## 6. `activity()` — Imperative Alternative

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
- `start()` — Returns an RxJS `tap` operator that sets pending to `true` on subscription.
- `complete()` — Returns an RxJS `tap` operator that sets pending to `false` on next/error/complete.
- `pipe(operator)` — Composes `start()`, the given operator, and `complete()` into a single operator.
- `toObservable(obs)` — Wraps an observable as an `ActivityAwareObservable` tracked by this tracker.

**Choosing between them:**

| Use Case                                                           | Utility                             |
| ------------------------------------------------------------------ | ----------------------------------- |
| You have an observable and want its loading state                  | `toActivityAware()`                 |
| You need manual control (start/stop outside an observable chain)   | `activity()`                        |
| You want to wrap an existing observable with tracking              | `activity().toObservable(obs)`      |
| You need to compose multiple async operations with nested tracking | `toActivityAware()` with `attach()` |

---

**Next**: [Lifecycle](./09-lifecycle.md)
