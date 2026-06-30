## Routing

JsxRx routing is built on a **resolver pattern**: data fetching, auth checks, and context provisioning happen *before* the component renders. Resolvers are synchronous functions that return observables — the component receives those observables as props. There are no loaders, no `useParams()`, and no JSX-based providers.

Routing uses two packages:
- **`@jsxrx/router`** — `route()`, `defineRoutes()`, `params()`, `lazyResolver()`, `navigate()`
- **`@jsxrx/router/browser`** — `<BrowserRouter>`

The data flow: **URL changes → BrowserRouter matches route chain → resolvers execute top-down → context flows parent → child → components render with resolved props.**

---

### Route Tree Definition

Routes are defined as a tree using `route()` and wrapped with `defineRoutes()`:

```tsx
import { defineRoutes, route } from "@jsxrx/router"

const routes = defineRoutes({
  "/": route("home", HomePage),
  "/about": route("about", AboutPage),
  "/*": route("not-found", NotFoundPage),
})
```

`defineRoutes()` is an **identity function** — it returns the input unchanged. Its purpose is compile-time type-checking: it ensures child routes are only defined when the parent component accepts `children`, and that resolver return types match the component's props interface.

`route(id, component, options?)` creates a route node:
- **`id`** — unique identifier (used for rendering keys and debugging).
- **`component`** — the component to render when this route matches. Can be a `lazy()` component.
- **`options`** — optional object with `resolve` (resolver), `params` (typed parameters), and `children` (nested routes).

The top-level keys in the object passed to `defineRoutes()` are path patterns relative to the root:
- `"/"` — matches the root path exactly.
- `"/about"` — matches `/about`.
- `"/users/:id"` — matches `/users/123` with `:id` extracted as a path parameter.
- `"/*"` — catch-all for any unmatched path (typically a 404 page).

---

### BrowserRouter

`<BrowserRouter>` is the top-level component that listens to browser navigation and renders the matched route chain:

```tsx
import { BrowserRouter } from "@jsxrx/router/browser"

function App() {
  return <BrowserRouter routes={routes} />
}
```

It accepts a single `routes` prop (the tree defined with `defineRoutes()`). Internally it:
- Listens to browser `popstate` events for back/forward navigation.
- Creates a `url$` observable that emits a new `URL` on every navigation.
- Recursively matches the current URL against the route tree.
- Renders the matching chain: parent layout → child page → nested children.
- Provides `navigate()` and `refresh()` to every resolver in the tree.

When the URL changes, the router re-matches the entire tree. Routes that no longer match are unmounted; newly matching routes are mounted with their resolvers executed. Routes that continue to match are **not** remounted — their `props$` observable emits new values instead. Components run once; observables drive the updates.

---

### Route Resolvers — The Core Pattern

A **route resolver** is a function attached to a route via the `resolve` option. It runs **before** the component renders, receives routing context, and returns the props that flow into the component's `props$` stream:

```tsx
import type { RouteResolverInput, ResolvedProps } from "@jsxrx/router"
import { map } from "rxjs"

type DashboardProps = {
  title: string
  stats: StatsData | null
  user: UserData | null
}

export function DashboardResolver(
  { context }: RouteResolverInput
): ResolvedProps<DashboardProps> {
  const auth$ = context.require(AuthContext)

  return {
    title: "Dashboard",                              // plain value — auto-wrapped
    stats: statsApi.fetch(),                         // Observable — used as-is
    user: auth$.pipe(map(s => s.user)),
  }
}
```

**`RouteResolverInput`** — the object every resolver receives:

| Field | Type | Description |
|---|---|---|
| `url$` | `Observable<URL>` | Reactive URL object. Emits on every navigation. |
| `path` | `Record<Path, Observable<string>>` | Typed path parameters (e.g., `:id`). |
| `query` | `Record<Query, Observable<string[] \| undefined>>` | Typed query parameters. |
| `context` | `IContextMap` | Context map — `context.set()` / `context.require()` / `context.optional()`. |
| `navigate` | `NavigateFn` | Imperative navigation function. |
| `refresh` | `() => void` | Re-execute all resolvers on the current route tree. |

**`ResolvedProps<Props>`** — the return type. For each prop key (except `children`), the resolver can return either a plain value `T` or an `Observable<T>`. The router wraps plain values into observables automatically. `children` is **always stripped** — the router manages it internally; resolvers never return it.

**Combining sources with `combine` and `of`:**

When a resolver needs to merge multiple observables (or plain values) into a single reactive prop, use `combine` from `@jsxrx/core` and `of` from `rxjs`:

```tsx
import { combine } from "@jsxrx/core"
import type { RouteResolverInput, ResolvedProps } from "@jsxrx/router"
import { map } from "rxjs"
import { of } from "rxjs"

type DashboardProps = {
  title: string
  view: { user: UserData | null; greeting: string; stats: StatsData | null }
}

export function DashboardResolver(
  { context }: RouteResolverInput
): ResolvedProps<DashboardProps> {
  const auth$ = context.require(AuthContext)

  return {
    title: of("Dashboard"),                              // explicit observable via of()
    view: combine({                                      // merge multiple sources
      user: auth$.pipe(map(s => s.user)),
      greeting: of("Welcome back"),                       // static → observable
      stats: statsApi.fetch(),                            // already an Observable
    }),
  }
}
```

`combine({ key1: obs1$, key2: value })` takes a plain object with observable or plain value entries and returns an `Observable` that emits a plain object with the same keys but all values unwrapped. It emits whenever any input observable changes, with automatic deduplication.

`of(value)` wraps a plain value in an `Observable` that emits once and completes. Use it when a prop must be an observable but the value is static — for consistency with other observable props, or as input to `combine`.

Key points:
- Resolvers run **synchronously** when the route matches. For async work (HTTP calls, timers), return observables — the component receives emissions reactively.
- Returned observables feed directly into the component's `props$`. The component never re-executes — only the observable emissions change.
- Use `navigate()` for redirects, `refresh()` to re-run resolution.
- Resolvers receive the full `IContextMap` — context set by parent route resolvers is available to child resolvers.

---

### Co-located Pattern (RECOMMENDED)

Resolver and component live in the **same file**. Export the resolver as a named function and the component as the default export. This keeps the data layer and presentation layer together — when you open a route file, you see what data it needs and where it comes from:

```
src/
  components/
    home/
      Home.tsx         ← exports HomeResolver (named) + Home (default)
    auth/
      Login.tsx        ← exports LoginResolver (named) + Login (default)
    layout/
      RootLayout.tsx   ← exports RootLayoutResolver (named) + RootLayout (default)
```

**Example — co-located Home route:**

```tsx
// Home.tsx
import { Props } from "@jsxrx/core"
import type { ResolvedProps, RouteResolverInput } from "@jsxrx/router"
import { map } from "rxjs"
import type { Observable } from "rxjs"

type HomeProps = Readonly<{
  user: UserData | null
  onRefresh: () => void
}>

// Resolver (named export) — data fetching + context + callbacks
export function HomeResolver(
  { context, refresh }: RouteResolverInput
): ResolvedProps<HomeProps> {
  const auth$ = context.require(AuthContext)

  return {
    user: auth$.pipe(map(s => s.user)),
    onRefresh: () => refresh(),
  }
}

// Component (default export) — presentation only
export default function Home(props$: Observable<HomeProps>) {
  const { user$, onRefresh$ } = Props.take(props$)

  return (
    <main>
      <p>Hello {user$.pipe(map(u => u?.name ?? "Guest"))}</p>
      <button onClick={onRefresh$}>Refresh</button>
    </main>
  )
}
```

**Usage in the route tree:**

```tsx
import { defineRoutes, route } from "@jsxrx/router"
import Home, { HomeResolver } from "./components/home/Home"

export const routes = defineRoutes({
  "/": route("home", Home, {
    resolve: HomeResolver,
  }),
})
```

The naming convention is `{ComponentName}Resolver` — it makes the binding between resolver and component immediately clear.

---

### Context in Resolvers

There are **no JSX provider components** in JsxRx. Context is provisioned imperatively in resolvers, before any component in that subtree renders. Parent resolvers set context; child resolvers consume it.

**Providing context (parent resolver):**

```tsx
import { state } from "@jsxrx/core"
import { Context } from "@jsxrx/core"
import type { RouteResolverInput } from "@jsxrx/router"

// Define a context key
export const AuthContext = new Context<{ user: UserData | null }>(
  "auth",
  { user: null }
)

export function RootLayoutResolver(
  { context, url$ }: RouteResolverInput
) {
  const auth$ = state<{ user: UserData | null }>({ user: null })

  // Fetch auth state reactively
  authEndpoint.fetch(url$).subscribe(s => auth$.set(s))

  // Set context — all child resolvers can now access it
  context.set(AuthContext, auth$)

  return {}
}
```

**Consuming context (child resolver):**

```tsx
import type { RouteResolverInput } from "@jsxrx/router"
import { AuthContext } from "../contexts"
import { map } from "rxjs"

export function ProfileResolver(
  { context }: RouteResolverInput
) {
  // context.require() — throws if context was never set
  const auth$ = context.require(AuthContext)

  return {
    userName: auth$.pipe(map(s => s.user?.name ?? "Guest")),
  }
}
```

Two methods for consuming context:

| Method | Missing context behavior | Use case |
|---|---|---|
| `context.require(Context)` | **Throws** with a clear error message | Context is mandatory |
| `context.optional(Context)` | Returns `Context.initialValue` | Context may legitimately not exist |

**Always prefer `require()`** when context is mandatory — it fails fast with a clear error, making debugging easier than silent defaults.

**The context chain:** parent resolvers set context → child resolvers inherit it → grandchild resolvers can access anything set at any ancestor level. Changes to upstream context propagate reactively through the observable graph — downstream values update without re-running any resolver or component.

```
RootLayoutResolver     →  sets AuthContext
  └─ AdminLayoutResolver  →  sets WorkspaceContext (requires AuthContext)
       └─ DashboardResolver  →  reads WorkspaceContext, returns data
```

---

### Typed Parameters

Path and query parameters are declared with `params()` and passed to `route()` via the `params` option. This enables full TypeScript autocompletion and type-checking in the resolver:

```tsx
import { route, params } from "@jsxrx/router"
import type { RouteResolverInput } from "@jsxrx/router"

route("user", UserPage, {
  params: {
    path: params("id"),              // declares path param "id"
    query: params("tab", "sort"),    // declares query params "tab", "sort"
  },
  resolve({ path, query }: RouteResolverInput<"id", "tab" | "sort">) {
    // path.id   → Observable<string> ✅
    // path.name → TypeScript error ❌ — not declared
    // query.tab → Observable<string[] | undefined> ✅
    return {
      userId: path.id,
      activeTab: query.tab,
    }
  },
})
```

`params(...keys)` returns its arguments as an array — used purely for TypeScript type inference. It has no runtime effect.

Inside resolvers, `path.id` returns an `Observable<string>` that emits the current `:id` segment value whenever the URL changes. `query.tab` returns `Observable<string[] | undefined>`. Without `params()`, `path` and `query` still work at runtime but carry no type information.

---

### navigate()

`navigate()` provides imperative navigation with full browser history control. It's available inside every resolver:

```tsx
import type { RouteResolverInput } from "@jsxrx/router"

// Basic navigation
navigate("/dashboard")

// Replace current history entry (no back-button to this page)
navigate("/login", { replace: true })

// With query parameters
navigate("/search", { query: { q: "JsxRx", page: "1" } })

// With path parameter substitution
navigate("/users/:id", { params: { id: "42" } })          // → /users/42

// With both params and query
navigate("/users/:id/posts", {
  params: { id: "42" },
  query: { sort: "date" },
})                                                         // → /users/42/posts?sort=date
```

| Option | Type | Description |
|---|---|---|
| `replace` | `boolean` | Uses `replaceState` instead of `pushState`. |
| `query` | `Record<string, string \| string[]>` | Query parameters to append. Arrays produce multiple key=value pairs. |
| `params` | `Record<string, string>` | Path parameter substitutions for `:param` segments. |

Each `navigate()` call pushes the new URL to the browser history and triggers the `url$` observable, causing the router to re-match the route tree.

**Auth guard pattern with `navigate()`:**

```tsx
import type { RouteResolverInput } from "@jsxrx/router"
import { map, take } from "rxjs"

export function DashboardResolver(
  { context, navigate }: RouteResolverInput
) {
  const auth$ = context.require(AuthContext)

  // Redirect unauthenticated users imperatively
  auth$.pipe(take(1)).subscribe(state => {
    if (!state.user) {
      navigate("/login", { replace: true })
    }
  })

  return { user: auth$.pipe(map(s => s.user)) }
}
```

---

### refresh()

`refresh()` re-executes **all resolvers on the current route tree** without remounting the components. The components stay mounted — only the resolvers re-run, producing fresh props that flow into the existing components.

Use it for pull-to-refresh, reload buttons, or when a mutation should invalidate data:

```tsx
import type { RouteResolverInput } from "@jsxrx/router"

export function EntryListResolver(
  { refresh }: RouteResolverInput
) {
  return {
    entries$: entriesApi.fetch(),
    onReload: () => refresh(),    // re-run all resolvers for this route
  }
}
```

> ⚠️ **CRITICAL: Never call `refresh()` synchronously inside a resolver body.** Doing so creates an infinite loop — the resolver calls refresh, which re-runs the resolver, which calls refresh again. Only call `refresh()` from returned callbacks or event handlers:
>
> ```tsx
> // ❌ WRONG — infinite loop
> export function BadResolver({ refresh }: RouteResolverInput) {
>   refresh()                        // called synchronously during resolution
>   return {}
> }
>
> // ✅ RIGHT — returned as a callback
> export function GoodResolver({ refresh }: RouteResolverInput) {
>   return { onReload: () => refresh() }
> }
> ```

---

### Layout Routes

A route with `children` is a **layout route**. Its component must accept a `children$` prop. Child routes render inside `children$`, enabling persistent UI (nav bars, sidebars) that doesn't remount when navigating between child routes:

```tsx
import { Props } from "@jsxrx/core"
import type { RouteResolverInput } from "@jsxrx/router"
import { map, take } from "rxjs"

// ── AdminLayout component ──
export function AdminLayoutResolver(
  { context, navigate }: RouteResolverInput
) {
  const auth$ = context.require(AuthContext)

  // Auth guard: redirect non-admin users
  auth$.pipe(take(1)).subscribe(s => {
    if (!s.user?.isAdmin) navigate("/", { replace: true })
  })

  return { user: auth$.pipe(map(s => s.user)) }
}

export default function AdminLayout(props$: Observable<{
  user: UserData | null
  children?: ElementNode
}>) {
  const { user$, children$ } = Props.take(props$)

  return (
    <div class="admin-shell">
      <nav>
        <span>{user$.pipe(map(u => u?.name ?? ""))}</span>
        <a href="/admin/dashboard">Dashboard</a>
        <a href="/admin/users">Users</a>
      </nav>
      <main>{children$}</main>
    </div>
  )
}
```

```tsx
// ── Route tree with layout ──
import { defineRoutes, route } from "@jsxrx/router"

export const routes = defineRoutes({
  "/admin": route("admin-layout", AdminLayout, {
    resolve: AdminLayoutResolver,
    children: {
      "/dashboard": route("admin-dashboard", AdminDashboard, {
        resolve: AdminDashboardResolver,
      }),
      "/users": route("admin-users", AdminUsers, {
        resolve: AdminUsersResolver,
      }),
    },
  }),
})
```

Navigating between `/admin/dashboard` and `/admin/users` keeps the `AdminLayout` mounted — only the inner component changes and its resolver re-runs. The nav bar and shell persist.

---

### Lazy Loading with Routing

For code-split routes, JsxRx provides `lazy()` for components and `lazyResolver()` for resolvers. **Both load from the same module**, keeping the component and its resolver co-located in a single chunk:

```tsx
import { lazy } from "@jsxrx/core"
import { lazyResolver, route } from "@jsxrx/router"

// Lazy component (default export from chunk)
const UserPage = lazy(() => import("./UserPage"), "default")

// Lazy resolver (named export from same chunk)
const UserResolver = lazyResolver(() => import("./UserPage"), "UserResolver")

const userRoute = route("user", UserPage, {
  resolve: UserResolver,
})
```

`lazy()` returns a `Component` that triggers the dynamic import only when the route is first rendered. `lazyResolver()` returns an `Observable` that the router subscribes to when the route first matches — it calls the importer, extracts the named export, and emits the resolver once.

**Wrap lazy components in `<Suspense>`** at the parent layout level to handle the loading state while code downloads. For full lazy loading details (chunk output, nested lazy routes, load sequences, `tolerance`), see [references/lazy-loading.md](lazy-loading.md).

---

### Complete Routes File

Here is a minimal but complete `routes.ts` file demonstrating all patterns: layout route, parameterized child, auth guard via resolver, context provision, and a 404 catch-all:

```tsx
// routes.ts
import { lazy } from "@jsxrx/core"
import {
  defineRoutes,
  lazyResolver,
  params,
  route,
} from "@jsxrx/router"

// ── Lazy imports (co-located: component + resolver from same module) ──
const RootLayout = lazy(() => import("./components/layout/RootLayout"), "default")
const RootLayoutResolver = lazyResolver(
  () => import("./components/layout/RootLayout"),
  "RootLayoutResolver",
)

const Home = lazy(() => import("./components/home/Home"), "default")
const HomeResolver = lazyResolver(
  () => import("./components/home/Home"),
  "HomeResolver",
)

const UserPage = lazy(() => import("./components/user/User"), "default")
const UserResolver = lazyResolver(
  () => import("./components/user/User"),
  "UserResolver",
)

const NotFound = lazy(() => import("./components/NotFound"), "default")

// ── Route tree ──
export const routes = defineRoutes({
  index: route("root", RootLayout, {
    resolve: RootLayoutResolver,        // sets AuthContext, fetches auth state
    children: {
      "/": route("home", Home, {
        resolve: HomeResolver,           // requires AuthContext, returns dashboard data
      }),
      "/users/:id": route("user", UserPage, {
        params: { path: params("id") },
        resolve: UserResolver,           // receives path.id, requires AuthContext
      }),
      "/*": route("not-found", NotFound), // catch-all 404
    },
  }),
})
```

The root layout persists across all navigation. `RootLayoutResolver` provisions `AuthContext`, which every child resolver can consume with `context.require(AuthContext)`. The `/*` catch-all ensures unmatched URLs render the NotFound component instead of a blank page.

Entry point usage:

```tsx
// main.tsx
import { createRoot } from "@jsxrx/core/dom"
import { BrowserRouter } from "@jsxrx/router/browser"
import { routes } from "./routes"

createRoot(document.querySelector("div[root]")!).mount(
  <BrowserRouter routes={routes} />,
)
```

---

For the complete `@jsxrx/router` API reference — including `matchUrl()`, `parsePathnameParams()`, all type signatures (`Routes`, `Route`, `RouteMatch`, `NavigateFn`, `NavigateOptions`), error handling, and full examples — see the routing section above, which covers all core patterns end-to-end.
