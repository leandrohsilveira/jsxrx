# API Endpoint Usage Patterns

Source files: `packages/api/src/api.js`, `packages/api/src/types.ts`, `packages/api/src/parsers.js`

---

## 1. Two API Interaction Modes

JsxRx's `@jsxrx/api` package provides two distinct modes for API interaction:

| Feature | `endpoint.fetch()` (Reactive) | `endpoint.action()` (Imperative) |
|---|---|---|
| Return type | `Observable<Output>` | `Action<Input, Output>` |
| Use case | Data queries, reactive streams | Mutations, form submissions |
| Re-triggers | Yes, when input$ emits | One-shot via `.perform()` |
| Loading state | `.pending$` on returned observable | `.pending$` on action |

---

## 2. Reactive Mode: `endpoint.fetch()`

Used for data queries. Pass an observable trigger; when it emits, the request fires. Returns an `ActivityAwareObservable<Output>` — a regular `Observable` extended with a `.pending$` property for tracking loading state.

```tsx
// Simple fetch — the result is ActivityAwareObservable<User[]>
const page$ = state(1)
const users$ = listUsersEndpoint.fetch(page$)

// Auto-fetching on URL change
function UserListResolver({ url$ }) {
  const users$ = listUsersEndpoint.fetch(
    url$.pipe(map(url => ({ page: url.searchParams.get("page") || 1 })))
  )
  return { users: users$ }
}
```

### How `fetch()` works internally

Inside `api.js`, `fetch()` wires the input observable through a pipeline:

```js
// packages/api/src/api.js (simplified)
fetch(input$) {
  return toObservable(
    input$.pipe(
      debounceTime(1),                              // coalesce rapid emissions
      distinctUntilChanged(shallowComparator),       // skip identical inputs
      start,                                         // set pending$ = true
      switchMap(input => from(send(input))),          // cancel previous, start new
      complete,                                      // set pending$ = false
      shareReplay({ bufferSize: 1, refCount: true }), // cache last value
    ),
  )
}
```

Key behaviours:

- **Debounced (1ms)**: Rapid successive emissions are coalesced
- **Deduplicated**: Identical inputs (shallow-compared) are ignored
- **Cancellation**: `switchMap` cancels any in-flight request when a new input arrives
- **Cached**: `shareReplay({ bufferSize: 1, refCount: true })` replays the last value to late subscribers
- **`.pending$` tracking**: The `start`/`complete` taps toggle a shared `BehaviorSubject<boolean>`

### Activity awareness

The returned observable is an `ActivityAwareObservable` — every RxJS operator piped through `.pipe()` preserves the wrapper, so `.pending$` remains available after transformations:

```tsx
const users$ = listUsersEndpoint.fetch(page$)

// Pipe operators — .pending$ is still accessible
const activeUsers$ = users$.pipe(map(users => users.filter(u => u.active)))

activeUsers$.pending$  // ✅ still works — Observable<boolean>
```

---

## 3. Imperative Mode: `endpoint.action()`

Used for mutations (POST, PUT, DELETE, etc.). Returns an `Action<Input, Output>` object that tracks state through its lifecycle.

```tsx
function LoginResolver({ context }) {
  const loginAction = loginEndpoint.action()

  return {
    onSubmit(data: LoginData) {
      loginAction.perform(data)
        .then(() => navigate("/dashboard"))
        .catch(err => console.error("Login failed", err))
    },
    isSubmitting: loginAction.pending$,
    error: loginAction.error$,
  }
}
```

### The `Action<I, O>` interface

```ts
interface Action<I, O> extends AsyncState<O> {
  perform(value: I): Promise<O>  // execute the action
  reset(): void                  // reset to idle state
}

interface AsyncState<T, E = unknown> {
  kind: "async"
  pending$: Observable<boolean>     // true while request in-flight
  value$: Observable<T>             // success result
  error$: Observable<E>             // error if request fails
  state$: Observable<PendingState<T>>  // full state machine
}
```

### The `PendingState<Output>` union

```ts
type PendingState<T> =
  | { state: "idle" | "pending"; value: null; error: null }
  | { state: "success"; value: T; error: null }
  | { state: "error"; value: null; error: unknown }
```

### Action lifecycle

1. **Idle** — action created, no call performed yet
2. **Pending** — `action.perform(input)` called, request in flight
3. **Success** — request resolved successfully, `value$` emits the result
4. **Error** — request threw an error, `error$` emits the error
5. Back to **Idle** — `action.reset()` resets all observables

### How `action()` works internally

```js
// packages/api/src/api.js (simplified)
action() {
  const state$ = state({ state: "idle", value: null, error: null })
  return {
    kind: "async",
    state$: state$.pipe(debounceTime(1)),
    pending$: state$.pipe(
      debounceTime(1),
      map(s => s.state === "pending"),
      distinctUntilChanged(),
    ),
    value$: state$.pipe(
      debounceTime(1),
      filter(s => s.state === "success"),
      map(s => s.value),
    ),
    error$: state$.pipe(
      debounceTime(1),
      filter(s => s.state === "error"),
      map(s => s.error),
    ),
    reset() {
      state$.set({ state: "idle", value: null, error: null })
    },
    async perform(input) {
      state$.set({ state: "pending", value: null, error: null })
      try {
        const value = await send(input)
        state$.set({ state: "success", value, error: null })
        return value
      } catch (error) {
        state$.set({ state: "error", value: null, error })
        throw error
      }
    },
  }
}
```

The action is backed by a `State<PendingState<Output>>` from `@jsxrx/core`. Each state transition emits through the derived observables (`pending$`, `value$`, `error$`).

---

## 4. The Reload/Refresh Pattern

Use `state(Symbol())` as a trigger to force a re-fetch. Each call to `Symbol()` creates a unique value, guaranteeing downstream observables emit.

```tsx
function AuthProvider({ context, url$ }) {
  const reloadTrigger$ = state(Symbol())

  // Combine URL changes with manual reload trigger
  const auth$ = combine({
    url: url$,
    trigger: reloadTrigger$,
  }).pipe(
    switchMap(() => authUserInfoEndpoint.fetch(of(null)))
  )

  context.set(AuthContext, auth$)

  // Expose reload function
  return {
    reloadUserInfo: () => reloadTrigger$.set(Symbol()),
  }
}
```

### Why `Symbol()` works

1. `reloadTrigger$` is a `State<symbol>` initialized with a unique `Symbol()`
2. Calling `reloadTrigger$.set(Symbol())` produces a **new, unique** value
3. `combine()` detects the change and emits a new combined value
4. `switchMap` unsubscribes from the previous fetch and starts a new one
5. The URL is always read fresh from `url$` because `combine()` captures it at the time of trigger

This pattern is useful for:

- **Refreshing after a mutation** — call `reloadUserInfo()` after a profile update
- **Retry on error** — expose the reload function as a retry mechanism
- **Invalidating cache** — force data re-fetch when the user navigates back

---

## 5. Endpoint Creation Best Practices

### Co-locate endpoints with their domain

Group related endpoints in domain-specific files:

```tsx
// api/client.ts — centralized client
const client = createHttpClient({ baseUrl: "/api" })

// api/auth.ts — auth domain endpoints
export const authUserInfoEndpoint = client.createEndpoint<
  unknown,         // Req — no request body
  AuthUserInfo,    // Res — raw response type
  void,            // Input — no input needed
  AuthUserInfo     // Output — final output type
>({
  method: "GET",
  path: "/auth/info",
  responseBodyParser: jsonResponseBody(),
  responseSetup(result) {
    if (!result.ok) return null
    return result.body
  },
})

export const loginEndpoint = client.createEndpoint<
  LoginPayload,    // Req — request body type (used with jsonRequestBody())
  null,            // Res — no response body (used with noResponseBody())
  LoginPayload,    // Input — login payload
  void             // Output — no return value
>({
  method: "POST",
  path: "/auth/login",
  requestBodyParser: jsonRequestBody(),
  responseBodyParser: noResponseBody(),
  responseSetup(result) {
    if (!result.ok) throw new Error(`Login failed (${result.status})`)
    // no return value on success
  },
})
```

### Use type parameters correctly

The `createEndpoint` method accepts four generic parameters in this order:

```ts
client.createEndpoint<Req, Res, Input, Output>(params)
//                     ^^^  ^^^  ^^^^^  ^^^^^^
//                     1st: Req  2nd: Res  3rd: Input  4th: Output
```

- **Req** (first generic): The request body type consumed by `requestBodyParser`. Use `unknown` when there is no request body.
- **Res** (second generic): The raw response body type returned by `responseBodyParser`. Determines the type of `result.body` inside `responseSetup`.
- **Input** (third generic): What `requestSetup` receives and what `send`/`perform` expect as argument.
- **Output** (fourth generic): What `responseSetup` returns and what `fetch`/`send`/`action.value$` emit.

When `Input` is `void` (no input needed), the `send` signature becomes `() => Promise<Output>`. When `Output` is `void`, the `send` signature becomes `(input: I) => Promise<void>`.

### Use `noResponseBody()` for empty responses

For `204 No Content` or any endpoint that returns no body:

```tsx
const deleteUser = client.createEndpoint<
  unknown,         // Req — no request body
  null,            // Res — no response body (noResponseBody)
  { id: string },  // Input — user ID
  void             // Output — no return value
>({
  method: "DELETE",
  path: "/users/{id}",
  requestSetup({ id }) {
    return { params: { id } }
  },
  responseBodyParser: noResponseBody(),
  responseSetup(result) {
    if (!result.ok) throw new Error(`HTTP ${result.status}`)
    // result.body is null
  },
})
```

---

## 6. Loading State Patterns

### With `fetch()` — the observable is ActivityAware

The returned observable carries a `.pending$` property that the `Suspense` component can read:

```tsx
const data$ = endpoint.fetch(input$)

<Suspense suspended={data$.pending$} fallback={<Skeleton />}>
  <DataDisplay data$={data$} />
</Suspense>
```

### With `action()` — use the action's `pending$`

```tsx
const action = endpoint.action()

<Button disabled={action.pending$} onClick={() => action.perform(data)}>
  {action.pending$.pipe(map(p => p ? "Saving..." : "Save"))}
</Button>
```

### Using the `pending()` utility

The `@jsxrx/core` package exports a `pending()` utility that accepts both `ActivityAwareObservable` and `AsyncState`:

```tsx
import { pending } from "@jsxrx/core"

// With fetch()
const users$ = endpoint.fetch(input$)
const isLoading$ = pending(users$)   // same as users$.pending$

// With action()
const action = endpoint.action()
const isSaving$ = pending(action)    // same as action.pending$
```

The `pending()` function is defined in `packages/core/src/observable.js`:

```js
export function pending(value, debounce = 5) {
  if (isAsyncState(value)) {
    return value.pending$.pipe(debounceTime(debounce), distinctUntilChanged())
  }
  if (isActivityAwareObservable(value)) {
    return value.pending$.pipe(debounceTime(debounce), distinctUntilChanged())
  }
  // Fallback: treat value as Observable<PendingState>
  return value.pipe(
    map(value => {
      if (isPendingState(value)) return value.state === "pending"
      return false
    }),
    debounceTime(1),
    startWith(false),
    distinctUntilChanged(),
  )
}
```

---

## 7. Error Handling

### With `action()` — subscribe to `error$`

```tsx
const action = endpoint.action()
const errorMessage$ = action.error$.pipe(
  map(err => err?.message ?? null)
)

// In JSX
{errorMessage$.pipe(map(msg =>
  msg ? <div className="error">{msg}</div> : null
))}
```

### With `fetch()` — catch inside `responseSetup`

Since `fetch()` uses `switchMap`, errors propagate through the observable. The cleanest approach is to handle errors in `responseSetup`:

```tsx
const getUser = client.createEndpoint<
  unknown,         // Req — no request body
  User,            // Res — raw response type
  { id: string },  // Input — user ID
  User             // Output — final output type
>({
  method: "GET",
  path: "/users/{id}",
  requestSetup({ id }) {
    return { params: { id } }
  },
  responseBodyParser: jsonResponseBody(),
  responseSetup(result) {
    if (!result.ok) throw new Error(`Failed to fetch user: ${result.status}`)
    return result.body
  },
})

// Usage — errors surface in the observable
const user$ = getUser.fetch(userId$).pipe(
  catchError(err => {
    console.error("User fetch failed", err)
    return of(null) // fallback
  })
)
```

### Action with error handling and reset

```tsx
const updateProfile = client.createEndpoint<
  Profile,         // Req — request body type (used with jsonRequestBody())
  Profile,         // Res — raw response type
  Profile,         // Input — profile data
  Profile          // Output — final output type
>({
  method: "PUT",
  path: "/profile",
  requestBodyParser: jsonRequestBody(),
  requestSetup(input) {
    return { body: input }
  },
  responseBodyParser: jsonResponseBody(),
  responseSetup(result) {
    if (!result.ok) throw new Error(`HTTP ${result.status}`)
    return result.body
  },
})

const saveAction = updateProfile.action()

// Subscribe to errors for toast notifications
saveAction.error$.subscribe(err => {
  showToast(`Save failed: ${err.message}`)
})

// Subscribe to success
saveAction.value$.subscribe(profile => {
  showToast("Profile updated")
})

// Reset the action state when leaving the page
function cleanup() {
  saveAction.reset()
}
```

---

## 8. Choosing Between `fetch()` and `action()`

| Scenario | Use | Reason |
|---|---|---|
| Loading a list of items | `fetch()` | Auto-refetches when filters/pagination change |
| URL-driven data loading | `fetch()` | Pipe the `url$` observable directly |
| Form submission | `action()` | One-shot, `.pending$` for button state |
| Delete a resource | `action()` | One-shot, want `.error$` tracking |
| Re-fetch on demand | `fetch()` with `Symbol()` trigger | See §4: Reload Pattern |
| Polling/interval refresh | `fetch()` with `interval()` | `fetch()` accepts any observable trigger |

---

## 9. Full Example: Complete CRUD

```tsx
import { createHttpClient, jsonRequestBody, jsonResponseBody, noResponseBody } from "@jsxrx/api"
import { state, combine } from "@jsxrx/core"

const client = createHttpClient({ baseUrl: "/api" })

// --- Query endpoints ---
const listUsers = client.createEndpoint<
  unknown,           // Req — no request body
  User[],            // Res — raw response type
  { page: number },  // Input — page number
  User[]             // Output — final output type
>({
  method: "GET",
  path: "/users",
  requestSetup({ page }) {
    return { search: { page: String(page), limit: "20" } }
  },
  responseBodyParser: jsonResponseBody(),
  responseSetup(result) {
    if (!result.ok) throw new Error(`HTTP ${result.status}`)
    return result.body
  },
})

const getUser = client.createEndpoint<
  unknown,         // Req — no request body
  User,            // Res — raw response type
  { id: string },  // Input — user ID
  User             // Output — final output type
>({
  method: "GET",
  path: "/users/{id}",
  requestSetup({ id }) {
    return { params: { id } }
  },
  responseBodyParser: jsonResponseBody(),
  responseSetup(result) {
    if (!result.ok) throw new Error(`HTTP ${result.status}`)
    return result.body
  },
})

// --- Mutation endpoints ---
const createUser = client.createEndpoint<
  CreateUserInput,  // Req — request body type (used with jsonRequestBody())
  User,             // Res — raw response type
  CreateUserInput,  // Input — create user input
  User              // Output — final output type
>({
  method: "POST",
  path: "/users",
  requestBodyParser: jsonRequestBody(),
  requestSetup(input) {
    return { body: input }
  },
  responseBodyParser: jsonResponseBody(),
  responseSetup(result) {
    if (!result.ok) throw new Error(`HTTP ${result.status}`)
    return result.body
  },
})

const deleteUser = client.createEndpoint<
  unknown,         // Req — no request body
  null,            // Res — no response body (noResponseBody)
  { id: string },  // Input — user ID
  void             // Output — no return value
>({
  method: "DELETE",
  path: "/users/{id}",
  requestSetup({ id }) {
    return { params: { id } }
  },
  responseBodyParser: noResponseBody(),
  responseSetup(result) {
    if (!result.ok) throw new Error(`HTTP ${result.status}`)
  },
})

// --- Usage in a resolver ---
function UsersResolver({ context }) {
  const page$ = state(1)
  const reload$ = state(Symbol())
  const reloadTrigger$ = combine({ page: page$, reload: reload$ })

  const users$ = listUsers.fetch(reloadTrigger$)

  const createAction = createUser.action()
  const deleteAction = deleteUser.action()

  return {
    users: users$,                // Observable<User[]>
    loading: users$.pending$,     // Observable<boolean>

    createAction,                 // Action<CreateUserInput, User>
    deleteAction,                 // Action<{ id: string }, void>

    nextPage: () => page$.set(page$.value + 1),
    reload: () => reload$.set(Symbol()),
  }
}
```

---

## 10. Reference

- `packages/api/src/api.js` — `createHttpClient()`, `endpoint.fetch()`, `endpoint.action()`, request pipeline
- `packages/api/src/types.ts` — `HttpEndpoint`, `Action`, `PendingState`, `RequestFn`, parser type definitions
- `packages/api/src/parsers.js` — `jsonRequestBody()`, `jsonResponseBody()`, `noResponseBody()`
- `packages/core/src/observable.js` — `ActivityAwareObservable`, `pending()`, `activity()`
- `packages/core/src/jsx.d.ts` — `AsyncState`, `PendingState` type definitions
