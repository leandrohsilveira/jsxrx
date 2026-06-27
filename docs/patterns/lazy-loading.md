# Lazy Loading in JsxRx

**Source:** `packages/core/src/lazy.js`, `packages/router/src/lazy.js`

## 1. Overview

JsxRx supports lazy loading for both components and route resolvers using
dynamic `import()`. This enables code splitting — components are only loaded
when they are actually rendered, reducing the initial bundle size and improving
application startup time.

Lazy loading works at two levels:

- **Components** — wrap a dynamic import with `lazy()` to defer loading until
  the component is first rendered.
- **Route resolvers** — wrap a dynamic import with `lazyResolver()` to defer
  loading of data-fetching logic until the route is matched.

Both primitives use the same `import()` mechanism, so bundlers like Vite can
statically analyse the import paths and emit separate chunks for each
lazy-loaded module.

---

## 2. `lazy()` — Lazy Components

`lazy()` wraps a dynamic import to create a component that loads on first
render:

```tsx
import { lazy } from "@jsxrx/core"

const Login = lazy(() => import("./Login"), "default")
const UserProfile = lazy(() => import("./UserProfile"), "default")
```

### How `lazy()` works

- **Signature:** `lazy(importer: () => Promise<Module>, name?: string): Component<Props>`
- **`importer`** — a function that returns a `Promise` resolving to the module
  (typically a dynamic `import()` expression).
- **`name`** — the named export to use (defaults to `"default"`). When your
  module has a `default` export, pass `"default"` (or omit the second argument).
- On first render, the returned component triggers the import. While the module
  is loading, the component emits `null` — the tree suspends, and if wrapped in
  `<Suspense>`, the fallback is shown.
- Once the module loads, the component caches the result and passes its props
  to the loaded component using `Props.spread()`.
- Subsequent renders use the cached component directly — the import runs only
  once.

### Best practice: wrap lazy components in `<Suspense>`

```tsx
import { Suspense, lazy } from "@jsxrx/core"

const LazyLogin = lazy(() => import("./Login"), "default")

function App() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <LazyLogin />
    </Suspense>
  )
}
```

Without `<Suspense>`, the lazy component renders nothing visible while loading.
The `<Suspense>` boundary catches the suspended render and displays the
`fallback` element instead.

---

## 3. `lazyResolver()` — Lazy Route Resolvers

`lazyResolver()` creates a lazy-loaded route resolver — the data-loading
function that runs when a route matches:

```tsx
import { lazyResolver } from "@jsxrx/router"
import { lazy } from "@jsxrx/core"

route("home", lazy(() => import("./Home"), "default"), {
  resolve: lazyResolver(() => import("./Home"), "HomeResolver"),
})
```

### How `lazyResolver()` works

- **Signature:** `lazyResolver(importer: () => Promise<Module>, name: string): Observable<RouteResolver>`
- **`importer`** — a function that returns a `Promise` resolving to the module.
- **`name`** — the named export of the resolver function (required).
- Returns an `Observable<RouteResolver>` — **not** the resolver function
  directly. The router subscribes to this observable when the route matches.
- When the module loads, the observable emits the resolver function. The
  resolver is then called with a `RouteResolverInput` to produce
  `ResolvedProps`.
- The result is cached for the application lifetime.

### Why Observable?

The `resolve` option in route definitions accepts either a
`RouteResolver` directly or an `Observable<RouteResolver>`:

```ts
// From packages/router/src/types.ts
type RouteOptions = {
  resolve:
    | RouteResolver<Props, Path, Query>
    | Observable<RouteResolver<Props, Path, Query>>
  // ...
}
```

`lazyResolver()` returns the observable variant, integrating seamlessly with
the router's subscription model. The router resolves the observable once,
extracts the resolver, then invokes it with the route's input data.

---

## 4. Co-located Lazy Loading

The most common and recommended pattern is to lazy-load both the component and
its resolver from the **same module**. This keeps related code together and
produces a single chunk per route:

```tsx
import { lazy } from "@jsxrx/core"
import { lazyResolver } from "@jsxrx/router"
import { defineRoutes, route } from "@jsxrx/router"

export const routes = defineRoutes({
  index: route("app", lazy(() => import("./layout/FullLayout"), "default"), {
    resolve: lazyResolver(() => import("./layout/FullLayout"), "FullLayoutResolver"),
    children: {
      "/": route("home", lazy(() => import("./home/Home"), "default"), {
        resolve: lazyResolver(() => import("./home/Home"), "HomeResolver"),
      }),
      "/users": route("users", lazy(() => import("./users/UserList"), "default"), {
        resolve: lazyResolver(() => import("./users/UserList"), "UserListResolver"),
      }),
    },
  }),
})
```

Each module (`Home.tsx`, `UserList.tsx`, etc.) exports both a default component
and a named resolver:

```tsx
// home/Home.tsx
import { Observable } from "rxjs"
import { map } from "rxjs/operators"
import { Props } from "@jsxrx/core"
import { RouteResolverInput, ResolvedProps } from "@jsxrx/router"
import { AuthContext } from "../context/AuthContext"

export default function Home(props$: Observable<HomeProps>) {
  const { user$ } = Props.take(props$)

  return (
    <section>
      <h1>Welcome, {user$.pipe(map(u => u.name))}</h1>
    </section>
  )
}

export function HomeResolver({ context }: RouteResolverInput): ResolvedProps<HomeProps> {
  const auth$ = context.require(AuthContext)

  return {
    user: auth$.pipe(map(s => s.user)),
  }
}
```

This pattern keeps the component and its data requirements in one file, while
still benefiting from code splitting — the entire file becomes a separate chunk
loaded only when the route is visited.

---

## 5. Vite Code Splitting

When using Vite (which supports dynamic `import()` natively), each lazy-loaded
module becomes its own chunk:

```text
dist/
  assets/
    index-abc123.js          # Main bundle (router + shell)
    FullLayout-def456.js     # Layout route chunk
    Home-ghi789.js           # Home route chunk
    UserList-jkl012.js       # UserList route chunk
    Login-mno345.js          # Login route chunk
```

The route chunks are only fetched when the user navigates to that route. For
routes deeper in the tree, chunks are loaded lazily as the user navigates
deeper:

- `/` → loads `FullLayout-def456.js`, then `Home-ghi789.js`
- `/users` → loads `FullLayout-def456.js`, then `UserList-jkl012.js`

Each chunk includes both the component and its resolver (when co-located),
keeping the number of network requests minimal.

---

## 6. Combining with Suspense

For a better user experience, combine lazy loading with `<Suspense>` at the
router level. The `<Suspense>` component accepts a `tolerance` prop that delays
the fallback by a configurable number of milliseconds, preventing a flash of
the loading state for fast loads:

```tsx
import { Suspense } from "@jsxrx/core"
import { BrowserRouter } from "@jsxrx/router"

function App() {
  return (
    <Suspense fallback={<Splashscreen />} tolerance={250}>
      <BrowserRouter routes={routes} />
    </Suspense>
  )
}
```

The `tolerance={250}` delays showing the `<Splashscreen />` by 250ms. If the
lazy module loads within that window (e.g. because it is already cached), the
fallback is never displayed.

Nested lazy routes can also be wrapped in their own `<Suspense>` boundaries for
more granular loading states:

```tsx
import { Suspense } from "@jsxrx/core"

const Settings = lazy(() => import("./Settings"), "default")

function SettingsPage() {
  return (
    <Suspense fallback={<SettingsSkeleton />} tolerance={100}>
      <Settings />
    </Suspense>
  )
}
```

**Suspense props:**

| Prop        | Type      | Default  | Description                                   |
|-------------|-----------|----------|-----------------------------------------------|
| `fallback`  | `ElementNode` | —    | Content shown while a descendant is suspended |
| `tolerance` | `number`  | `0`      | Delay (ms) before showing the fallback        |
| `suspended` | `Observable<boolean> | boolean` | —        | Controls suspension state. Accepts a boolean or Observable<boolean>. |

---

## 7. Nested Lazy Routes

Lazy components can render their own lazy children, forming a tree of
lazy-loaded route segments. Each nested route is only loaded when its parent
path matches **and** the child path matches:

```tsx
import { lazy } from "@jsxrx/core"
import { defineRoutes, lazyResolver, route } from "@jsxrx/router"

const routes = defineRoutes({
  index: route("app", lazy(() => import("./Layout"), "default"), {
    resolve: lazyResolver(() => import("./Layout"), "LayoutResolver"),
    children: {
      "/settings": route("settings", lazy(() => import("./Settings"), "default"), {
        resolve: lazyResolver(() => import("./Settings"), "SettingsResolver"),
        children: {
          "/profile": route("profile", lazy(() => import("./Profile"), "default"), {
            resolve: lazyResolver(() => import("./Profile"), "ProfileResolver"),
          }),
        },
      }),
    },
  }),
})
```

### Load sequence for `/settings/profile`

1. Match `/` → load `Layout` chunk → render layout shell
2. Match `/settings` → load `Settings` chunk → render settings navigation
3. Match `/settings/profile` → load `Profile` chunk → render profile form

Each chunk loads only when needed. If the user never visits `/settings`, the
`Settings` and `Profile` chunks are never requested.

---

## 8. Important Notes

- **Module-scope declarations** — `lazy()` components and `lazyResolver()`
  resolvers must be declared at module scope (not inside other components or
  functions) to ensure stable identity across renders.

  ```tsx
  // ✅ Correct — module scope
  const Login = lazy(() => import("./Login"), "default")

  function App() {
    return <Login />
  }
  ```

  ```tsx
  // ❌ Incorrect — inside a component
  function App() {
    const Login = lazy(() => import("./Login"), "default")
    return <Login />
  }
  ```

- **Single-load cache** — once loaded, both `lazy()` components and
  `lazyResolver()` results are cached for the application lifetime. The import
  is triggered once and never repeated.

- **Static import paths** — the import argument must be a string literal (or a
  template literal with a segment that bundlers can statically analyse) for
  code splitting to work. Dynamic expressions like
  `import(\`./pages/${pageName}\`)` prevent bundlers from determining which
  chunks to create.

- **Export names** — when using named exports (not `default`), pass the export
  name explicitly to both `lazy()` and `lazyResolver()`. The second argument
  defaults to `"default"`, so it can be omitted for default exports.

- **Resolver type** — `lazyResolver()` returns an `Observable`, not a function.
  This is because the resolver must be retrieved asynchronously before it can
  be called. The router handles the subscription internally.

- **Suspense without lazy** — `<Suspense>` can also wrap any component that
  emits `null` reactively, not just lazy-loaded ones. The `lazy()` function is
  the primary use case, but custom components that need to suspend
  (e.g. waiting for an async resource) will also trigger the fallback.
