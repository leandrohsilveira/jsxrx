# Route Resolver Pattern

The route resolver pattern is the recommended way to handle data fetching, context injection, side effects, and event callbacks in JsxRx applications. Each route component file exports **both** a default component **and** a named resolver function. The resolver runs before the component renders and provides all the data the component needs as reactive props.

---

## Table of Contents

1. [What Is the Route Resolver Pattern?](#what-is-the-route-resolver-pattern)
2. [Why Resolvers?](#why-resolvers)
3. [Anatomy of a Resolver](#anatomy-of-a-resolver)
4. [RouteResolverInput Deep Dive](#routeresolverinput-deep-dive)
5. [Context in Resolvers](#context-in-resolvers)
6. [ResolvedProps](#resolvedprops)
7. [Lazy Resolvers](#lazy-resolvers)
8. [Multiple Files Example](#multiple-files-example)
9. [Best Practices](#best-practices)
10. [Summary](#summary)

---

## What Is the Route Resolver Pattern?

The route resolver pattern separates **data/logic** from **presentation** in a route. A route file exports two things:

1. A **resolver function** — runs synchronously before the component renders, fetches data, injects context, and returns props
2. A **default component** — receives the resolved props as an `Observable<Props>` and renders the UI

The resolver is passed to the `route()` definition via the `resolve` option. The router invokes the resolver when the route matches, and the returned props are fed into the component's `props$` stream.

```tsx
import { Props } from "@jsxrx/core"
import { ResolvedProps, RouteResolverInput } from "@jsxrx/router"
import { map, Observable } from "rxjs"

// ---------------------------------------------------------------------------
// 1. Define the props type that the component expects
// ---------------------------------------------------------------------------
type UserPageProps = Readonly<{
  user: { id: string; name: string } | null
  onRefresh: () => void
}>

// ---------------------------------------------------------------------------
// 2. The component — presentation only
// ---------------------------------------------------------------------------
export default function UserPage(props$: Observable<UserPageProps>) {
  const { user$, onRefresh$ } = Props.take(props$)

  return (
    <div>
      <p>Name: {user$.pipe(map(u => u?.name ?? "Guest"))}</p>
      <button onClick={onRefresh$}>Refresh</button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 3. The resolver — data + logic
// ---------------------------------------------------------------------------
export function UserPageResolver({
  context,
  refresh,
}: RouteResolverInput): ResolvedProps<UserPageProps> {
  const auth$ = context.require(AuthContext)

  return {
    user: auth$.pipe(map(state => state.user)),
    onRefresh: () => refresh(),
  }
}
```

The `route()` definition wires them together:

```tsx
route("user-page", UserPage, {
  resolve: UserPageResolver,
})
```

---

## Why Resolvers?

### Separation of Concerns

| Layer | Responsibility | Where |
|---|---|---|
| **Resolver** | Data fetching, context injection, navigation guards, callbacks | Exported named function |
| **Component** | DOM structure, styling, reactive rendering | Exported default function |

This separation means components stay focused on presentation. They receive clean, ready-to-use observable props and never deal with HTTP calls, context management, or navigation logic directly.

### Context Injection Without Provider Components

Unlike React, JsxRx has **no `<Context.Provider>` components**. Context is set imperatively in resolvers via `context.set(Context, observable$)` and consumed via `context.require(Context)`. Parent layout resolvers provision context; child route resolvers consume it. The router manages context propagation automatically through `downstream()` scoping.

### Co-location

The resolver lives in the **same file** as the component it serves. When you open a route file, you see both the data layer and the presentation layer. This co-location makes it easy to understand what data a component needs and where it comes from.

### Reactive by Default

Resolvers return plain values or observables. The router coerces plain values into observables, and observable props flow reactively into the component. When an upstream context changes (e.g., auth state updates), every derived observable in the component updates — without re-running the component function.

---

## Anatomy of a Resolver

A route file with a resolver has a consistent structure:

```text
┌─ Imports ─────────────────────────────────┐
│ Props, RouteResolverInput, ResolvedProps   │
│ RxJS operators (map, take, switchMap, ...) │
│ Context tokens, API endpoints              │
├─ Props Type ──────────────────────────────┤
│ type MyRouteProps = { ... }               │
├─ Resolver (named export) ─────────────────┤
│ export function MyRouteResolver(           │
│   { context, url$, navigate, refresh }     │
│ ): ResolvedProps<MyRouteProps> { ... }    │
├─ Component (default export) ──────────────┤
│ export default function MyRoute(           │
│   props$: Observable<MyRouteProps>         │
│ ) { ... }                                  │
└───────────────────────────────────────────┘
```

### Example: Login Route

Source: `apps/frontend/src/components/auth/Login.tsx`

```tsx
import { emitter, Props } from "@jsxrx/core"
import { lastValueFrom, Observable, take } from "rxjs"
import { ResolvedProps, RouteResolverInput } from "@jsxrx/router"
import { loginEndpoint } from "@/api/auth/login"

// ── Props type ─────────────────────────────────────────────────────────────
type LoginProps = {
  isSubmitting?: boolean
  onSubmit(formData: FormData): void
}

// ── Resolver ───────────────────────────────────────────────────────────────
export function LoginResolver({
  navigate,
  url$,
}: RouteResolverInput): ResolvedProps<LoginProps> {
  const loginAction = loginEndpoint.action()

  return {
    isSubmitting: loginAction.pending$,
    async onSubmit(formData) {
      await loginAction.perform({
        username: formData.get("username") as string,
        password: formData.get("password") as string,
      })
      const url = await lastValueFrom(url$.pipe(take(1)))
      navigate(url.searchParams.get("next") || "/")
    },
  }
}

// ── Component ─────────────────────────────────────────────────────────────
export default function Login(input$: Observable<LoginProps>) {
  const { isSubmitting$, onSubmit$ } = Props.take(input$, {
    isSubmitting: false,
  })

  const submitEmitter = emitter(onSubmit$)

  function handleSubmit(e: JsxRx.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.target as HTMLFormElement)
    submitEmitter.emit(formData)
  }

  return (
    <main>
      <form onSubmit={handleSubmit}>
        <h1>Login</h1>
        <input type="email" name="username" placeholder="E-mail" />
        <input type="password" name="password" placeholder="Password" />
        <button type="submit" pending={isSubmitting$}>
          Sign in
        </button>
      </form>
    </main>
  )
}
```

**Key patterns in this example:**
- The resolver creates an API **action** (`loginEndpoint.action()`) and returns its `pending$` observable for the component's loading state.
- The `onSubmit` callback is returned as a plain async function from the resolver.
- The component uses `emitter(onSubmit$)` to wrap the observable callback, then calls `.emit()` from the form submit handler.
- After login, the resolver reads `url$` to find the `next` query parameter and navigates there.

### Example: Entry List (Data Fetching)

Source: `apps/frontend/src/components/entry/EntryList.tsx`

```tsx
import { state, Props, Suspense } from "@jsxrx/core"
import { ResolvedProps } from "@jsxrx/router"
import { map, Observable } from "rxjs"
import { listEntriesEndpoint } from "@/api/entry/list"

// ── Props type ─────────────────────────────────────────────────────────────
type EntryListProps = Readonly<{
  entries: Entry[]
  isLoading?: boolean
}>

// ── Resolver ───────────────────────────────────────────────────────────────
export function EntryListResolver(): ResolvedProps<EntryListProps> {
  const now = new Date()
  const to = now.toISOString()
  const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const fetchResult$ = listEntriesEndpoint.fetch(state({ from, to }))

  return {
    entries: fetchResult$.pipe(map(result => result.entries)),
  }
}

// ── Component ─────────────────────────────────────────────────────────────
export default function EntryList(props$: Observable<EntryListProps>) {
  const { entries$, isLoading$ } = Props.take(props$, {
    entries: [],
    isLoading: false,
  })

  return (
    <Suspense suspended={isLoading$} fallback={<Skeleton />}>
      {entries$.pipe(
        map(entries =>
          entries.length === 0
            ? <p>No entries found</p>
            : entries.map(entry => (
                <ListItem key={entry.id}>
                  <span>{entry.id.slice(0, 8)}</span>
                </ListItem>
              ))
        )
      )}
    </Suspense>
  )
}
```

**Key patterns in this example:**
- The resolver fetches data using an API endpoint's `.fetch()` method, passing a reactive `state()` as the request body.
- The returned `entries` is an observable pipeline — when the fetch completes, the component receives the data.
- The component uses `Suspense` with the `isLoading$` prop to show a skeleton while data loads.
- Default values in `Props.take()` ensure the component always has a defined value even before the first emission.

### Example: Home with Refresh

Source: `apps/frontend/src/components/home/Home.tsx`

```tsx
import { Props, Suspense } from "@jsxrx/core"
import { map, Observable, startWith } from "rxjs"
import { ResolvedProps, RouteResolverInput } from "@jsxrx/router"
import { AuthLoginContext } from "@/contexts/auth/login"

// ── Props type ─────────────────────────────────────────────────────────────
type HomeProps = Readonly<{
  user: UserData | null
  isRefresing: boolean
  onRefresh: () => void
}>

// ── Resolver ───────────────────────────────────────────────────────────────
export function HomeResolver({
  context,
  refresh,
}: RouteResolverInput): ResolvedProps<HomeProps> {
  const authContext = context.require(AuthLoginContext)

  return {
    user: authContext.pipe(map(state => state.user)),
    isRefresing: authContext.pipe(map(state => state.isLoading)),
    async onRefresh() {
      refresh()
    },
  }
}

// ── Component ─────────────────────────────────────────────────────────────
export default function Home(props$: Observable<HomeProps>) {
  const { user$, isRefresing$, onRefresh$ } = Props.take(props$)

  const name$ = user$.pipe(map(user => user?.firstName ?? "you (unnamed)"))

  return (
    <main>
      <h2>Home page</h2>
      <p>Hello <Suspense fallback={<Skeleton />}>{name$}</Suspense>!</p>
      {user$.pipe(
        startWith(null),
        map(user =>
          user ? (
            <Button pending={isRefresing$} onClick={onRefresh$}>
              Refresh
            </Button>
          ) : null
        )
      )}
    </main>
  )
}
```

**Key patterns in this example:**
- The resolver consumes context with `context.require(AuthLoginContext)` — fails fast if the context was never set in a parent resolver.
- `refresh()` is returned as a callback to the component for pull-to-refresh / reload patterns.
- The component derives `name$` from `user$` using `map()`.
- `startWith(null)` on the user observable prevents a flash of the button before the first auth emission.

---

## RouteResolverInput Deep Dive

The `RouteResolverInput` is the single parameter passed to every resolver function.

Source: [`packages/router/src/types.ts`](../../packages/router/src/types.ts#L14-L24)

```ts
interface RouteResolverInput<
  Path extends string = string,
  Query extends string = string,
> {
  path: Record<Path, Observable<string>>
  query: Record<Query, Observable<string[] | undefined>>
  context: IContextMap
  url$: Observable<URL>
  navigate: NavigateFn
  refresh: () => void
}
```

### `navigate(to, options?)`

Type: `(to: string, options?: NavigateOptions) => void`

Imperative navigation. The router pushes a new history entry by default; use `{ replace: true }` to replace the current entry instead.

```tsx
export function LoginResolver({ navigate, url$ }: RouteResolverInput) {
  return {
    async onSubmit(formData: FormData) {
      // ... perform login ...
      const url = await lastValueFrom(url$.pipe(take(1)))

      // Navigate with query parameters
      navigate(url.searchParams.get("next") || "/")

      // Navigate with replace (back button won't return to login page)
      navigate("/dashboard", { replace: true })

      // Navigate with query and params
      navigate("/users/:id", {
        params: { id: "42" },
        query: { tab: "profile", page: "1" },
      })
    },
  }
}
```

Options:

| Option    | Type                        | Description                                              |
|-----------|-----------------------------|----------------------------------------------------------|
| `replace` | `boolean`                   | Use `history.replaceState` instead of `pushState`.       |
| `query`   | `Record<string, ...>`       | Query parameters. Array values produce repeated keys.    |
| `params`  | `Record<string, ...>`       | Path parameter values to interpolate into the pathname.  |

### `url$`

Type: `Observable<URL>`

The current URL as an observable. Emits a new `URL` object on every navigation. Useful for:

- Reading query parameters (`url$.value?.searchParams.get("next")`)
- Deriving the current pathname (`url$.pipe(map(url => url.pathname))`)
- Triggering fetches when the URL changes

```tsx
export function LayoutResolver({ url$ }: RouteResolverInput) {
  return {
    // Track the current path for active nav highlighting
    currentPath: url$.pipe(map(url => url?.pathname)),

    // Trigger analytics on every page view
    pageView: url$.pipe(
      map(url => url?.pathname),
      distinctUntilChanged(),
    ),
  }
}
```

### `context`

Type: `IContextMap`

The context scope for this route. The `IContextMap` is an imperative key-value store where:

- **Keys** are `Context<T>` instances (each carrying a unique `Symbol`)
- **Values** are always `Observable<T>`

Three methods are available:

| Method | Behavior | Use when |
|---|---|---|
| `context.set(Context, observable$)` | Registers an observable as the context value | Providing context to child routes |
| `context.require(Context)` | Returns `Observable<T>`; **throws** if not set | The context is mandatory |
| `context.optional(Context)` | Returns `Observable<T>`; falls back to `Context.initialValue` | The context may not exist |

Context is covered in depth in [Section 5](#context-in-resolvers).

### `refresh()`

Type: `() => void`

Re-runs **all resolvers** on the current route and its parent routes. The component does **not** re-mount — only the resolvers re-execute, producing fresh props that flow into the existing component.

```tsx
export function HomeResolver({ context, refresh }: RouteResolverInput) {
  const authContext = context.require(AuthLoginContext)

  return {
    user: authContext.pipe(map(state => state.user)),
    // Expose refresh to the component for pull-to-refresh
    onRefresh: () => refresh(),
  }
}
```

Use `refresh()` when:
- The user performs an action that should re-fetch data (e.g., pull-to-refresh, "Reload" button)
- A mutation on a child route should invalidate parent data
- You want to reload without a full page navigation

**Do not** call `refresh()` inside the resolver's synchronous body — that would create an infinite loop. Only call it from returned callbacks or event handlers.

### `path`

Type: `Record<Path, Observable<string>>` (only when `params` are declared)

Observables of matched path parameters. Each key corresponds to a `:param` token in the route's path pattern.

```tsx
import { route, params } from "@jsxrx/router"

route("user-profile", UserProfile, {
  params: { path: params("userId"), query: params("tab") },
  resolve({ path, query }) {
    return {
      userId: path.userId,                   // Observable<string>
      activeTab: query.tab,                   // Observable<string[] | undefined>
    }
  },
})

// Route pattern: /users/:userId
// URL: /users/42?tab=profile&tab=settings
// → path.userId emits "42"
// → query.tab emits ["profile", "settings"]
```

Without `params`, the `path` and `query` fields are typed as `Record<string, Observable<string>>` and `Record<string, Observable<string[] | undefined>>` respectively — they work but lack autocomplete.

### `query`

Type: `Record<Query, Observable<string[] | undefined>>` (only when `params` are declared)

Observables of query string parameters. Each key corresponds to a query parameter name. Since query parameters can appear multiple times (`?tag=a&tag=b`), the value is `string[] | undefined`.

```tsx
export function SearchResolver({ query }: RouteResolverInput<never, "q" | "sort">) {
  return {
    searchTerm: query.q.pipe(map(q => q?.[0] ?? "")),
    sortOrder: query.sort.pipe(map(s => s?.[0] ?? "desc")),
  }
}
```

---

## Context in Resolvers

Context in JsxRx flows through resolvers, not JSX provider components. A **parent layout resolver** sets context, and **child route resolvers** consume it. The router automatically creates child `ContextMap` scopes via `downstream()`.

### Step 1: Define a Context Token

```tsx
// contexts/auth.ts
import { Context } from "@jsxrx/core"

export interface AuthLoginState {
  user: UserData | null
  isLoading: boolean
  isLoggedIn: boolean
  reload(): void
}

export const AuthLoginContext = new Context<AuthLoginState>(
  "AuthLoginContext",
  {
    user: null,
    isLoading: true,
    isLoggedIn: false,
    reload() {},
  },
)
```

The `Context` constructor takes a `name` (for debugging) and an `initialValue` (used by `optional()` when context is not set).

### Step 2: Provide Context in a Parent Resolver

Source: `apps/frontend/src/components/layout/RootLayout.tsx` and `apps/frontend/src/contexts/auth/login.ts`

```tsx
// contexts/auth/login.ts — helper function
export function provideAuthContext(
  context: IContextMap,
  url$: Observable<URL>,
) {
  const authUserInfoInput$ = state(Symbol())

  function reloadUserInfo() {
    authUserInfoInput$.set(Symbol())
  }

  const state$ = authUserInfoEndpoint.fetch(
    combineLatest([authUserInfoInput$, url$]).pipe(
      debounceTime(1),
      map(() => null as unknown as null),
    ),
  )

  const pending$ = pending(state$)

  context.set(
    AuthLoginContext,
    combine({ info: state$, isLoading: pending$ }).pipe(
      debounceTime(1),
      map(({ info, isLoading }) => ({
        user: info?.user ?? null,
        isLoading,
        isLoggedIn: info !== null,
        reload: reloadUserInfo,
      })),
      shareReplay(),
    ),
  )
}

// components/layout/RootLayout.tsx — parent resolver
export function RootLayoutResolver({
  url$,
  context,
}: RouteResolverInput): ResolvedProps<RootLayoutProps> {
  provideAuthContext(context, url$)
  return {}
}
```

The parent resolver calls `context.set(AuthLoginContext, authState$)` with an Observable. The router scopes this via `downstream()`, making it available to all child routes.

### Step 3: Consume Context in a Child Resolver

Source: `apps/frontend/src/components/layout/FullLayout.tsx`

```tsx
export function FullLayoutResolver({
  context,
  url$,
  navigate,
  refresh,
}: RouteResolverInput): ResolvedProps<FullLayoutProps> {
  // require() — fails fast if context is not set
  const authContext$ = context.require(AuthLoginContext)
  const logoutAction = authLogoutEndpoint.action()

  return {
    user: authContext$.pipe(map(data => data?.user ?? null)),
    async onLogin() {
      const url = await lastValueFrom(url$.pipe(take(1)))
      navigate("/login", { query: { next: url.pathname } })
    },
    async onLogout() {
      await logoutAction.perform(null)
      navigate("/")
      refresh()
    },
  }
}
```

### `require()` vs `optional()`

| Method | Missing context behavior | Use case |
|---|---|---|
| `context.require(Context)` | **Throws** `"Unable to find required context for <name>"` | Context is mandatory for the route to function |
| `context.optional(Context)` | Returns `Context.initialValue` | Context is optional; the route works without it |

**Always prefer `require()`** when the context is mandatory. It fails fast with a clear error message, making debugging easier than silent defaults.

```tsx
export function HomeResolver({ context }: RouteResolverInput) {
  // ✅ Fails fast if AuthLoginContext was never set
  const auth$ = context.require(AuthLoginContext)

  // ✅ Use optional() when the context may legitimately not exist
  const theme$ = context.optional(ThemeContext)

  return {
    user: auth$.pipe(map(s => s.user)),
    theme: theme$,
  }
}
```

### How Context Propagation Works

```text
RootLayoutResolver
  └─ context.set(AuthContext, authState$)     ← provision
       │
       ▼ (router calls downstream())
FullLayoutResolver
  └─ context.require(AuthContext)              ← consumption 1
       │
       ▼ (router calls downstream())
HomeResolver
  └─ context.require(AuthContext)              ← consumption 2
       │
       ▼ (router calls downstream())
EntryListResolver
  └─ context.require(AuthContext)              ← consumption 3
```

Each nested resolver receives a `downstream()` of its parent's context. Changes to a parent context automatically propagate to all children.

---

## ResolvedProps

`ResolvedProps<Props>` is the return type of a resolver function.

Source: [`packages/router/src/types.ts`](../../packages/router/src/types.ts#L30-L33)

```ts
type ResolvedProps<Props> = Properties<Omit<Props, "children">>
```

Where `Properties<T>` (from `@jsxrx/core`) allows each value to be either `T | Observable<T>`:

```tsx
type ResolvedProps<P> = {
  [K in keyof P]: P[K] | Observable<P[K]>
}
```

**Key behaviors:**

1. **`children` is always stripped** — The router handles `children` internally. Resolvers never need to return it.

2. **Plain values are coerced to observables** — When `Props.take()` processes the resolved props, plain values like `"hello"` or `42` are automatically wrapped in `Observable<string>` / `Observable<number>`.

3. **Observable values flow reactively** — When the resolver returns an observable, the component receives a live stream that updates the DOM surgically.

```tsx
export function MyResolver(): ResolvedProps<{ count: number; name: string }> {
  return {
    count: 42,                                    // plain value → coerced
    name: someStream$.pipe(map(s => s.name)),     // observable → reactive
  }
}

export default function MyComp(props$: Observable<{ count: number; name: string }>) {
  const { count$, name$ } = Props.take(props$)
  // count$ is Observable<number> — emits 42 once
  // name$ is Observable<string> — emits whenever someStream$ changes
  return <p>{name$}: {count$}</p>
}
```

4. **Event callbacks are returned as plain functions** — They are not wrapped in observables. The component receives them via `Props.take()` as an `Observable<Fn>`, then typically uses `emitter()` to invoke them:

```tsx
// Resolver returns a plain function
export function LoginResolver(): ResolvedProps<LoginProps> {
  return {
    onSubmit(formData: FormData) { /* ... */ },
  }
}

// Component receives it as an Observable and uses emitter()
export default function Login(input$: Observable<LoginProps>) {
  const { onSubmit$ } = Props.take(input$)
  const submitEmitter = emitter(onSubmit$)

  function handleSubmit(e: JsxRx.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    submitEmitter.emit(new FormData(e.target))
  }

  return <form onSubmit={handleSubmit}>...</form>
}
```

---

## Lazy Resolvers

Resolvers can be lazily loaded alongside their components for code splitting. Use `lazy()` from `@jsxrx/core` for the component and `lazyResolver()` from `@jsxrx/router` for the resolver.

Source: `apps/frontend/src/routes.ts`

```tsx
import { lazy } from "@jsxrx/core"
import { defineRoutes, lazyResolver, route } from "@jsxrx/router"

// Lazy component (default export)
const Home = lazy(() => import("./components/home/Home.js"))
// Lazy resolver (named export)
const HomeResolver = lazyResolver(
  () => import("./components/home/Home.js"),
  "HomeResolver",
)

// Lazy layout
const FullLayout = lazy(() => import("./components/layout/FullLayout.js"))
const FullLayoutResolver = lazyResolver(
  () => import("./components/layout/FullLayout.js"),
  "FullLayoutResolver",
)

export const routes = defineRoutes({
  index: route("root", RootLayout, {
    resolve: RootLayoutResolver,
    children: {
      index: route("root-layout", FullLayout, {
        resolve: FullLayoutResolver,
        children: {
          "/entries": route("entries", EntryList, {
            resolve: EntryListResolver,
          }),
        },
      }),
    },
  }),
})
```

**Important:** `lazyResolver()` returns an `Observable<RouteResolver>`, not the resolver function directly. The router subscribes to this observable when the route first matches, triggering the dynamic import. The module's named export must match the `RouteResolver<Props, Path, Query>` signature.

Source: [`packages/router/src/lazy.js`](../../packages/router/src/lazy.js)

```js
export function lazyResolver(importer, name) {
  return new Observable(subscriber => {
    return from(importer())
      .pipe(
        map(mod => {
          const modName = name ?? "default"
          assert(
            modName in mod,
            `Lazy resolver module "${String(modName)}" does not exists`,
          )
          return mod[modName]
        }),
      )
      .subscribe(subscriber)
  })
}
```

### Eager vs Lazy

| Approach | Use when | Trade-off |
|---|---|---|
| **Eager** (import at top) | Critical-path routes (home, login) | Included in initial bundle |
| **Lazy** (`lazy()` + `lazyResolver()`) | Non-critical routes | Code-split; loaded on first visit |

You can mix eager and lazy in the same route tree. The root layout is often eager (it runs on every page), while child routes are lazy.

---

## Multiple Files Example

Here is a complete route tree with co-located component + resolver files, exactly as structured in `apps/frontend/src/`:

```text
src/
  contexts/
    auth/
      login.ts              — AuthLoginContext definition + provideAuthContext()
  components/
    layout/
      RootLayout.tsx        — exports default RootLayout + RootLayoutResolver
      FullLayout.tsx        — exports default FullLayout + FullLayoutResolver
    home/
      Home.tsx              — exports default Home + HomeResolver
    auth/
      Login.tsx             — exports default Login + LoginResolver
    entry/
      EntryList.tsx         — exports default EntryList + EntryListResolver
  routes.ts                 — defineRoutes with lazy + lazyResolver
  main.tsx                  — createRoot + BrowserRouter
```

### `src/routes.ts` — Route Definitions

```tsx
import { lazy } from "@jsxrx/core"
import { defineRoutes, lazyResolver, route } from "@jsxrx/router"

const RootLayout = lazy(() => import("./components/layout/RootLayout.js"))
const RootLayoutResolver = lazyResolver(
  () => import("./components/layout/RootLayout.js"),
  "RootLayoutResolver",
)

const FullLayout = lazy(() => import("./components/layout/FullLayout.js"))
const FullLayoutResolver = lazyResolver(
  () => import("./components/layout/FullLayout.js"),
  "FullLayoutResolver",
)

const Login = lazy(() => import("./components/auth/Login.js"))
const LoginResolver = lazyResolver(
  () => import("./components/auth/Login.js"),
  "LoginResolver",
)

const Home = lazy(() => import("./components/home/Home.js"))
const HomeResolver = lazyResolver(
  () => import("./components/home/Home.js"),
  "HomeResolver",
)

const EntryList = lazy(() => import("./components/entry/EntryList.js"))
const EntryListResolver = lazyResolver(
  () => import("./components/entry/EntryList.js"),
  "EntryListResolver",
)

export const routes = defineRoutes({
  index: route("root", RootLayout, {
    resolve: RootLayoutResolver,
    children: {
      "/login": route("login", Login, {
        resolve: LoginResolver,
      }),
      index: route("root-layout", FullLayout, {
        resolve: FullLayoutResolver,
        children: {
          "/": route("home", Home, {
            resolve: HomeResolver,
          }),
          "/entries": route("entries", EntryList, {
            resolve: EntryListResolver,
          }),
        },
      }),
    },
  }),
})
```

### `src/main.tsx` — Entry Point

```tsx
import { createRoot } from "@jsxrx/core/dom"
import { BrowserRouter } from "@jsxrx/router/browser"
import { routes } from "./routes"

createRoot(document.querySelector("[root]")).mount(
  <BrowserRouter routes={routes} />,
)
```

### `src/components/layout/RootLayout.tsx` — Root Layout (Context Provision)

```tsx
import { provideAuthContext } from "@/contexts/auth/login"
import { Props, PropsWithChildren } from "@jsxrx/core"
import { ResolvedProps, RouteResolverInput } from "@jsxrx/router"
import { Observable } from "rxjs"

export type RootLayoutProps = PropsWithChildren

// Resolver: inject auth context into the entire app
export function RootLayoutResolver({
  url$,
  context,
}: RouteResolverInput): ResolvedProps<RootLayoutProps> {
  provideAuthContext(context, url$)
  return {}
}

// Component: just render children
export default function RootLayout(props$: Observable<RootLayoutProps>) {
  const { children$ } = Props.take(props$)
  return children$
}
```

### `src/components/layout/FullLayout.tsx` — Full Layout (Context Consumption + Navigation)

```tsx
import { AuthLoginContext } from "@/contexts/auth/login"
import { authLogoutEndpoint } from "@/api/auth/logout"
import { Props, PropsWithChildren } from "@jsxrx/core"
import { ResolvedProps, RouteResolverInput } from "@jsxrx/router"
import { lastValueFrom, map, Observable, take } from "rxjs"

type FullLayoutProps = PropsWithChildren<{
  user: UserData | null
  onLogin?(): void
  onLogout?(): void
}>

// Resolver: consume auth context, provide navigation callbacks
export function FullLayoutResolver({
  url$,
  context,
  navigate,
  refresh,
}: RouteResolverInput): ResolvedProps<FullLayoutProps> {
  const authContext$ = context.require(AuthLoginContext)
  const logoutAction = authLogoutEndpoint.action()

  return {
    user: authContext$.pipe(map(data => data?.user ?? null)),
    async onLogin() {
      const url = await lastValueFrom(url$.pipe(take(1)))
      navigate("/login", { query: { next: url.pathname } })
    },
    async onLogout() {
      await logoutAction.perform(null)
      navigate("/")
      refresh()
    },
  }
}

// Component: render header with user info + children
export default function FullLayout(input$: Observable<FullLayoutProps>) {
  const { children$, user$, onLogin$, onLogout$ } = Props.take(input$)

  const displayName$ = user$.pipe(map(user =>
    user?.firstName ?? user?.email ?? null
  ))

  return (
    <>
      <header>
        <h1>TSM</h1>
        {displayName$.pipe(map(name =>
          name
            ? <button onClick={onLogout$}>{name} (Logout)</button>
            : <button onClick={onLogin$}>Login</button>
        ))}
      </header>
      {children$}
    </>
  )
}
```

---

## Best Practices

### 1. Always co-locate the resolver in the same file as its component

```text
✅ Good:                               ❌ Avoid:
components/                            components/
  home/                                  home/
    Home.tsx  (component + resolver)        Home.tsx    (component only)
                                          resolvers/
                                            HomeResolver.ts  (resolver only)
```

The resolver and component form a single logical unit. Co-location makes it easy to see what data a component needs and where it comes from.

### 2. Name the resolver `{ComponentName}Resolver`

```tsx
// ✅ Consistent naming
export function HomeResolver() { ... }
export function LoginResolver() { ... }
export function FullLayoutResolver() { ... }

// ❌ Inconsistent
export function resolveHome() { ... }
export function loadLoginData() { ... }
```

The `{ComponentName}Resolver` convention makes it immediately clear which component a resolver serves. It also simplifies `lazyResolver()` imports, which rely on named exports.

### 3. Use `context.require()` (not `optional()`) when the context is mandatory

```tsx
// ✅ Fails fast with a clear error
const auth$ = context.require(AuthLoginContext)

// ❌ Silent failure — returns initialValue, hard to debug
const auth$ = context.optional(AuthLoginContext)
```

`require()` throws `"Unable to find required context for AuthLoginContext"` if the context was never set. This fails fast, making debugging straightforward. Reserve `optional()` for contexts that are genuinely optional (e.g., feature flags, theme overrides).

### 4. Use `refresh()` for pull-to-refresh or reload patterns instead of remounting

```tsx
export function DataResolver({ refresh }: RouteResolverInput) {
  return {
    data: fetchData(),
    onRefresh: () => refresh(),   // Re-runs resolvers, component stays mounted
  }
}
```

Calling `refresh()` re-executes all resolvers on the current route tree without unmounting and remounting the component. This preserves component-local state (e.g., scroll position, form input) while refreshing the data.

### 5. Return callbacks as plain functions from resolvers, use `emitter()` in the component

```tsx
// Resolver: return a plain function
export function MyResolver({ navigate }: RouteResolverInput) {
  return {
    onSave(data: FormData) {           // plain function
      // ... perform save ...
      navigate("/success")
    },
  }
}

// Component: wrap with emitter()
export default function MyPage(props$: Observable<MyPageProps>) {
  const { onSave$ } = Props.take(props$)
  const saveEmitter = emitter(onSave$)

  function handleSubmit(e: JsxRx.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    saveEmitter.emit(new FormData(e.target))
  }

  return <form onSubmit={handleSubmit}>...</form>
}
```

The resolver returns the callback as a plain function. `Props.take()` wraps it in an Observable. The component uses `emitter()` to create an object with an `.emit()` method that invokes the latest callback from the observable stream.

### 6. Keep resolvers synchronous — express async work via observables

```tsx
// ✅ Async work expressed as an observable pipeline
export function EntryListResolver(): ResolvedProps<EntryListProps> {
  const fetchResult$ = listEntriesEndpoint.fetch(state({ from, to }))
  return {
    entries: fetchResult$.pipe(map(result => result.entries)),
    isLoading: pending(fetchResult$),
  }
}

// ❌ Avoid async resolvers
export async function BadResolver() {
  const data = await fetch("/api/data")
  return { data }   // Resolvers are expected to be synchronous
}
```

Resolvers run synchronously. The router invokes the resolver and immediately uses the returned props to render the component. For async work (HTTP calls, timers, etc.), return observables that emit when the data arrives.

### 7. Derive minimal props — let the component compose further

```tsx
// ✅ Resolver returns raw data; component derives display values
export function HomeResolver({ context }: RouteResolverInput) {
  const auth$ = context.require(AuthLoginContext)
  return {
    user: auth$.pipe(map(state => state.user)),    // raw user object
    isLoading: auth$.pipe(map(state => state.isLoading)),
  }
}

export default function Home(props$: Observable<HomeProps>) {
  const { user$ } = Props.take(props$)
  const displayName$ = user$.pipe(map(u => u?.firstName ?? "Guest"))  // derived in component
  return <p>Hello {displayName$}!</p>
}
```

The resolver provides the raw data. The component derives display-specific values (formatted names, computed booleans, etc.). This keeps the resolver focused on data fetching/context and the component focused on presentation logic.

---

## Summary

| Concept | Description |
|---|---|
| **Route file structure** | Export a default component + a named `{Name}Resolver` function |
| **Resolver role** | Data fetching, context injection, navigation guards, callbacks |
| **Component role** | Presentation-only — receives `Observable<Props>` |
| **`RouteResolverInput`** | `{ navigate, url$, context, refresh, path, query }` |
| **Context provision** | `context.set(Context, observable$)` in parent resolvers |
| **Context consumption** | `context.require(Context)` in child resolvers (fails fast) |
| **`ResolvedProps`** | Each value is `T \| Observable<T>`; `children` is stripped |
| **Lazy loading** | `lazy()` for component + `lazyResolver()` for resolver |
| **`refresh()`** | Re-runs resolvers without remounting components |
| **Callbacks** | Return plain functions from resolver; use `emitter()` in component |

---

## Source Files Referenced

| Concept | Source File |
|---|---|
| `route()`, `defineRoutes()`, `params()` | [`packages/router/src/route.js`](../../packages/router/src/route.js) |
| `RouteResolverInput`, `ResolvedProps`, `RouteResolver` | [`packages/router/src/types.ts`](../../packages/router/src/types.ts) |
| `lazyResolver()` | [`packages/router/src/lazy.js`](../../packages/router/src/lazy.js) |
| Route tree definition | [`apps/frontend/src/routes.ts`](../../../apps/frontend/src/routes.ts) |
| Context provision (auth) | [`apps/frontend/src/contexts/auth/login.ts`](../../../apps/frontend/src/contexts/auth/login.ts) |
| Root layout + resolver | [`apps/frontend/src/components/layout/RootLayout.tsx`](../../../apps/frontend/src/components/layout/RootLayout.tsx) |
| Full layout + resolver | [`apps/frontend/src/components/layout/FullLayout.tsx`](../../../apps/frontend/src/components/layout/FullLayout.tsx) |
| Login + resolver | [`apps/frontend/src/components/auth/Login.tsx`](../../../apps/frontend/src/components/auth/Login.tsx) |
| Home + resolver | [`apps/frontend/src/components/home/Home.tsx`](../../../apps/frontend/src/components/home/Home.tsx) |
| Entry list + resolver | [`apps/frontend/src/components/entry/EntryList.tsx`](../../../apps/frontend/src/components/entry/EntryList.tsx) |
