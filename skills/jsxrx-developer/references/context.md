## Context API

### The Imperative Model

JsxRx Context is **imperative** — there are no JSX provider components like React's `<Context.Provider>`. Context is set and read through the `context` object on the `Lifecycle` parameter of every component function and route resolver. Every context value is an `Observable<T>`, making all consumers **inherently reactive** from the ground up.

Keys are `Context<T>` instances (identified by unique Symbol), values are always `Observable<T>`, and propagation follows the component tree via scoped child contexts.

---

### `Context<T>` Class

`Context<T>` serves as a typed key for the context map. It stores a human-readable `name` (for debugging) and an `initialValue` (fallback when no value has been set).

```ts
import { Context } from "@jsxrx/core"

// Create a context with name + initial value
const ThemeCtx = new Context("ThemeCtx", "light")
```

```ts
new Context<T>(name: string, initialValue: T)
```

| Parameter      | Type     | Description                                                |
|----------------|----------|------------------------------------------------------------|
| `name`         | `string` | Human-readable name for debugging and error messages       |
| `initialValue` | `T`      | Default value returned when context is read but not set    |

Each `Context` instance carries a unique Symbol key derived from its name, guaranteeing that no two contexts can collide even if they share the same name string.

---

### Providing Context

Context is provided via `context.set(ctx, value$)` from the `Lifecycle` parameter. The `value$` **must be an `Observable<T>`**.

```tsx
import { state } from "@jsxrx/core"
import type { Observable, Lifecycle } from "@jsxrx/core"
import { ThemeCtx } from "./contexts/theme"

function ThemeSetter(
  props$: Observable<{}>,
  { context }: Lifecycle,
) {
  // Set context to a reactive state cell
  const theme$ = state("dark")
  context.set(ThemeCtx, theme$)

  return <>{/* descendant components can now consume ThemeCtx */}</>
}
```

Context can also be set in **route resolvers** using the same `context.set()` API — see the Routing section for that pattern.

---

### Consuming Context

There are two methods, both returning an **Observable**:

- **`context.require(ctx)`** — Returns `Observable<T>`. **Throws** with a descriptive error if the context was never set in any parent.
- **`context.optional(ctx)`** — Returns `Observable<T>`. Falls back to the `initialValue` from the `Context` definition if not set. No error.

```tsx
import { map } from "rxjs"
import type { Observable, Lifecycle } from "@jsxrx/core"
import { ThemeCtx } from "../contexts/theme"

function ThemedCard(
  props$: Observable<{}>,
  { context }: Lifecycle,
) {
  // require() — throws if ThemeCtx was never set
  const theme$ = context.require(ThemeCtx)

  const bgColor$ = theme$.pipe(
    map(t => (t === "dark" ? "#222" : "#fff")),
  )

  return <div style={{ background: bgColor$ }}>Content</div>
}
```

```tsx
// optional() — uses initialValue if context is not set
const config$ = context.optional(FeatureConfigCtx)
```

### Type Signatures

```ts
interface IContextMap {
  set<T>(context: IContext<T>, value$: Observable<T>): void
  require<T extends IContext<any>>(context: T): Observable<T["initialValue"]>
  optional(context: Context<T>): Observable<T>
}
```

---

### ⚠️ No JSX Providers — CRITICAL

> **CRITICAL: NEVER use JSX `<Context.Provider>` elements.**
>
> JsxRx Context is **imperative**, not declarative. There is no JSX `Provider` component.
> If you write `<ThemeCtx.Provider>`, you will get a runtime error.

**React-style (WRONG — will not work in JsxRx):**

```tsx
// ❌ WRONG: There is no <Context.Provider> component in JsxRx
function App() {
  return (
    <ThemeCtx.Provider value="dark">   {/* Runtime error */}
      <ThemedCard />
    </ThemeCtx.Provider>
  )
}
```

**JsxRx-style (RIGHT):**

```tsx
// ✅ RIGHT: Context is set imperatively via context.set() in the lifecycle
import type { Observable, Lifecycle } from "@jsxrx/core"
import { of } from "rxjs"
import { ThemeCtx } from "./contexts/theme"

function App(
  props$: Observable<{}>,
  { context }: Lifecycle,
) {
  context.set(ThemeCtx, of("dark"))

  return <ThemedCard />
}
```

| Aspect | React | JsxRx |
|--------|-------|-------|
| **Provider** | `<Context.Provider value={...}>` JSX component | `context.set(Context, observable$)` in lifecycle or resolvers |
| **Consumer** | `useContext(Context)` hook | `context.require(Context)` / `context.optional(Context)` |
| **Value type** | Any JavaScript value | Always `Observable<T>` — inherently reactive |
| **Where set** | In component render functions | In component lifecycle callbacks or route resolvers |
| **Missing context** | Uses the default value | `require()` throws; `optional()` uses `initialValue` |
| **Reactivity** | Triggers re-render of all consumers | Updates observable streams — surgical DOM updates |

---

### Reload Pattern

When a context value depends on an async source that needs to be re-fetched on demand, use a trigger observable combined with `switchMap`:

```tsx
import { state, combine } from "@jsxrx/core"
import { switchMap } from "rxjs"
import type { Observable, Lifecycle } from "@jsxrx/core"
import { AuthContext } from "../contexts/auth"

function ReloadableAuthProvider(
  props$: Observable<{}>,
  { context }: Lifecycle,
) {
  // Trigger that emits a new unique value on each reload
  const reloadTrigger$ = state(Symbol())

  // Combine trigger with the data source
  const fetch$ = combine({ trigger: reloadTrigger$ }).pipe(
    switchMap(() => fetchUser()),
  )

  // Set the reload-capable stream as the context value
  context.set(AuthContext, fetch$)

  function reload() {
    reloadTrigger$.set(Symbol())  // triggers switchMap → re-fetch
  }

  // Pass reload() to children via props or another context
  return <>{/* ... */}</>
}
```

**How it works:**
1. `reloadTrigger$` is a `state(Symbol())` — always holds a unique value.
2. `combine({ trigger: reloadTrigger$ })` emits whenever `reloadTrigger$` changes.
3. `switchMap` cancels the previous fetch and initiates a new one.
4. Calling `reload()` sets a new `Symbol()`, which re-triggers the whole chain.

This pattern ensures downstream consumers always receive the latest data without manual refresh logic.

---

### Example: ThemeProvider

A complete context provider component that sets the theme context and renders children:

```tsx
// contexts/theme.ts
import { Context } from "@jsxrx/core"

export type Theme = "light" | "dark"

export const ThemeCtx = new Context<Theme>("ThemeCtx", "light")
```

```tsx
// components/ThemeProvider.tsx
import { Props } from "@jsxrx/core"
import type { Observable, Lifecycle } from "@jsxrx/core"
import { of } from "rxjs"
import { ThemeCtx } from "../contexts/theme"

function ThemeProvider(
  props$: Observable<{ theme?: Theme | Observable<Theme> }>,
  { context }: Lifecycle,
) {
  const { theme$ } = Props.take(props$, { theme: "light" as Theme })

  // Set the reactive theme observable as context value
  context.set(ThemeCtx, theme$)

  return <>{/* All children receive theme$ reactively */}</>
}
```

```tsx
// components/ThemedPage.tsx — consumer
import { map } from "rxjs"
import type { Observable, Lifecycle } from "@jsxrx/core"
import { ThemeCtx } from "../contexts/theme"

function ThemedPage(
  props$: Observable<{}>,
  { context }: Lifecycle,
) {
  const theme$ = context.require(ThemeCtx)

  const bg$ = theme$.pipe(map(t => (t === "dark" ? "#111" : "#fff")))
  const fg$ = theme$.pipe(map(t => (t === "dark" ? "#eee" : "#222")))

  return (
    <div style={{ background: bg$, color: fg$ }}>
      <h1>Themed Content</h1>
    </div>
  )
}
```

```tsx
// App.tsx — wiring it together
import type { Observable, Lifecycle } from "@jsxrx/core"
import { of } from "rxjs"
import { ThemeProvider } from "./components/ThemeProvider"
import { ThemedPage } from "./components/ThemedPage"

function App(
  props$: Observable<{}>,
  { context }: Lifecycle,
) {
  // Can also set context directly at the root level
  // context.set(ThemeCtx, of("dark"))

  return (
    <ThemeProvider theme="dark">
      <ThemedPage />
    </ThemeProvider>
  )
}
```

> **Full API reference**: See [references/api-quick-ref.md](api-quick-ref.md) for core API signatures, types, and imports.
