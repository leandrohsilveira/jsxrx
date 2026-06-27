# `@jsxrx/api` API Reference

Source files: `packages/api/src/api.js`, `packages/api/src/types.ts`, `packages/api/src/parsers.js`

---

## Installation

```bash
npm i @jsxrx/api
```

---

## `createHttpClient()`

Creates an HTTP client bound to a base URL.

```tsx
import { createHttpClient } from "@jsxrx/api"

const client = createHttpClient({
  baseUrl: "/api",
  defaultHeaders: { "Content-Type": "application/json" },
})
```

### `HttpClientParams`

| Property | Type | Default | Description |
|---|---|---|---|
| `baseUrl` | `string` | — | Base URL prepended to all endpoint paths |
| `defaultHeaders` | `ParamsMap` | `{}` | Headers applied to every request |

```ts
interface HttpClientParams {
  baseUrl: string
  defaultHeaders?: ParamsMap
}
```

### Return value

Returns an `HttpClient` object with a single method: `createEndpoint()`.

```ts
interface HttpClient {
  createEndpoint<Input, Req, Res, Output>(
    params: HttpEndpointParams<Input, Req, Res, Output>,
  ): HttpEndpoint<Input, Output>
}
```

---

## `client.createEndpoint()`

Defines a typed endpoint with request/response transformations.

```tsx
const endpoint = client.createEndpoint<Input, Output>({
  method: "GET",
  path: "/users/{id}",          // {param} placeholders
  params: { id: "123" },        // static URL params
  search: { page: 1 },          // query string params
  headers: { Authorization: "Bearer ..." },
  requestBodyParser: jsonRequestBody(),       // transforms request body
  responseBodyParser: jsonResponseBody(),     // parses response body
  requestSetup(input) {
    // Transform input before sending
    return { body: null, params: { id: input.id }, search: { page: input.page } }
  },
  responseSetup(result) {
    // Transform response after parsing
    if (!result.ok) throw new Error(`HTTP ${result.status}`)
    return result.body
  },
})
```

### `HttpEndpointParams<Input, Req, Res, Output>`

| Property | Type | Default | Description |
|---|---|---|---|
| `method` | `HttpMethod` | `"GET"` | HTTP method (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`, `HEAD`) |
| `path` | `string` | — | URL path template. Use `{name}` tokens for parameter substitution |
| `params` | `ParamsMap` | `{}` | Static URL path parameters merged into the path template |
| `search` | `ParamsMap` | `{}` | Static query-string parameters appended to the URL |
| `headers` | `ParamsMap` | `{}` | Additional headers merged with `defaultHeaders` |
| `body` | `unknown` | — | Static request body (used when no `requestBodyParser` is set) |
| `requestBodyParser` | `RequestBodyParser<Req>` | — | Transforms the request body into headers + body |
| `responseBodyParser` | `ResponseBodyParser<Res>` | — | Parses the response body into a typed result |
| `requestSetup` | `(input: Input) => HttpRequestParams` | — | Transforms the input into URL params, search params, headers, and/or body |
| `responseSetup` | `(result: HttpResponseParams<Res>) => Output` | — | Transforms the parsed response into the final output |

#### `HttpRequestParams`

```ts
interface HttpRequestParams<T = unknown> {
  params?: ParamsMap   // Overrides/extends static URL params
  search?: ParamsMap   // Overrides/extends static search params
  headers?: ParamsMap  // Overrides/extends static/global headers
  body?: T             // Request body
}
```

#### `HttpResponseParams`

```ts
interface HttpResponseParams<T = unknown> {
  ok: boolean        // Response.ok
  status: number     // HTTP status code
  headers: Headers   // Response headers
  body: T            // Parsed response body
}
```

#### `HttpMethod`

```ts
type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD"
```

#### `ParamsMap`

```ts
type ParamsMap = Record<string, unknown>
```

### Path parameter resolution

Path templates use `{name}` tokens. The final path is resolved by replacing each token with the corresponding value from the merged `params` (static + `requestSetup` + `requestBodyParser`):

```text
path: "/api/users/{userId}/posts/{postId}"
params: { userId: "42", postId: "7" }
→ "/api/users/42/posts/7"
```

The merge order (later overrides earlier) is:
1. Static `params` from endpoint definition
2. `params` returned by `requestBodyParser`
3. `params` returned by `requestSetup`

The same precedence applies to `search` and `headers`.

### Return value

Returns an `HttpEndpoint<Input, Output>` with three methods:

```ts
interface HttpEndpoint<I, O> {
  send(input: I): Promise<O>
  fetch(input$: Observable<I>): Observable<O>  // ActivityAwareObservable (has .pending$)
  action(): Action<I, O>
}
```

---

## `endpoint.send(input)` — Imperative One-Shot

Sends a single request and returns a `Promise<Output>`.

```tsx
const result = await endpoint.send({ page: 1 })
// Promise<Output>

// Use for one-off requests, inside event handlers, or imperatively
```

The signature of `send` is a `RequestFn<I, O>` — it adapts its parameter and return types based on whether `Input` and `Output` are `null`:

```ts
type RequestFn<I, O> = I extends null
  ? () => Promise<O>
  : O extends null
    ? (input: I) => Promise<void>
    : (input: I) => Promise<O>
```

---

## `endpoint.fetch(input$)` — Reactive Stream

Creates a reactive observable that re-fetches whenever the input stream emits.

```tsx
import { state } from "@jsxrx/core"

const trigger$ = state({ page: 1 })

const data$ = endpoint.fetch(trigger$)

// Subscribe to get values
data$.subscribe(console.log)

// Access loading state
data$.pending$.subscribe(isLoading => console.log("loading:", isLoading))
```

### How it works

1. The input observable is debounced (1ms) and deduplicated via `shallowComparator`
2. On each emission, the previous in-flight request is cancelled (via `switchMap`)
3. `pending$` goes `true` when a fetch starts, `false` when it completes or errors
4. The result is cached via `shareReplay({ bufferSize: 1, refCount: true })`

### Return value

Returns an **`ActivityAwareObservable<Output>`** — a regular `Observable` extended with a `pending$` property:

```ts
// Accessible on the returned observable:
data$.pending$    // Observable<boolean> — loading state
```

All RxJS operators piped through `.pipe()` preserve the `ActivityAwareObservable` wrapper, so `.pending$` remains available after transformations.

---

## `endpoint.action()` — Mutation Action

Creates an `Action<I, O>` for one-shot mutations (POST, PUT, DELETE, etc.) with built-in state tracking.

```tsx
const action = endpoint.action()

// Perform the action
await action.perform(input)

// Check loading state
action.pending$  // Observable<boolean>

// Get the result
action.value$    // Observable<Output>

// Get errors
action.error$    // Observable<Error>

// Get full state
action.state$    // Observable<PendingState<Output>>

// Reset to idle
action.reset()
```

### `Action<I, O>` type

```ts
interface Action<I, O> extends AsyncState<O> {
  perform(value: I): Promise<O>
  reset(): void
}
```

Extends `AsyncState<O>`:

```ts
interface AsyncState<T, E = unknown> {
  kind: "async"
  pending$: Observable<boolean>
  state$: Observable<PendingState<T>>
  value$: Observable<T>
  error$: Observable<E>
}
```

### `PendingState<Output>`

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

---

## Body Parsers

### `jsonRequestBody(contentType?)`

Transforms a body object into a JSON request.

```tsx
import { jsonRequestBody } from "@jsxrx/api"

jsonRequestBody()                   // Content-Type: application/json
jsonRequestBody("application/json") // explicit content type
```

- **Arguments**: `contentType?: string` (default: `"application/json"`)
- **Returns**: `RequestBodyParser` that sets `Content-Type` header and `JSON.stringify`s the body

### `jsonResponseBody(accepts?)`

Parses a JSON response body. Validates the `Content-Type` header before parsing.

```tsx
import { jsonResponseBody } from "@jsxrx/api"

jsonResponseBody()                   // Accept: application/json
jsonResponseBody("application/json")
```

- **Arguments**: `accepts?: string` (default: `"application/json"`)
- **Returns**: `ResponseBodyParser` that:
  - Sets the `Accept` header on the request
  - Parses the response as JSON if `Content-Type` matches
  - Throws if the content type is unexpected

### `noResponseBody()`

For endpoints that return no content (e.g., `204 No Content`).

```tsx
import { noResponseBody } from "@jsxrx/api"

noResponseBody()
```

- **Returns**: `ResponseBodyParser<null>` with no `Accept` header and `body: null`

---

## Comparison: `fetch()` vs `action()`

| Feature | `endpoint.fetch()` | `endpoint.action()` |
|---|---|---|
| Return type | `ActivityAwareObservable<Output>` (has `.pending$`) | `Action<I, O>` (extends `AsyncState`) |
| Use case | Data queries, reactive streams | Mutations, form submissions |
| Re-fetches | Yes, when `input$` emits | No, one-shot via `perform()` |
| Loading state | Via `.pending$` on returned observable | Via `action.pending$` |
| Request cancellation | Automatic via `switchMap` | No cancellation |
| State reset | Unsubscribes/resubscribes | `action.reset()` |

---

## Full Example

```tsx
import { createHttpClient, jsonRequestBody, jsonResponseBody } from "@jsxrx/api"
import { state } from "@jsxrx/core"

const client = createHttpClient({ baseUrl: "/api" })

// --- Query endpoint ---
const listUsers = client.createEndpoint<ListParams, unknown, User[], User[]>({
  method: "GET",
  path: "/users",
  requestSetup(input) {
    return { search: { page: input.page, limit: input.limit } }
  },
  responseBodyParser: jsonResponseBody(),
  responseSetup(result) {
    if (!result.ok) throw new Error(`HTTP ${result.status}`)
    return result.body
  },
})

// --- Mutation endpoint ---
const createUser = client.createEndpoint<CreateUserInput, unknown, User, User>({
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

// --- Usage in a resolver ---
function UsersResolver({ context }) {
  const page$ = state(1)
  const users$ = listUsers.fetch(page$)
  const createAction = createUser.action()

  return {
    users: users$,               // Observable<User[]>
    pending: users$.pending$,    // Observable<boolean>
    createAction,                // Action<CreateUserInput, User>
  }
}
```

---

## Code Examples

### Example 1: Basic GET with path params

```tsx
const getUser = client.createEndpoint<{ id: string }, unknown, User, User>({
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

// Imperative
const user = await getUser.send({ id: "42" })

// Reactive
const userId$ = state({ id: "42" })
const user$ = getUser.fetch(userId$)
```

### Example 2: POST with JSON body

```tsx
const createPost = client.createEndpoint<{ title: string; body: string }, unknown, Post, Post>({
  method: "POST",
  path: "/posts",
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

// Use action for form submissions
const saveAction = createPost.action()

async function handleSubmit(data) {
  try {
    const post = await saveAction.perform(data)
    notifySuccess("Post created")
  } catch (error) {
    notifyError(error.message)
  }
}
```

### Example 3: DELETE with no response body

```tsx
const deleteUser = client.createEndpoint<{ id: string }, unknown, null, void>({
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

await deleteUser.send({ id: "42" })
```

### Example 4: Reactive search with query params

```tsx
const searchUsers = client.createEndpoint<{ q: string }, unknown, User[], User[]>({
  method: "GET",
  path: "/users/search",
  requestSetup({ q }) {
    return { search: { q } }
  },
  responseBodyParser: jsonResponseBody(),
  responseSetup(result) {
    if (!result.ok) throw new Error(`HTTP ${result.status}`)
    return result.body
  },
})

const search$ = state({ q: "" })

// Automatically debounced (1ms) and deduplicated
const results$ = searchUsers.fetch(search$)

// Track loading state
results$.pending$.subscribe(loading => {
  showSpinner(loading)
})
```

### Example 5: Action with error handling reset

```tsx
const updateProfile = client.createEndpoint<Profile, unknown, Profile, Profile>({
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

// Subscribe to errors
saveAction.error$.subscribe(err => {
  showToast(`Save failed: ${err.message}`)
})

// Subscribe to success
saveAction.value$.subscribe(profile => {
  showToast("Profile updated")
})

// Reset after navigating away
function cleanup() {
  saveAction.reset()
}
```

### Example 6: Custom headers and auth token

```tsx
const authenticatedClient = createHttpClient({
  baseUrl: "https://api.example.com",
  defaultHeaders: { "Content-Type": "application/json" },
})

const getDashboard = authenticatedClient.createEndpoint<never, unknown, Dashboard, Dashboard>({
  method: "GET",
  path: "/dashboard",
  headers: {
    Authorization: `Bearer ${getToken()}`,
  },
  responseBodyParser: jsonResponseBody(),
  responseSetup(result) {
    if (result.status === 401) redirectToLogin()
    if (!result.ok) throw new Error(`HTTP ${result.status}`)
    return result.body
  },
})
```

---

## TypeScript Types

The package exports the following types:

```ts
import type {
  ParamsMap,
  HttpMethod,
  HttpClientParams,
  HttpRequestParams,
  HttpResponseParams,
  HttpEndpointParams,
  HttpClient,
  HttpEndpoint,
  Action,
  RequestFn,
  RequestBodyParser,
  ResponseBodyParser,
} from "@jsxrx/api"
```
