## Lazy Loading

### `lazy()` — Lazy Components

Wraps a dynamic `import()` into a component that only loads when first rendered. Import from `@jsxrx/core`. Caches the loaded module for the application lifetime — the import runs once.

```tsx
import { lazy } from "@jsxrx/core"

// Default export — second argument can be omitted (defaults to "default")
const Login = lazy(() => import("./Login"))

// Named export — pass the export name explicitly
const Admin = lazy(() => import("./pages"), "AdminDashboard")
```

The lazy component emits nothing while the module loads — it auto-suspends. **Always wrap lazy components in `<Suspense>`** so a fallback is shown during loading. Without `<Suspense>`, the component renders nothing visible while pending.

---

### `lazyResolver()` — Lazy Route Resolvers

Creates a lazy-loaded route resolver that loads data only when the route is matched. Import from `@jsxrx/router`. Returns an `Observable<RouteResolver>` — the router subscribes to it and calls the resolver once the module arrives.

```tsx
import { lazyResolver } from "@jsxrx/router"

const userResolver = lazyResolver(() => import("./UserPage"), "userResolver")
```

Used in the `resolve` option of `route()`:

```tsx
route("user", UserPage, {
  resolve: lazyResolver(() => import("./UserPage"), "UserResolver"),
})
```

Caches for the application lifetime.

---

### Co-located Lazy Loading (Recommended)

Import the component and resolver from the **same module** so the bundler produces a **single chunk** per route — one network request loads both:

```tsx
import { lazy } from "@jsxrx/core"
import { lazyResolver, route } from "@jsxrx/router"

const AdminPage = lazy(() => import("./Admin"))
const adminResolver = lazyResolver(() => import("./Admin"), "adminResolver")

route("admin", AdminPage, { resolve: adminResolver })
```

The `Admin.tsx` module exports both a default component and a named resolver function. The bundler treats the two `import("./Admin")` calls as one chunk.

---

### Module Scope

Define lazy components and resolvers at **module scope** (top level of the file), not inside components or functions. This gives bundlers a stable import boundary for code-splitting:

```tsx
// ✅ Correct — module scope
const Dashboard = lazy(() => import("./Dashboard"))

function App() {
  return <Dashboard />
}
```

```tsx
// ❌ Bad — inside a function; bundler may not split correctly
function App() {
  const Dashboard = lazy(() => import("./Dashboard"))
  return <Dashboard />
}
```

---

### Static Import Paths

The import argument **must be a static string literal** — bundlers analyse the text at build time to determine which chunks to create:

```tsx
// ✅ Correct — bundler can statically analyse
const Page = lazy(() => import("./MyPage"))

// ❌ Wrong — bundler cannot determine the chunk at build time
const Page = lazy(() => import(someVariable))
```

---

### Suspense Wrapping

Lazy components auto-suspend while their import is pending. Wrap route content in `<Suspense>` to show fallback UI:

```tsx
import { Suspense, lazy } from "@jsxrx/core"
import { BrowserRouter } from "@jsxrx/router"

const AppLayout = lazy(() => import("./AppLayout"))

function App() {
  return (
    <Suspense fallback={<Splashscreen />}>
      <BrowserRouter routes={routes} />
    </Suspense>
  )
}
```

---

### tolerance

Prevents a flash of the fallback on fast connections or cached modules. The `tolerance` prop (milliseconds) delays the fallback — if the module loads within that window, the fallback is never rendered:

```tsx
<Suspense fallback={<Splashscreen />} tolerance={200}>
  <BrowserRouter routes={routes} />
</Suspense>
```

Choose values:
- `0` (default) — fallback appears immediately
- `100`–`300` — eliminates flash for cached/fast loads

---

### Nested Lazy Routes

Each lazy route can have its own `<Suspense>` boundary for **progressive loading** — inner content loads independently of the outer layout:

```tsx
import { Suspense, lazy } from "@jsxrx/core"

const Settings = lazy(() => import("./Settings"))

function SettingsPage() {
  return (
    <Suspense fallback={<SettingsSkeleton />} tolerance={100}>
      <Settings />
    </Suspense>
  )
}
```

Nested boundaries let the outer layout render immediately while inner sections show their own skeletons, giving a progressively revealing experience.
