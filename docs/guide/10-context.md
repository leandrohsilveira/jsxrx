# Context

JsxRx provides a Context API for sharing reactive state across the component tree without passing props through every level. Context is set imperatively — there are no JSX provider components — and every context value is an Observable, making all context consumers inherently reactive from the ground up.

---

## Table of Contents

1. [Context Model](#context-model)
2. [The Context Class](#the-context-class)
3. [Setting Context](#setting-context)
4. [Reading Context](#reading-context)
5. [Full Pattern: Provision + Consumption](#full-pattern-provision--consumption)
6. [Reload Pattern with Context](#reload-pattern-with-context)
7. [Quick Comparison with React](#quick-comparison-with-react)

---

## Context Model

In JsxRx, context is not provided through a JSX `<Context.Provider>` component. Instead, the `Lifecycle` parameter of every component function exposes a `context` object — an imperative key–value store where:

- **Keys** are `Context<T>` instances (each identified by a unique Symbol)
- **Values** are always `Observable<T>` — context is inherently reactive
- **Propagation** follows the component tree via scoped child contexts

This design means context can be set anywhere — in a parent component, in a route resolver, or imperatively outside the JSX tree — and all descendant components can consume it reactively through observable streams.

---

## The Context Class

A `Context<T>` serves as a typed key for the context map. It stores a human-readable `name` (used for debugging) and an `initialValue` (used as a fallback when no value has been set).

```tsx
import { Context } from "@jsxrx/core"

// Create a context with a name and initial value
const AuthContext = new Context("AuthContext", {
  user: null,
  isLoading: true,
})
```

### Constructor

```ts
new Context<T>(name: string, initialValue: T)
```

| Parameter      | Type     | Description                                                |
|----------------|----------|------------------------------------------------------------|
| `name`         | `string` | Human-readable name for debugging and error messages       |
| `initialValue` | `T`      | Default value returned when context is read but not set    |

Each `Context` instance carries a unique Symbol key derived from its name, guaranteeing that no two contexts can collide even if they share the same name string.

---

## Setting Context

The `context` object is available in the `Lifecycle` parameter of every component function and in route resolvers.

### `context.set(context, value$)`

Sets a context value. The `value$` parameter **must be an `Observable<T>`** — typically an `IState<T>` from `state()`, since `IState<T>` extends `Observable<T>`.

```tsx
import { state } from "@jsxrx/core"
import type { Observable, Lifecycle } from "@jsxrx/core"
import { AuthContext } from "./contexts/auth"

function AuthProvider(
  props$: Observable<{}>,
  { context, subscription }: Lifecycle,
) {
  // Create a reactive state cell
  const authState$ = state({ user: null, isLoading: true })

  // Set the context — all descendant components can now access it
  context.set(AuthContext, authState$)

  // Fetch auth info and update state — cleanup tracked by subscription
  subscription.add(
    fetchUser().subscribe(user => {
      authState$.set({ user, isLoading: false })
    }),
  )

  return <>{/* children rendered here */}</>
}
```

Once `set()` is called, any subsequent `require()` or `optional()` call will receive the registered Observable. If `set()` is called again with a different Observable, downstream consumers automatically switch to the new source.

---

## Reading Context

There are two methods for reading context: `require()` and `optional()`.

### `context.require(context)`

Returns an `Observable<T>`. **Throws** with a descriptive error if the context was never set in any parent `ContextMap`.

```tsx
import { map } from "rxjs"
import type { Observable, Lifecycle } from "@jsxrx/core"
import { AuthContext } from "../contexts/auth"

function UserAvatar(
  props$: Observable<{}>,
  { context }: Lifecycle,
) {
  // require() asserts the context exists — throws if not set
  const auth$ = context.require(AuthContext)

  const avatarUrl$ = auth$.pipe(
    map(s => s.user?.avatarUrl ?? "/default-avatar.png"),
  )

  return <img src={avatarUrl$} alt="User avatar" />
}
```

### `context.optional(context)`

Returns `Observable<T>`. If the context was never set, it emits the `initialValue` from the `Context` definition — no error is thrown.

```tsx
import { map } from "rxjs"
import type { Observable, Lifecycle } from "@jsxrx/core"
import { FeatureConfigContext } from "../contexts/featureConfig"

function OptionalFeatureWidget(
  props$: Observable<{}>,
  { context }: Lifecycle,
) {
  // optional() returns initialValue if context is not set
  const config$ = context.optional(FeatureConfigContext)

  return <div>{config$.pipe(map(c => c.enabled ? "On" : "Off"))}</div>
}
```

The key difference: `require()` asserts the context exists and throws; `optional()` falls back to the context's `initialValue`.

### Type Signatures

```ts
interface IContextMap {
  set<T>(context: IContext<T>, value$: Observable<T>): void
  require<T extends IContext<any>>(context: T): Observable<T["initialValue"]>
  optional(context: Context<T>): Observable<T>
}
```

---

## Full Pattern: Provision + Consumption

Here is the complete flow from context definition through provision to consumption.

### Step 1: Define the Context

```tsx
// contexts/auth.ts
import { Context } from "@jsxrx/core"

export type AuthState = {
  user: { name: string; email: string } | null
  isLoading: boolean
}

export const AuthContext = new Context<AuthState>("AuthContext", {
  user: null,
  isLoading: true,
})
```

### Step 2: Provide in a Component (via Lifecycle)

```tsx
// components/AuthProvider.tsx
import { Props } from "@jsxrx/core"
import type { Observable, Lifecycle } from "@jsxrx/core"
import { of } from "rxjs"
import { AuthContext } from "../contexts/auth"

function AuthProvider(
  props$: Observable<{}>,
  { context }: Lifecycle,
) {
  const { children$ } = Props.take(props$)

  // Set the context to the auth fetch observable directly
  // All descendant components will reactively receive the latest state
  context.set(AuthContext, authUserInfoEndpoint.fetch(of(null)))

  return <>{children$}</>
}
```

Route resolvers can also provision context using the same `context.set()` API — see [Routing](./10-routing.md) for that pattern.

### Step 3: Consume in a Child Component

```tsx
// components/UserAvatar.tsx
import { map } from "rxjs"
import { Props } from "@jsxrx/core"
import type { Observable, Lifecycle } from "@jsxrx/core"
import { AuthContext } from "../contexts/auth"

function UserAvatar(
  props$: Observable<{}>,
  { context }: Lifecycle,
) {
  const auth$ = context.require(AuthContext)

  const avatarUrl$ = auth$.pipe(
    map(s => s.user?.avatarUrl ?? "/default-avatar.png"),
  )

  return <img src={avatarUrl$} alt="User avatar" />
}
```

---

## Reload Pattern with Context

A common requirement is forcing a context value to re-fetch. The idiomatic approach in JsxRx is to combine a trigger observable with the data source and expose a `reload()` function.

```tsx
import { state, combine } from "@jsxrx/core"
import { switchMap } from "rxjs"
import type { Observable, Lifecycle } from "@jsxrx/core"
import { AuthContext } from "../contexts/auth"

function ReloadableAuthProvider(
  props$: Observable<{}>,
  { context }: Lifecycle,
) {
  // Create a trigger that emits a new Symbol() on each reload
  const reloadTrigger$ = state(Symbol())

  // Combine with the reload trigger
  const fetch$ = combine({ trigger: reloadTrigger$ }).pipe(
    switchMap(() => fetchUser()),
  )

  // Set the combined observable as the context value
  context.set(AuthContext, fetch$)

  // Expose a reload function to descendant consumers
  function reload() {
    reloadTrigger$.set(Symbol())
  }

  // ... render UI, pass reload to children via another context or props
}
```

**How it works:**

1. `reloadTrigger$` is a `state(Symbol())` — it always holds a unique `Symbol`.
2. `combine({ trigger: reloadTrigger$ })` emits a new object whenever `reloadTrigger$` changes.
3. `switchMap` cancels the previous fetch and initiates a new one when the trigger emits.
4. Calling `reload()` sets a new `Symbol()`, which triggers `combine` to emit, which triggers `switchMap` to re-fetch.

This pattern ensures that downstream consumers always receive the latest data without needing to manage subscriptions or manual refresh logic.

---

## Quick Comparison with React

| Aspect | React Context | JsxRx Context |
|---|---|---|
| **Provider** | `<Context.Provider value={...}>` JSX component | `context.set(Context, observable$)` in lifecycle or resolvers |
| **Consumer** | `useContext(Context)` hook | `context.require(Context)` / `context.optional(Context)` |
| **Value type** | Any JavaScript value | Always `Observable<T>` — inherently reactive |
| **Where set** | In component render functions | In component lifecycle callbacks or route resolvers |
| **Where read** | In component render functions (via hooks) | In component lifecycle callbacks or route resolvers |
| **Propagation** | Follows JSX component nesting | Follows `downstream()` scoping (component tree or resolver hierarchy) |
| **Missing context** | Uses the default value | `require()` throws; `optional()` uses `initialValue` |
| **Reactivity** | Triggers re-render of all consumers | Updates observable streams — surgical DOM updates |

---

**Next**: [Routing](./11-routing.md)
