# Routing & Route Resolvers

JsxRx provides declarative, type-safe routing through `@jsxrx/router`. Unlike traditional routers that map URLs to components, JsxRx routes are backed by **route resolvers** — pure functions that run before the component mounts, provisioning data and context as observable props. This guide introduces the route tree, the resolver pattern, lazy loading, typed parameters, and how context flows through the resolver hierarchy.

---

## Table of Contents

1. [What is JsxRx Routing?](#1-what-is-jsxrx-routing)
2. [The Route Tree](#2-the-route-tree)
3. [BrowserRouter](#3-browserrouter)
4. [Route Resolvers — Data Fetching & Logic](#4-route-resolvers--data-fetching--logic)
5. [Context in Resolvers](#5-context-in-resolvers)
6. [Typed Parameters](#6-typed-parameters)
7. [Navigation](#7-navigation)
8. [Lazy Loading Routes](#8-lazy-loading-routes)
9. [Route Definition in a Routes File](#9-route-definition-in-a-routes-file)
10. [Summary](#10-summary)

---

## 1. What is JsxRx Routing?

JsxRx routing is built on three pieces:

1. **A declarative route tree** — defined with `route()` and `defineRoutes()`, forming a hierarchy of layouts and pages.
2. **Route resolvers** — functions that run when a route matches, fetching data, setting context, and returning the props that flow into the component.
3. **BrowserRouter** — the top-level component that listens to browser navigation events, matches URLs against the route tree, and renders the matching chain.

The data flow: **URL changes → BrowserRouter matches route chain → resolvers execute top-down → context flows parent → child → components render with resolved props.**

---

## 2. The Route Tree

Routes are defined as a tree using two functions from `@jsxrx/router`:

```tsx
import { defineRoutes, route } from "@jsxrx/router"
import { BrowserRouter } from "@jsxrx/router/browser"

const routes = defineRoutes({
  index: route("root", RootLayout, {
    children: {
      "/": route("home", Home),
      "/about": route("about", About),
      "/users/:id": route("user", UserPage),
    },
  }),
})
```

### `defineRoutes()`

`defineRoutes(input)` is an **identity function** — it returns `input` unchanged. Its purpose is compile-time type-checking: ensuring child routes are only defined when the parent component accepts `children`, and that resolver return types match the component's props interface.

### `route(id, component, options?)`

Creates a route definition. `id` is a unique identifier (used for rendering keys and debugging). `component` is the component to render when this route matches. `options` provides `resolve` (resolver function), `params` (typed parameters), and `children` (nested routes).

### Path Segments & Parameters

Children keys are path segments relative to the parent:

| Key | Meaning |
|-----|---------|
| `"/"` | Matches the parent's path exactly (home/index page). |
| `"/about"` | Matches `{parentPath}/about`. |
| `"/users/:id"` | Matches `{parentPath}/users/123`. `:id` is extracted as a path parameter. |

The top-level `index` key defines the **root layout route** — its `children` object defines all top-level URL patterns. Segments prefixed with `:` (e.g., `:id`, `:slug`) are dynamic parameters, available to resolvers via `input.path` (see [Typed Parameters](#6-typed-parameters)).

### Layout Routes

A route with `children` is a **layout route**. Its component must accept a `children$` prop (see [Components & Props](./components-and-props.md)). Child routes render inside `children$`, enabling persistent UI (nav bars, sidebars) that doesn't remount when navigating between child routes.

---

## 3. BrowserRouter

```tsx
import { BrowserRouter } from "@jsxrx/router/browser"

function App() {
  return <BrowserRouter routes={routes} />
}
```

`<BrowserRouter routes={routes} />` is the top-level router component. It:

- Listens to browser `popstate` events for back/forward navigation.
- Creates a `url$` observable that emits a new `URL` on every navigation.
- Recursively matches the current URL against the route tree.
- Renders the matching chain: parent layout → child page → nested children.
- Provides `navigate()` and `refresh()` to every resolver in the tree.

When the URL changes, the router re-matches the entire tree. Routes that no longer match are unmounted; newly matching routes are mounted with their resolvers executed. Routes that continue to match are **not** remounted — their `props$` observable emits new values instead. This is the same lifecycle model from [Components & Props](./components-and-props.md): components run once, and observables drive updates.

---

## 4. Route Resolvers — Data Fetching & Logic

A **route resolver** is a function attached to a route via the `resolve` option. It runs **before** the component renders and returns the props that flow into the component's `props$` stream.

### RouteResolverInput

```tsx
type RouteResolverInput<Path extends string, Query extends string> = {
  url$:      Observable<URL>                                 // reactive URL
  path:      Record<Path, Observable<string>>                 // typed path params
  query:     Record<Query, Observable<string[] | undefined>>  // typed query params
  context:   IContextMap                                      // context map
  navigate:  (to: string, options?: NavigateOptions) => void
  refresh:   () => void                                       // re-run the resolver
}
```

Every resolver receives this input, with `Path` and `Query` narrowed by the route's `params` declaration.

### Basic Resolver Example

Resolvers are **co-located** with their component in the same file. Export both so the routes file imports them together:

```tsx
// UserPage.tsx
import { map, switchMap } from "rxjs"
import { of } from "rxjs"
import type { ResolvedProps, RouteResolverInput } from "@jsxrx/router"

type UserPageProps = {
  user$: Observable<User | null>
  posts$: Observable<Post[]>
}

export function UserPageResolver(
  { url$ }: RouteResolverInput<"id">
): ResolvedProps<UserPageProps> {
  const userId$ = url$.pipe(map(url => url.pathname.split("/").pop()!))

  return {
    user$: userId$.pipe(switchMap(id => userApi.fetch(of({ id })))),
    posts$: userId$.pipe(switchMap(id => postApi.fetch(of({ userId: id })))),
  }
}

export function UserPage(props$: Observable<UserPageProps>) {
  const { user$, posts$ } = Props.take(props$)
  // ... render UI
}
```

### ResolvedProps — What Resolvers Return

`ResolvedProps<Props>` = `Properties<Omit<Props, "children">>`. For each prop key (except `children`), the resolver can return either a plain value or an `Observable`. The router wraps plain values into observables automatically. `children` is **always stripped** — the router manages it internally; resolvers never return it.

```tsx
function DashboardResolver(): ResolvedProps<DashboardProps> {
  return {
    title: "Dashboard",              // plain value → auto-wrapped
    stats$: statsApi.fetch(),        // already an Observable → used as-is
    // children is absent — handled by the router
  }
}
```

The resolver runs synchronously when the route matches. For async work (HTTP calls, timers), return observables — the component receives emissions reactively without re-running.

### Imperative Redirects

Use `navigate()` for redirects from resolvers:

```tsx
import { take } from "rxjs"

export function DashboardResolver({ context, navigate }: RouteResolverInput) {
  const auth$ = context.require(AuthContext)

  auth$.pipe(take(1)).subscribe(state => {
    if (!state.user) navigate("/login")
  })

  return {}
}
```

### refresh() — Re-executing the Resolver

Call `refresh()` to re-run the resolver **without remounting the component**:

```tsx
export function EntryListResolver({ refresh }: RouteResolverInput) {
  return {
    onReload: () => refresh(),
    entries$: entriesApi.fetch(),
  }
}
```

`refresh()` pushes a new value through the router's internal `refresher$` Subject, causing `url$` to re-emit. The resolver re-executes, and new resolved props flow into the component.

---

## 5. Context in Resolvers

This is where resolvers connect to the [Context API](./context.md). The `context` parameter is the same `IContextMap` used throughout JsxRx. Parent resolvers **set** context; child resolvers **consume** it.

### Providing Context (Parent Resolver)

```tsx
import { state } from "@jsxrx/core"
import { AuthContext } from "../contexts/auth"

export function RootLayoutResolver({ context, url$ }: RouteResolverInput) {
  const authState$ = state({ user: null, loading: true })

  authEndpoint.fetch(url$).subscribe(state => authState$.set(state))

  // Set context — all child resolvers can now access it
  context.set(AuthContext, authState$)

  return {}
}
```

### Consuming Context (Child Resolver)

```tsx
import { map } from "rxjs"
import { AuthContext } from "../contexts/auth"

export function ProfileResolver({ context }: RouteResolverInput) {
  const auth$ = context.require(AuthContext)   // throws if not set

  return {
    userName: auth$.pipe(map(s => s.user?.name ?? "Guest")),
  }
}
```

### The Pattern at Scale

```
RootLayoutResolver     →  sets AuthContext
  └─ FullLayoutResolver  →  sets WorkspaceContext (requires AuthContext)
       └─ EntryListResolver  →  reads WorkspaceContext, returns entries
```

Each resolver inherits context from all ancestors via `context.downstream()` scoping (see [Context API](./context.md#downstream--scoped-child-contexts)). A child resolver can `context.require()` any context set by a parent or grandparent. Changes to upstream context propagate reactively through the observable graph — downstream values update without re-running any resolver or component.

There are **no JSX provider components**. Context is provisioned imperatively in resolvers, before any component in that subtree renders.

---

## 6. Typed Parameters

Path and query parameters are declared with `params()` and passed to `route()` via the `params` option:

```tsx
import { route, params } from "@jsxrx/router"

route("user", UserPage, {
  params: {
    path: params("id"),            // declares path param "id"
    query: params("tab", "sort"),  // declares query params "tab", "sort"
  },
  resolve({ path, query }) {
    // path.id   → Observable<string>
    // query.tab → Observable<string[] | undefined>
    return {
      userId: path.id,
      activeTab: query.tab,
    }
  },
})
```

`params(...keys)` returns its arguments as an array — used purely for TypeScript type inference. It has no runtime effect.

The `path` and `query` parameters are proxies. `path.id` returns an `Observable<string>` emitting the current `:id` segment value. `query.tab` returns `Observable<string[] | undefined>`. Without `params()`, `path` and `query` still work at runtime but carry no type information.

---

## 7. Navigation

The `navigate()` function provides imperative navigation with browser history control:

```tsx
// Basic navigation
navigate("/dashboard")

// Replace current history entry
navigate("/login", { replace: true })

// With query parameters
navigate("/search", { query: { q: "JsxRx", page: "1" } })

// With path parameter substitution
navigate("/users/:id", { params: { id: "42" } })       // → /users/42

// With both params and query
navigate("/users/:id/posts", {
  params: { id: "42" },
  query: { sort: "date" },
})                                                      // → /users/42/posts?sort=date
```

| Option | Type | Description |
|--------|------|-------------|
| `replace` | `boolean` | Uses `replaceState` instead of `pushState`. |
| `query` | `Record<string, string \| string[]>` | Query parameters to append. |
| `params` | `Record<string, string>` | Path parameter substitutions for `:param` segments. |

Each `navigate()` call pushes the new URL to the browser history and triggers the `url$` observable, causing the router to re-match the route tree.

---

## 8. Lazy Loading Routes

Routes can be lazy-loaded for code splitting using `lazy()` (from `@jsxrx/core`) and `lazyResolver()` (from `@jsxrx/router`):

```tsx
import { lazy } from "@jsxrx/core"
import { lazyResolver } from "@jsxrx/router"

const UserPage = lazy(() => import("./UserPage"), "default")
const UserPageResolver = lazyResolver(() => import("./UserPage"), "UserPageResolver")
```

- **`lazy(importer, name)`** wraps a dynamic `import()` to create a component that loads on first render.
- **`lazyResolver(importer, name)`** wraps a dynamic `import()` and returns an **`Observable<RouteResolver>`**. The router subscribes when the route matches, triggering the import.

Both load from the **same module**, keeping the component and its resolver co-located in a single code-split chunk:

```tsx
route("user", lazy(() => import("./UserPage"), "default"), {
  resolve: lazyResolver(() => import("./UserPage"), "UserPageResolver"),
})
```

Wrap lazy routes in `<Suspense>` (see [Suspense & Loading States](./suspense.md)) so the user sees a loading skeleton while the chunk loads:

```tsx
import { Suspense } from "@jsxrx/core"

function App() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <BrowserRouter routes={routes} />
    </Suspense>
  )
}
```

The `lazy()`/`lazyResolver()` import only triggers when the route **matches** — unused routes never download their code. See the [Lazy Loading patterns guide](../patterns/lazy-loading.md) for more details.

---

## 9. Route Definition in a Routes File

Here is a complete routes file showing all the patterns together:

```tsx
// routes.ts
import { lazy } from "@jsxrx/core"
import { defineRoutes, lazyResolver, params, route } from "@jsxrx/router"

const RootLayout = lazy(() => import("./Layout"), "default")
const RootLayoutResolver = lazyResolver(() => import("./Layout"), "RootLayoutResolver")

const Home = lazy(() => import("./Home"), "default")
const HomeResolver = lazyResolver(() => import("./Home"), "HomeResolver")

const UserPage = lazy(() => import("./User"), "default")
const UserPageResolver = lazyResolver(() => import("./User"), "UserResolver")

const SettingsPage = lazy(() => import("./Settings"), "default")
const SettingsPageResolver = lazyResolver(() => import("./Settings"), "SettingsResolver")

export const routes = defineRoutes({
  index: route("root", RootLayout, {
    resolve: RootLayoutResolver,
    children: {
      "/": route("home", Home, {
        resolve: HomeResolver,
      }),
      "/users/:id": route("user", UserPage, {
        params: { path: params("id") },
        resolve: UserPageResolver,
      }),
      "/settings": route("settings", SettingsPage, {
        resolve: SettingsPageResolver,
      }),
    },
  }),
})
```

This structure ensures the root layout persists across navigation, each page is in its own chunk, context set in `RootLayoutResolver` is available to every child, and TypeScript provides full type checking across the route tree.

---

## 10. Summary

| Concept | Description |
|---------|-------------|
| **Route tree** | Declared via `defineRoutes()` and `route()`. Forms a hierarchy of layouts and pages. |
| **Resolvers** | Functions that run before components render. They fetch data, set/read context, and return props. |
| **BrowserRouter** | Top-level component. Listens to browser history, matches URLs, renders the matching route chain. |
| **Context flow** | Parent resolvers `context.set()`, child resolvers `context.require()`. No JSX providers needed. |
| **Typed params** | Declared via `params()`. Resolvers receive typed `Observable<string>` per parameter. |
| **Navigation** | `navigate()` with `replace`, `query`, and `params` options. |
| **Lazy loading** | `lazy()` + `lazyResolver()` load components and resolvers on demand from the same code-split module. |
| **Reactivity** | Resolved props flow as observables into components. Data changes propagate through the observable chain — no component re-renders. |

Routing in JsxRx is not just URL-to-component mapping. It is a **data pipeline**: resolvers provision context and fetch data, and the observable graph carries that data through the component tree, driving surgical DOM updates without re-renders.

---

## Source Files Referenced

| Concept | Source File |
|---------|-------------|
| `route()`, `defineRoutes()`, `params()` | [`packages/router/src/route.js`](../../packages/router/src/route.js) |
| `RouteResolverInput`, `ResolvedProps`, `RouteResolver`, `NavigateOptions` | [`packages/router/src/types.ts`](../../packages/router/src/types.ts) |
| `BrowserRouter`, `RouteComponent` | [`packages/router/src/browser/browser.js`](../../packages/router/src/browser/browser.js) |
| `lazyResolver()` | [`packages/router/src/lazy.js`](../../packages/router/src/lazy.js) |
| `matchUrl()`, `parsePathnameParams()` | [`packages/router/src/utils.js`](../../packages/router/src/utils.js) |
| Context API (`IContextMap`, `set`, `require`, `downstream`) | [`packages/core/src/context.js`](../../packages/core/src/context.js) |
