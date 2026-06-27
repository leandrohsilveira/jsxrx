# `@jsxrx/router` API Reference

Source files: `packages/router/src/route.js`, `packages/router/src/types.ts`, `packages/router/src/utils.js`, `packages/router/src/lazy.js`, `packages/router/src/browser/browser.js`

---

## 1. Installation

```bash
npm i @jsxrx/router
```

The router depends on `@jsxrx/core`, `@jsxrx/utils`, and `rxjs` — these are installed automatically.

---

## 2. Route Definition

### `route(id, component, options?)`

```ts
route<Props, Path extends string, Query extends string>(
  id: string,
  component: Component<Props>,
  options?: RouteOptions<Props, Path, Query>
): Route<Props, Path, Query>
```

Creates a route definition. Every route requires at minimum an `id` (used for debugging and rendering keys) and a component.

**Parameters**

| Parameter    | Type                          | Description                                                   |
| ------------ | ----------------------------- | ------------------------------------------------------------- |
| `id`         | `string`                      | Unique route identifier. Used for rendering keys and logging. |
| `component`  | `Component<Props>`            | The route component. Can be a `lazy()` component.             |
| `options`    | `RouteOptions` _(optional)_   | Resolver and child routes configuration.                      |

**`RouteOptions` fields**

| Field        | Type                                                      | Description                                                                 |
| ------------ | --------------------------------------------------------- | --------------------------------------------------------------------------- |
| `resolve`    | `RouteResolver \| Observable<RouteResolver>`               | Resolver function or observable that emits a resolver (for lazy loading).   |
| `params`     | `{ path?: K[], query?: K[] }`                             | Declared path/query parameter names for typed access in the resolver.       |
| `children`   | `Routes`                                                  | Nested route tree. Only available when `Props` extends `WithChildren`.      |

**Basic route (no resolver, no children)**

```tsx
import { route } from "@jsxrx/router"

const homeRoute = route("home", HomePage)
```

**Route with resolver and typed parameters**

```tsx
import { route, params } from "@jsxrx/router"

const userRoute = route("user", UserPage, {
  params: { path: params("id"), query: params("tab") },
  resolve({ path, query }) {
    return {
      userId: path.id,
      activeTab: query.tab,
    }
  },
})
```

**Route with children (layout route)**

```tsx
import { route } from "@jsxrx/router"

const appRoute = route("app", AppLayout, {
  resolve({ url$ }) {
    return { currentUrl: url$ }
  },
  children: {
    "/": route("home", HomePage, {
      resolve: HomeResolver,
    }),
    "/users/:id": route("user", UserPage, {
      resolve: UserResolver,
    }),
  },
})
```

---

### `defineRoutes(input)`

```ts
defineRoutes(input: Routes): Routes
```

Identity function that provides TypeScript type-checking for route tree definitions. It does not transform the data — it ensures the tree shape is valid at compile time.

```tsx
import { defineRoutes, route } from "@jsxrx/router"

const routes = defineRoutes({
  index: route("root", RootLayout, {
    resolve: RootLayoutResolver,
    children: {
      "/login": route("login", LoginPage, {
        resolve: LoginResolver,
      }),
      "/dashboard": route("dashboard", DashboardPage, {
        resolve: DashboardResolver,
      }),
    },
  }),
})
```

---

### `params(...keys)`

```ts
params<K extends string>(...keys: K[]): K[]
```

Declares typed path or query parameter names for a route. This enables autocompletion and type-checking when accessing `path.` and `query.` inside `RouteResolverInput`.

```tsx
route("article", ArticlePage, {
  params: {
    path: params("slug"),       // typed as "slug"
    query: params("view", "v"), // typed as "view" | "v"
  },
  resolve({ path, query }) {
    // path.slug  → Observable<string> ✅
    // path.title → TypeScript error ❌
    // query.view → Observable<string[] | undefined> ✅
    return { slug: path.slug }
  },
})
```

---

## 3. Route Types

### `Routes`

```ts
type Routes =
  | { [key: `/${string}`]: Route | Routes }
  | { index: Route }
```

A route tree. Top-level keys are path patterns (e.g., `"/users/:id"`) or the special `"index"` key. Values are either a `Route` or a nested `Routes` object (for nested layouts).

### `Route<Props, Path, Query>`

```ts
type Route<Props = any, Path extends string = string, Query extends string = string> =
  | RouteWithProps<Props, Path, Query>
  | RouteBasic<Props>
```

The union of a route with a resolver (`RouteWithProps`) and a basic route without configuration (`RouteBasic`).

**`RouteBasic<Props>`**

```ts
interface RouteBasic<Props> {
  id: string
  component: Props extends WithChildren
    ? Component<WithChildren>
    : Component<unknown>
  children?: Props extends WithChildren ? Routes : never
}
```

**`RouteWithProps<Props, Path, Query>`** — extends `RouteOptions` and adds `id` + `component`.

### `RouteOptions<Props, Path, Query>`

```ts
type RouteOptions<Props, Path extends string, Query extends string> = {
  params?: {
    path?: Path[]
    query?: Query[]
  }
  resolve:
    | RouteResolver<Props, Path, Query>
    | Observable<RouteResolver<Props, Path, Query>>
  children?: Props extends WithChildren ? Routes : never
}
```

### `RouteResolverInput<Path, Query>`

```ts
interface RouteResolverInput<Path extends string = string, Query extends string = string> {
  path: Record<Path, Observable<string>>
  query: Record<Query, Observable<string[] | undefined>>
  context: IContextMap
  url$: Observable<URL>
  navigate: NavigateFn
  refresh: () => void
}
```

The input object passed to every route resolver function. Each field:

| Field       | Type                                              | Description                                                                    |
| ----------- | ------------------------------------------------- | ------------------------------------------------------------------------------ |
| `path`      | `Record<Path, Observable<string>>`                | Observables of matched path parameters (e.g., `:id`, `:slug`).                |
| `query`     | `Record<Query, Observable<string[] \| undefined>>`| Observables of query string parameters.                                        |
| `context`   | `IContextMap`                                     | The component context map — use `context.require()` to access provided values. |
| `url$`      | `Observable<URL>`                                 | Observable of the current `URL` object.                                        |
| `navigate`  | `NavigateFn`                                      | Function to trigger client-side navigation.                                    |
| `refresh`   | `() => void`                                      | Re-invokes all resolvers on the current route tree.                            |

### `RouteResolver<Props, Path, Query>`

```ts
type RouteResolver<Props, Path extends string, Query extends string> = (
  input: RouteResolverInput<Path, Query>,
) => ResolvedProps<Props>
```

The signature of a resolver function.

### `ResolvedProps<Props>`

```ts
type ResolvedProps<Props> = Properties<Omit<Props, "children">>
```

The return type of a resolver. Each key can be a plain value `T` or an `Observable<T>` (from `@jsxrx/core`'s `Properties` utility type). `children` is stripped because it is handled internally by the router.

### `NavigateFn`

```ts
type NavigateFn = (to: string, options?: NavigateOptions) => void
```

### `NavigateOptions`

```ts
type NavigateOptions = {
  replace?: boolean
  query?: Record<
    string,
    string | number | null | undefined | (string | number | null | undefined)[]
  >
  params?: Record<string, string | number | null | undefined>
}
```

| Field     | Type                    | Description                                                                 |
| --------- | ----------------------- | --------------------------------------------------------------------------- |
| `replace` | `boolean`               | If `true`, uses `history.replaceState` instead of `pushState`.              |
| `query`   | `Record<string, ...>`   | Query parameters to append. Values can be scalars or arrays.                |
| `params`  | `Record<string, ...>`   | Path parameters to interpolate into the target pathname.                    |

### `RouteMatch`

```ts
interface RouteMatch {
  url: URL
  fragments: string[]
  params: Record<string, string>
  pattern: string
}
```

The result of `matchUrl()`. Describes how a URL matches a route pattern.

---

## 4. Route Resolver Pattern

A resolver is a synchronous function that receives routing context and returns component props. It is the **single entry point** for data loading, authentication guards, and redirects *before* the route component renders.

```tsx
import { Context } from "@jsxrx/core"
import { map, take } from "rxjs"

const AuthContext = new Context<{ user: { name: string } | null }>(
  "auth",
  null,
)

function MyResolver({
  navigate,
  url$,
  context,
  path,
  query,
  refresh,
}: RouteResolverInput<"id", "tab">) {
  const auth$ = context.require(AuthContext)

  // 🔐 Auth guard — redirect unauthenticated users
  auth$.pipe(take(1)).subscribe(state => {
    if (!state.user) {
      navigate("/login", { query: { next: url$.value?.pathname } })
    }
  })

  return {
    user: auth$.pipe(map(s => s.user)),
    userId: path.id,               // Observable<string>
    activeTab: query.tab,           // Observable<string[] | undefined>
    onRefresh: () => refresh(),     // re-run all resolvers for this route
  }
}
```

**Key points:**
- Resolvers run **synchronously** — any async work must be expressed via returned observables.
- Use `navigate()` for redirects, `refresh()` to re-run resolution.
- Returned props become available to the route component. Plain values are emitted once; observables emit on each change.

### Lazy resolver (with `lazyResolver`)

```tsx
import { lazyResolver } from "@jsxrx/router"

route("home", lazy(() => import("./Home"), "default"), {
  resolve: lazyResolver(() => import("./Home"), "HomeResolver"),
})
```

---

## 5. Browser Router (`@jsxrx/router/browser`)

### `BrowserRouter`

```tsx
import { BrowserRouter } from "@jsxrx/router/browser"

function App() {
  return <BrowserRouter routes={routes} />
}
```

The top-level browser router component. It accepts a single prop:

| Prop     | Type      | Description                                           |
| -------- | --------- | ----------------------------------------------------- |
| `routes` | `Routes`  | The route tree, typically defined with `defineRoutes`.|

**What it does internally:**
1. Creates a **history observable** that tracks `window.location` via `popstate` events and programmatic navigation.
2. Instantiates the recursive `RouteComponent` with the root route tree.
3. Provides `navigateTo` and `refresh` to the resolver chain.
4. The returned JSX tree is rendered into the DOM at whatever parent hosts `<BrowserRouter>`.

**Navigation behavior:**
- Calling `navigate(to, options)` pushes a new history entry by default.
- Pass `{ replace: true }` to use `history.replaceState` instead.
- Path parameters in `to` are interpolated via `parsePathnameParams`.

**Example: programmatic navigation with params and query**

```tsx
function LoginResolver({ navigate }: RouteResolverInput) {
  const handleLogin = () => {
    navigate("/dashboard/users/:id", {
      params: { id: 42 },
      query: { tab: "profile" },
    })
  }
  return { onLogin: handleLogin }
}
```

Result: navigates to `/dashboard/users/42?tab=profile`.

### `RouteComponent` (internal)

`RouteComponent` is the recursive matching engine. It is **not exported** as a public API but understanding its behavior is useful for debugging:

1. It receives the current `url$`, the remaining `routes` tree, and a `path` accumulator.
2. It calls `matchUrl(url, path)` to determine if the current URL matches the accumulated path.
3. **For leaf routes** (no children): uses `"exact"` matching — the URL must match the full pattern exactly.
4. **For layout routes** (with children): uses `"startsWith"` matching — the URL must start with the pattern. This allows nested child routes to continue matching.
5. When a route matches, its resolver (if any) is invoked, and the returned props are fed into the route's component.
6. Nested `Routes` objects (maps with `"/path"` keys) are iterated; each key is tried until a match is found. The matched route gets `matched: true`.

---

## 6. URL Matching Utilities

### `matchUrl(url, pattern, mode?)`

```ts
matchUrl(
  url: URL,
  pattern: string,
  mode?: "exact" | "startsWith"
): RouteMatch | null
```

Matches a `URL` object against a route pattern string. Patterns may contain `:param` tokens that capture URL fragments as named parameters.

**Modes:**
| Mode           | Behavior                                                        |
| -------------- | --------------------------------------------------------------- |
| `"startsWith"` | _(default)_ URL must begin with the pattern. Extra fragments allowed. |
| `"exact"`      | URL fragments must exactly match pattern fragments in count.     |

**Returns `null` when:**
- The URL has fewer fragments than the pattern.
- Any non-parameter fragment does not match the corresponding URL fragment.
- In `"exact"` mode, the fragment counts differ.

**Throws when** the pattern contains repeated parameter names (e.g., `"/:id/to/:id"`).

```tsx
import { matchUrl } from "@jsxrx/router"

// Exact match
matchUrl(new URL("https://ex.com/users/123"), "/users/:id", "exact")
// → { url, pattern: "/users/:id", fragments: ["users", "123"], params: { id: "123" } }

// Exact mismatch (extra fragment)
matchUrl(new URL("https://ex.com/users/123/posts"), "/users/:id", "exact")
// → null

// startsWith allows extra fragments
matchUrl(new URL("https://ex.com/users/123/posts"), "/users/:id")
// → { url, pattern: "/users/:id", fragments: ["users", "123", "posts"], params: { id: "123" } }

// Root path
matchUrl(new URL("https://ex.com/"), "/", "exact")
// → { url, pattern: "/", fragments: [], params: {} }
```

---

### `parsePathnameParams(pathname, params)`

```ts
parsePathnameParams(
  pathname: string,
  params: Record<string, string | number | null | undefined>
): string
```

Interpolates parameter values into a pathname pattern. Used internally by the browser router's `navigateTo` to convert parameterized pathnames into concrete URLs.

- **`null` or `undefined` values are skipped** — the `:param` token is left unchanged.
- Numeric values are stringified via `String(value)`.
- Parameters not present in the pathname are ignored.

```tsx
import { parsePathnameParams } from "@jsxrx/router"

parsePathnameParams("/users/:id", { id: 123 })
// → "/users/123"

parsePathnameParams("/:a/:b/:c", { a: "x", b: "y", c: "z" })
// → "/x/y/z"

parsePathnameParams("/users/:id/posts/:postId", { id: 42, postId: "about" })
// → "/users/42/posts/about"

// null/undefined params are left as-is
parsePathnameParams("/users/:id", { id: null })
// → "/users/:id"

// Extra params are ignored
parsePathnameParams("/users/:id", { id: 1, extra: "unused" })
// → "/users/1"
```

---

## 7. Lazy Routing

### `lazyResolver(importer, name)`

```ts
lazyResolver<T extends Record<string, unknown>, N extends keyof T>(
  importer: () => Promise<T>,
  name: N
): Observable<T[N]>
```

Creates a lazy-loaded route resolver. Returns an `Observable` that:
1. Calls `importer()` to dynamically import a module.
2. Extracts the named export `name` from the module.
3. Asserts the export exists (throws if missing).
4. Emits the resolved value once and completes.

This is used as the `resolve` option of `route()`, enabling code-split route resolvers:

```tsx
import { route, lazyResolver } from "@jsxrx/router"
import { lazy } from "@jsxrx/core"

const userRoute = route(
  "user",
  lazy(() => import("./UserPage"), "default"),
  {
    params: { path: params("id") },
    resolve: lazyResolver(() => import("./UserPage"), "UserResolver"),
  },
)
```

**Important:** The resolver module must export a named function matching the signature `RouteResolver<Props, Path, Query>`. Unlike `lazy()` (which returns a lazy `Component`), `lazyResolver()` returns an `Observable` that the router subscribes to when the route is first matched.

### `lazy(importer, name?)` (from `@jsxrx/core`)

```ts
lazy<T extends Record<N, Component<any>>, N extends string>(
  importer: () => Promise<T>,
  name?: N  // defaults to "default"
): T[N]
```

Used for lazy-loading the route **component**. The returned value is a `Component` that triggers the dynamic import only when the route is first rendered.

```tsx
import { lazy } from "@jsxrx/core"

route("dashboard", lazy(() => import("./Dashboard"), "default"), {
  resolve: DashboardResolver,
})
```

---

## 8. Full Example

A complete, code-split routing setup with authentication, parameterized routes, and context.

**`src/contexts.ts`** — shared context definitions

```tsx
import { Context } from "@jsxrx/core"

export const AuthContext = new Context<{ user: { name: string } | null }>(
  "auth",
  null,
)

export const ThemeContext = new Context<"light" | "dark">("theme", "light")
```

**`src/routes.ts`** — route tree definition

```tsx
import { lazy } from "@jsxrx/core"
import {
  defineRoutes,
  route,
  lazyResolver,
  params,
} from "@jsxrx/router"

export const routes = defineRoutes({
  index: route("app", lazy(() => import("./Layout"), "default"), {
    resolve: lazyResolver(() => import("./Layout"), "LayoutResolver"),
    children: {
      "/": route("home", lazy(() => import("./Home"), "default"), {
        resolve: lazyResolver(() => import("./Home"), "HomeResolver"),
      }),
      "/login": route("login", lazy(() => import("./Login"), "default"), {
        resolve: lazyResolver(() => import("./Login"), "LoginResolver"),
      }),
      "/users/:id": route("user", lazy(() => import("./User"), "default"), {
        params: { path: params("id"), query: params("tab") },
        resolve: lazyResolver(() => import("./User"), "UserResolver"),
      }),
      "/posts/:slug": route("post", lazy(() => import("./Post"), "default"), {
        params: { path: params("slug") },
        resolve: lazyResolver(() => import("./Post"), "PostResolver"),
      }),
    },
  }),
})
```

**`src/Layout.tsx`** — layout component and resolver

```tsx
import type { RouteResolverInput } from "@jsxrx/router"
import { AuthContext } from "./contexts"
import { map, take } from "rxjs"

export function LayoutResolver({
  context,
  url$,
  navigate,
}: RouteResolverInput) {
  const auth$ = context.require(AuthContext)

  // Redirect unauthenticated users away from protected routes
  auth$.pipe(take(1)).subscribe(state => {
    const isLoginPage = url$.value?.pathname === "/login"
    if (!state.user && !isLoginPage) {
      navigate("/login", { query: { next: url$.value?.pathname } })
    }
  })

  return {
    user: auth$.pipe(map(s => s.user)),
    currentPath: url$.pipe(map(url => url?.pathname)),
  }
}

export default function Layout(props$: Observable<{
  user: { name: string } | null
  currentPath: string
  children?: ElementNode
}>) {
  // ... render header, sidebar, and {children}
}
```

**`src/User.tsx`** — parameterized route resolver

```tsx
import type { RouteResolverInput } from "@jsxrx/router"

export function UserResolver({ path, query }: RouteResolverInput<"id", "tab">) {
  return {
    userId: path.id,           // Observable<string> — the :id param
    activeTab: query.tab,       // Observable<string[] | undefined> — ?tab=
  }
}

export default function UserPage(props$: Observable<{
  userId: string
  activeTab: string[] | undefined
}>) {
  // ... render user profile
}
```

**`src/main.tsx`** — entry point

```tsx
import { createRoot } from "@jsxrx/core/dom"
import { BrowserRouter } from "@jsxrx/router/browser"
import { routes } from "./routes"

createRoot(document.querySelector("[root]")).mount(
  <BrowserRouter routes={routes} />,
)
```

---

## 9. Additional Examples

### Example 1: Redirect on resolve

```tsx
import { take } from "rxjs"

function ProtectedResolver({ navigate, context }: RouteResolverInput) {
  const auth$ = context.require(AuthContext)

  auth$.pipe(take(1)).subscribe(state => {
    if (!state.user) {
      navigate("/login", { replace: true })
    }
  })

  return { user: auth$.pipe(map(s => s.user)) }
}
```

### Example 2: Using `refresh()` to reload data

```tsx
function DataResolver({ refresh }: RouteResolverInput) {
  // Re-fetch data when refresh() is called (e.g., after a mutation)
  return {
    data: fromEvent(refreshTrigger, "refresh").pipe(
      startWith(null),
      switchMap(() => fetch("/api/data").then(r => r.json())),
    ),
    onRefresh: () => refresh(),
  }
}
```

### Example 3: Navigate with query arrays

```tsx
function FilterResolver({ navigate }: RouteResolverInput) {
  function applyFilters() {
    navigate("/search", {
      query: {
        tags: ["jsx", "rxjs"],   // → ?tags=jsx&tags=rxjs
        page: 1,                  // → &page=1
      },
      params: {},
    })
  }
  return { applyFilters }
}
```

### Example 4: Basic route without resolver

```tsx
// A route that needs no data loading — just renders the component.
route("about", AboutPage)
```

### Example 5: Multi-segment parameters

```tsx
const blogRoute = route("blog", BlogPage, {
  params: {
    path: params("year", "month", "slug"),
  },
  resolve({ path }) {
    return {
      year: path.year,
      month: path.month,
      slug: path.slug,
    }
  },
})

// Matches /2024/01/hello-world
```

### Example 6: Watching URL changes in a resolver

```tsx
import { map, distinctUntilChanged } from "rxjs"

function TrackingResolver({ url$ }: RouteResolverInput) {
  // React to every URL change
  const pageView$ = url$.pipe(
    map(url => url?.pathname),
    distinctUntilChanged(),
  )

  // Send to analytics (side effect via subscription is acceptable in resolver)
  pageView$.subscribe(path => {
    console.log("Page view:", path)
  })

  return {}
}
```

### Example 7: Context-aware resolver with optional context

```tsx
import type { RouteResolverInput } from "@jsxrx/router"

function ThemeResolver({ context }: RouteResolverInput) {
  // context.optional() returns the context value or its initial value if not provided
  const theme$ = context.optional(ThemeContext)

  return {
    theme: theme$,
    isDark: theme$.pipe(map(t => t === "dark")),
  }
}
```

### Example 8: Deeply nested routes

```tsx
defineRoutes({
  index: route("root", RootLayout, {
    resolve: RootResolver,
    children: {
      "/app": route("app-shell", AppShell, {
        resolve: AppShellResolver,
        children: {
          "/app/dashboard": route("dashboard", DashboardPage, {
            resolve: DashboardResolver,
            children: {
              "/app/dashboard/widgets/:id": route("widget", WidgetPage, {
                params: { path: params("id") },
                resolve: WidgetResolver,
              }),
            },
          }),
          "/app/settings": route("settings", SettingsPage, {
            resolve: SettingsResolver,
          }),
        },
      }),
    },
  }),
})
```

### Example 9: Replace vs push navigation

```tsx
function LoginResolver({ navigate }: RouteResolverInput) {
  function onLoginSuccess() {
    // After login, replace the history entry so "back" doesn't go to login
    navigate("/dashboard", { replace: true })
  }

  function onRedirectToSignup() {
    // Normal push — preserves back button behavior
    navigate("/signup")
  }

  return { onLoginSuccess, onRedirectToSignup }
}
```

### Example 10: Handling query parameters that may be absent

```tsx
function SearchResolver({ query }: RouteResolverInput<never, "q" | "sort">) {
  return {
    searchTerm: query.q.pipe(map(q => q?.[0] ?? "")),   // defaults to ""
    sortOrder: query.sort.pipe(map(s => s?.[0] ?? "desc")), // defaults to "desc"
  }
}
```

---

## 10. Data Flow Summary

```text
URL changes (popstate / navigate())
        │
        ▼
  history observable (url$)
        │
        ▼
  RouteComponent (recursive)
   ├── matchUrl(url$, accumulated path) → RouteMatch | null
   ├── extract path params, query params
   ├── invoke resolver (synchronous)
   │     ├── resolverInput.path  → Proxy<Observable<string>>
   │     ├── resolverInput.query → Proxy<Observable<string[] | undefined>>
   │     ├── resolverInput.context → IContextMap
   │     ├── resolverInput.navigate → push/replace history
   │     └── resolverInput.refresh → re-invoke all resolvers
   │
   ├── resolver returns ResolvedProps → fed into component
   │
   └── for layout routes: render component + recurse into children
```

---

## 11. Error Handling

- **Repeated parameter names** in a pattern (e.g., `"/:id/:id"`) cause `matchUrl()` to throw an `AssertionError`.
- **Missing lazy resolver export**: `lazyResolver()` throws `"Lazy resolver module \"<name>\" does not exists"`.
- **Missing lazy component export**: `lazy()` (from core) throws `"Lazy component module \"<name>\" does not exists"`.
- **Missing required context**: `context.require()` throws `"Unable to find required context for <symbol>"`.
- **Invalid context type**: `context.require()` throws if the argument is not a `Context` instance.

---

## 12. Exports

### From `@jsxrx/router`

| Export                | Kind       | Source file      |
| --------------------- | ---------- | ---------------- |
| `route`               | function   | `route.js`       |
| `defineRoutes`        | function   | `route.js`       |
| `params`              | function   | `route.js`       |
| `lazyResolver`        | function   | `lazy.js`        |
| `matchUrl`            | function   | `utils.js`       |
| `parsePathnameParams` | function   | `utils.js`       |

### Types (re-exported from `types.ts`)

| Type                   | Description                          |
| ---------------------- | ------------------------------------ |
| `Routes`               | Route tree shape                     |
| `Route`                | Route definition union               |
| `RouteBasic`           | Route without resolver               |
| `RouteWithProps`       | Route with resolver config           |
| `RouteOptions`         | Resolver and children options        |
| `RouteResolver`        | Resolver function signature          |
| `RouteResolverInput`   | Input object passed to resolver      |
| `ResolvedProps`        | Return type of resolver              |
| `NavigateFn`           | Client-side navigation function      |
| `NavigateOptions`      | Navigation configuration             |
| `RouteMatch`           | URL-to-pattern match result          |

### From `@jsxrx/router/browser`

| Export           | Kind       | Description                              |
| ---------------- | ---------- | ---------------------------------------- |
| `BrowserRouter`  | Component  | Top-level browser router component       |
| `RouteComponent` | Component  | Recursive matching engine (internal use) |
