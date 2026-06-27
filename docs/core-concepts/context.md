# Context API

JsxRx provides a Context API for sharing reactive state across the component tree without passing props through every level. Unlike React's `createContext` / `useContext` pair, JsxRx Context uses observable-based values and an imperative key-value store — there are no JSX provider components and no `useContext()` calls.

---

## Table of Contents

1. [Context Model — How It's Different](#context-model--how-its-different)
2. [The Context Class](#the-context-class)
3. [ContextMap — Setting Context](#contextmap--setting-context)
4. [ContextMap — Reading Context](#contextmap--reading-context)
5. [Full Pattern: Provision + Consumption](#full-pattern-provision--consumption)
6. [Reload Pattern with Context](#reload-pattern-with-context)
7. [downstream() — Scoped Child Contexts](#downstream--scoped-child-contexts)
8. [Key Differences from React Context](#key-differences-from-react-context)

---

## Context Model — How It's Different

In React, context is provided through JSX via `<Context.Provider value={...}>` and consumed via `useContext(Context)`. The provider lives in the component tree, and context propagation follows the component hierarchy.

In JsxRx, there is **no `<Context.Provider>` component**. Context is set and read through the `ContextMap`, which is available as `context` in the `Lifecycle` parameter of every component function, and in route resolvers. The `ContextMap` is an imperative key-value store where:

- **Keys** are `Context<T>` instances (each identified by a `Symbol`)
- **Values** are always `Observable<T>` — context is inherently reactive
- **Propagation** follows the component tree, tracked via `downstream()` scoping

This design means context can be provisioned anywhere — in a parent component, in a route resolver, or even imperatively outside the JSX tree — and all descendant components can consume it reactively through observable streams.

---

## The Context Class

**Source file:** [`packages/core/src/context.js`](../../packages/core/src/context.js)

A `Context<T>` serves as a typed key for the context map. It stores a `name` (used for debugging) and an `initialValue` (used when context is never set).

```tsx
import { Context } from "@jsxrx/core"

// Create a context with a name and initial value
const AuthContext = new Context<AuthState>("AuthContext", {
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
| `initialValue` | `T`      | Default value returned by `optional()` when context is not set |

Each `Context` instance carries a unique `Symbol` (derived from its `name`) that serves as the key when storing and retrieving values in the `ContextMap`. This ensures no two contexts can collide, even if they share the same name.

---

## ContextMap — Setting Context

**Source file:** [`packages/core/src/context.js`](../../packages/core/src/context.js)

The `ContextMap` is the runtime object that holds context values. It is available as `context` in the `Lifecycle` parameter of every component function, and in route resolvers.

### `context.set(context, value$)`

Sets a context value. The `value$` parameter **must be an `Observable<T>`** (typically an `IState<T>` from `state()`, since `IState<T>` extends `Observable<T>`).

```tsx
import { state } from "@jsxrx/core"
import { AuthContext } from "./contexts/auth"

function AuthProvider(
  props$: Observable<{}>,
  { context }: Lifecycle,
) {
  // Create a reactive state cell
  const authState$ = state({ user: null, isLoading: true })

  // Set the context — all descendant components can now access it
  context.set(AuthContext, authState$)

  // Fetch auth info and update state
  fetchUser().subscribe(user => {
    authState$.set({ user, isLoading: false })
  })

  return <>{/* children rendered here */}</>
}
```

Once `set()` is called, any subsequent `require()` or `optional()` call will receive the registered Observable. If `set()` is called again with a different Observable, downstream consumers automatically switch to the new source.

Context can also be set in route resolvers using the same `context.set()` API. See the Routing core concept for that pattern.

---

## ContextMap — Reading Context

**Source file:** [`packages/core/src/context.js`](../../packages/core/src/context.js)

There are two methods for reading context, plus a method for creating child scopes (covered in [downstream()](#downstream--scoped-child-contexts)).

### `context.require(context)`

Returns an `Observable<T>`. **Throws** if the context was never set in any parent `ContextMap`.

```tsx
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

The returned observable is an `ActivityAwareObservable` (see [State Management](./state-management.md)). This means it has a `.pending$` property that tracks the loading state of the underlying context value.

### `context.optional(context)`

Returns `Observable<T>`. If the context was never set, it emits the `initialValue` from the `Context` definition — no error is thrown.

```tsx
function OptionalFeatureWidget(
  props$: Observable<{}>,
  { context }: Lifecycle,
) {
  // optional() returns initialValue if context is not set
  const config$ = context.optional(FeatureConfigContext)

  return <div>{config$.pipe(map(c => c.enabled ? "On" : "Off"))}</div>
}
```

The key difference: `require()` asserts the context exists and throws with a descriptive error; `optional()` falls back to `context.initialValue`.

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
import { state, Props } from "@jsxrx/core"
import type { Observable, Lifecycle } from "@jsxrx/core"
import type { PropsWithChildren } from "@jsxrx/core"
import { of } from "rxjs"
import { AuthContext } from "../contexts/auth"

function AuthProvider(
  props$: Observable<PropsWithChildren<{}>>,
  { context }: Lifecycle,
) {
  const { children$ } = Props.take(props$)

  // Create a reactive state cell
  const authState$ = state({ user: null, isLoading: true })

  // Set the context — all descendant components can now access it
  context.set(AuthContext, authState$)

  // Fetch auth info
  authUserInfoEndpoint.fetch(of(null)).subscribe(state => {
    authState$.set(state)
  })

  return <>{children$}</>
}
```

Route resolvers can also provision context using the same `context.set()` API — see the Routing core concept for that pattern.

### Step 3: Consume in a Component (via Lifecycle)

Components access context through the `Lifecycle` parameter's `context` object.

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

A common requirement is forcing a context value to re-fetch. The idiomatic approach in JsxRx is to combine a trigger observable with the data source and expose a `reload()` function. This pattern works identically whether context is set in a component lifecycle or a route resolver.

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

## downstream() — Scoped Child Contexts

**Source file:** [`packages/core/src/context.js`](../../packages/core/src/context.js)

`context.downstream()` creates a child `ContextMap` that inherits all parent context values. Changes to the parent's context automatically flow to the child, but the child can `set()` its own contexts without affecting siblings.

```tsx
function ParentComponent(
  props$: Observable<{}>,
  { context }: Lifecycle,
) {
  context.set(AppContext, appState$)

  // Create a child context map that inherits AppContext
  const childContext = context.downstream()

  // The child can set its own contexts
  childContext.set(ChildContext, childState$)

  // childContext gets passed down to child components
  return <ChildComponent lifecycle={{ context: childContext }} />
}
```

This is used internally by the routing system to create scoped contexts for each route segment, and can be used directly in components when you need isolated context scopes. A child route resolver automatically receives a `downstream()` of its parent's context, which is why `context.require()` in a child can find contexts set in a parent.

---

## Key Differences from React Context

| Aspect | React Context | JsxRx Context |
|---|---|---|
| **Provider** | `<Context.Provider value={...}>` JSX component | `context.set(Context, observable$)` in lifecycle or resolvers |
| **Consumer** | `useContext(Context)` hook | `context.require(Context)` / `context.optional(Context)` |
| **Value type** | Any JavaScript value | Always `Observable<T>` — inherently reactive |
| **Where set** | In component render functions | In component lifecycle callbacks or route resolvers |
| **Where read** | In component render functions (via hooks) | In component lifecycle callbacks or route resolvers |
| **Propagation** | Follows JSX component nesting | Follows `downstream()` scoping (component tree or resolver hierarchy) |
| **Default value** | Passed to `createContext()` | Used by `optional()` when context is not set |
| **Missing context** | Uses the default value | `require()` throws; `optional()` uses `initialValue` |
| **Reactivity** | Triggers re-render of all consumers | Updates observable streams — surgical DOM updates |

### Summary

- **No JSX provider components** — context is set imperatively via `context.set()` in component lifecycles or route resolvers.
- **Context values are always `Observable<T>`** — there is no plain value path. This ensures all context consumers are inherently reactive.
- **Context can be set in any component** via the `Lifecycle` parameter, or in route resolvers. This cleanly separates data provisioning from presentation without restricting where provisioning happens.
- **Components access context through their `Lifecycle.context`**, not through a `useContext()`-style hook.
- **`downstream()` scoping** provides hierarchical isolation without the JSX nesting constraints of React Context.

---

## Source Files Referenced

| Concept | Source File |
|---|---|
| `Context` class | [`packages/core/src/context.js`](../../packages/core/src/context.js) |
| `ContextMap` class (`set`, `require`, `optional`, `downstream`) | [`packages/core/src/context.js`](../../packages/core/src/context.js) |
| `IContext<T>`, `IContextMap` interfaces | [`packages/core/src/jsx.d.ts`](../../packages/core/src/jsx.d.ts) |
| `Lifecycle.context` | [`packages/core/src/jsx.d.ts`](../../packages/core/src/jsx.d.ts) |
