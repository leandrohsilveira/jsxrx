# HTTP API Client

JsxRx provides `@jsxrx/api`, a typed HTTP client built on RxJS observables.
Endpoints are defined once with request/response transformations and type
parameters, then used in two modes: **reactive queries** via `fetch()` that
re-fetch whenever a trigger observable emits, and **imperative mutations** via
`action()` that track loading, value, and error state through their lifecycle.

---

## Installation

```bash
npm i @jsxrx/api
```

The package depends on `rxjs` and `@jsxrx/core`, which are already required by
any JsxRx project.

---

## Creating an HTTP Client

A client binds to a base URL and holds default headers shared by all endpoints:

```tsx
import { createHttpClient } from "@jsxrx/api"

const client = createHttpClient({
  baseUrl: "/api",
  defaultHeaders: { "Content-Type": "application/json" },
})
```

| Property | Type | Description |
|---|---|---|
| `baseUrl` | `string` | Prepended to every endpoint path |
| `defaultHeaders` | `Record<string, unknown>` | Headers applied to every request |

---

## Defining Endpoints

Use `client.createEndpoint()` to declare a typed endpoint. Every endpoint
specifies the HTTP method, the URL path (with optional `{param}` placeholders),
and a pipeline that transforms user input into a request, then transforms the
parsed response into the final output.

```tsx
const endpoint = client.createEndpoint<
  Req,    // 1st — request body type (consumed by requestBodyParser)
  Res,    // 2nd — raw response body type (produced by responseBodyParser)
  Input,  // 3rd — what the caller passes to send/perform
  Output, // 4th — what fetch/action emit and send resolves
>({
  method: "GET",
  path: "/users/{id}",

  // Transform input into request params, search params, headers, and body
  requestSetup(input) {
    return { params: { id: input.id }, search: { page: input.page } }
  },

  // Transform the parsed response into the final output
  responseSetup(result) {
    if (!result.ok) throw new Error(`HTTP ${result.status}`)
    return result.body
  },

  // Request/response body parsers
  requestBodyParser: jsonRequestBody(),
  responseBodyParser: jsonResponseBody(),
})
```

### The Four Generic Parameters

| Parameter | Purpose | Example |
|---|---|---|
| `Req` | Type of the request body consumed by `requestBodyParser` | `CreateUserPayload` |
| `Res` | Type of the raw response body produced by `responseBodyParser` | `User` |
| `Input` | Type the caller passes to `send()`, `fetch()`, or `action.perform()` | `{ id: string }` |
| `Output` | Type the caller receives | `User` |

When `Input` is `void`, `send()` takes no arguments. When `Output` is `void`,
`send()` returns `Promise<void>`. Use `unknown` for `Req` and `Res` when there
is no body on that side of the request.

### Path Parameters

URL paths use `{name}` tokens that are resolved from the merged `params`:

```text
path: "/api/users/{userId}/posts/{postId}"
params: { userId: "42", postId: "7" }
→ "/api/users/42/posts/7"
```

Values come from three sources, merged with later sources overriding earlier
ones: static `params` in the endpoint definition, `params` from
`requestBodyParser`, and `params` from `requestSetup`. The same precedence
applies to `search` (query string) and `headers`.

### Request and Response Body Parsers

**`jsonRequestBody()`** — Stringifies the body and sets `Content-Type` to
`application/json`.

**`jsonResponseBody()`** — Reads and parses the response as JSON, protecting
against content-type mismatches.

**`noResponseBody()`** — For endpoints that return no content (e.g., `204 No
Content`). The response body is `null`.

### The `send()` Method

Every endpoint also exposes `send(input)`, which fires a single request and
returns a `Promise<Output>`. Use it for one-off calls inside event handlers or
other imperative contexts:

```tsx
const user = await getUserEndpoint.send({ id: "42" })
```

---

## Two Modes: `fetch()` vs `action()`

| Feature | `endpoint.fetch()` | `endpoint.action()` |
|---|---|---|
| Return type | `ActivityAwareObservable<Output>` (has `.pending$`) | `Action<Input, Output>` (extends `AsyncState`) |
| Use case | Data queries, reactive streams | Mutations, form submissions |
| Re-triggers | Yes — when `input$` emits | One-shot via `.perform()` |
| Loading state | `.pending$` on the returned observable | `action.pending$` |
| Request cancellation | Automatic when new input arrives | No cancellation |
| State reset | Unsubscribe/resubscribe | `action.reset()` |

### `endpoint.fetch(input$)` — Reactive Queries

Pass an observable trigger. When it emits, the request fires. If a new emission
arrives while a request is in flight, the previous request is automatically
cancelled. The return value is an `ActivityAwareObservable<Output>` — a regular
`Observable` extended with a `.pending$` property that tracks the loading state.

All RxJS operators piped through `.pipe()` preserve the wrapper, so `.pending$`
remains available after transformations:

```tsx
import { state } from "@jsxrx/core"

const page$ = state(1)
const users$ = listUsersEndpoint.fetch(page$)

// Access the loading observable
users$.pending$  // Observable<boolean>

// Pipe operators — pending$ is still accessible
const activeUsers$ = users$.pipe(
  map(users => users.filter(u => u.active))
)
activeUsers$.pending$  // ✅ still works
```

### `endpoint.action()` — Imperative Mutations

Returns an `Action<Input, Output>` object that tracks state through its
lifecycle:

```tsx
const action = endpoint.action()

// Perform the mutation
await action.perform(input)

// Subscribe to state streams
action.pending$  // Observable<boolean> — true while request is in flight
action.value$    // Observable<Output> — emits on success
action.error$    // Observable<Error> — emits on failure
action.state$    // Observable<PendingState<Output>> — the full state machine

// Reset back to idle
action.reset()
```

The `PendingState<Output>` union captures every phase of the action:

```ts
type PendingState<T> =
  | { state: "idle" | "pending"; value: null; error: null }
  | { state: "success"; value: T; error: null }
  | { state: "error"; value: null; error: unknown }
```

The lifecycle flows: **idle** → `perform()` → **pending** → **success** or
**error** → `reset()` → **idle**.

---

## Error Handling

### With `action()` — Subscribe to `error$`

The action exposes a dedicated `error$` stream that emits when a request fails:

```tsx
const action = endpoint.action()

const errorMessage$ = action.error$.pipe(
  map(err => err?.message ?? null)
)

// Show toast on failure
action.error$.subscribe(err => {
  showToast(`Operation failed: ${err.message}`)
})

// Show toast on success
action.value$.subscribe(result => {
  showToast("Operation completed")
})
```

### With `fetch()` — Throw in `responseSetup`

Since `fetch()` cancels the previous request on each new emission, the cleanest
approach is to handle errors inside `responseSetup`:

```tsx
const getUser = client.createEndpoint<unknown, User, { id: string }, User>({
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

// Errors surface in the observable stream
const user$ = getUser.fetch(userId$).pipe(
  catchError(err => {
    console.error("User fetch failed", err)
    return of(null)  // fallback value
  })
)
```

---

## Practical Examples

### GET with Path Parameters

```tsx
const getUser = client.createEndpoint<unknown, User, { id: string }, User>({
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

// Reactive — auto-fetches when userId$ changes
const userId$ = state({ id: "42" })
const user$ = getUser.fetch(userId$)
```

### POST with JSON Body

```tsx
const createPost = client.createEndpoint<
  CreatePostInput,
  Post,
  CreatePostInput,
  Post
>({
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

const saveAction = createPost.action()

async function handleSubmit(data: CreatePostInput) {
  try {
    const post = await saveAction.perform(data)
    showToast("Post created")
  } catch (error) {
    showToast(`Failed: ${error.message}`)
  }
}
```

### DELETE with No Response Body

```tsx
const deleteUser = client.createEndpoint<
  unknown,
  null,
  { id: string },
  void
>({
  method: "DELETE",
  path: "/users/{id}",
  requestSetup({ id }) {
    return { params: { id } }
  },
  responseBodyParser: noResponseBody(),
  responseSetup(result) {
    if (!result.ok) throw new Error(`HTTP ${result.status}`)
    // result.body is null — no return needed
  },
})

await deleteUser.send({ id: "42" })
```

### Reactive Search with Query Parameters

```tsx
const searchUsers = client.createEndpoint<
  unknown,
  User[],
  { q: string },
  User[]
>({
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

// fetch() debounces and deduplicates rapid emissions automatically
const results$ = searchUsers.fetch(search$)

// Track loading state for the spinner
results$.pending$.subscribe(loading => {
  toggleSpinner(loading)
})
```

### Action with Error Handling and Cleanup

```tsx
const updateProfile = client.createEndpoint<
  Profile,
  Profile,
  Profile,
  Profile
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

**Next**: [Activity-Aware Suspense](./08-activity-aware-suspense.md)
