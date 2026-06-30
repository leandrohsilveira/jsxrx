## API Client

The `@jsxrx/api` package provides a typed HTTP client built on RxJS observables. Endpoints are defined once with request/response transformations and four type parameters, then used in **two modes**: reactive queries via `fetch()` that re-fetch when a trigger observable emits, and imperative mutations via `action()` that track loading, value, and error state through their lifecycle.

```bash
npm install @jsxrx/api
```

---

### `createHttpClient()`

Creates an HTTP client bound to a base URL with default headers shared by all endpoints:

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
| `defaultHeaders` | `Record<string, unknown>` | Headers applied to every request (default `{}`) |

Returns an `HttpClient` object with a single method: `createEndpoint()`.

---

### `client.createEndpoint()`

Declares a typed endpoint with request/response transformation pipelines.

**Full type signature:**

```ts
client.createEndpoint<Input, Req, Res, Output>({
  method: string,
  path: string,
  requestSetup?: (input: Input) => HttpRequestParams,
  responseSetup?: (result: HttpResponseParams<Res>) => Output,
  requestBodyParser?: RequestBodyParser<Req>,
  responseBodyParser?: ResponseBodyParser<Res>,
  params?: ParamsMap,
  search?: ParamsMap,
  headers?: ParamsMap,
  body?: unknown,
}): HttpEndpoint<Input, Output>
```

**The four generic parameters:**

| Parameter | Purpose | Example |
|---|---|---|
| `Input` | What the caller passes to `send()`, `fetch()`, or `action.perform()` | `{ id: string }` |
| `Req` | Type of the request body consumed by `requestBodyParser` | `CreateUserPayload` |
| `Res` | Raw response body type produced by `responseBodyParser` | `User` |
| `Output` | What the caller receives from `fetch()`, `action()`, or `send()` | `User` |

When `Input` is `void`, `send()` takes no arguments. When `Output` is `void`, `send()` returns `Promise<void>`.

**Example with all options:**

```tsx
const endpoint = client.createEndpoint<Input, Req, Res, Output>({
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

**Return value — `HttpEndpoint<Input, Output>`:**

```ts
interface HttpEndpoint<I, O> {
  send(input: I): Promise<O>
  fetch(input$: Observable<I>): Observable<O>        // ActivityAwareObservable (has .pending$)
  action(): Action<I, O>
}
```

---

### Path Parameters

URL paths use `{name}` tokens that are resolved from the merged `params`:

```text
path: "/api/users/{userId}/posts/{postId}"
params: { userId: "42", postId: "7" }
→ "/api/users/42/posts/7"
```

Values come from three sources, merged with later sources overriding earlier ones:

1. Static `params` in the endpoint definition
2. `params` returned by `requestBodyParser`
3. `params` returned by `requestSetup`

The same precedence applies to `search` (query string) and `headers`.

---

### Body Parsers

Import all parsers from `@jsxrx/api`:

```tsx
import { jsonRequestBody, jsonResponseBody, noResponseBody } from "@jsxrx/api"
```

| Parser | Purpose | Behavior |
|---|---|---|
| `jsonRequestBody()` | Sending JSON body | `JSON.stringify`s the body; sets `Content-Type: application/json` |
| `jsonResponseBody()` | Receiving JSON response | Parses body as JSON; validates `Content-Type`; sets `Accept: application/json` |
| `noResponseBody()` | No body expected (e.g., 204) | Returns `body: null`; no `Accept` header |

Both `jsonRequestBody()` and `jsonResponseBody()` accept an optional `contentType` argument (default `"application/json"`).

---

### Two Modes: `fetch()` vs `action()`

#### `endpoint.fetch(input$)` — Reactive Queries

Pass an observable trigger. When it emits, a request fires. If a new emission arrives while a request is in flight, the previous request is **automatically cancelled**. Returns an `ActivityAwareObservable<Output>` — a regular `Observable` extended with a `.pending$` property that tracks loading state.

```tsx
import { state } from "@jsxrx/core"

const page$ = state(1)
const users$ = listUsersEndpoint.fetch(page$)

// Access the loading observable
users$.pending$                     // Observable<boolean>

// Pipe operators — pending$ is preserved after transformations
const activeUsers$ = users$.pipe(
  map(users => users.filter(u => u.active))
)
activeUsers$.pending$               // ✅ still works
```

When placed in JSX, `fetch()` results **auto-suspend** the nearest `<Suspense>` boundary while loading.

#### `endpoint.action()` — Imperative Mutations

Returns an `Action<Input, Output>` object that tracks state through its lifecycle:

```tsx
const action = endpoint.action()

// Perform the mutation
await action.perform(input)

// Subscribe to state streams
action.pending$   // Observable<boolean> — true while request is in flight
action.value$     // Observable<Output> — emits on success
action.error$     // Observable<Error> — emits on failure
action.state$     // Observable<PendingState<Output>> — full state machine

// Reset back to idle
action.reset()
```

The `PendingState<Output>` union:

```ts
type PendingState<T> =
  | { state: "idle" | "pending"; value: null; error: null }
  | { state: "success"; value: T; error: null }
  | { state: "error"; value: null; error: unknown }
```

Lifecycle: **idle** → `perform()` → **pending** → **success** or **error** → `reset()` → **idle**.

---

#### Comparison: `fetch()` vs `action()`

| Feature | `endpoint.fetch(input$)` | `endpoint.action()` |
|---|---|---|
| Return type | `ActivityAwareObservable<Output>` (has `.pending$`) | `Action<Input, Output>` (extends `AsyncState`) |
| Use case | Data queries, reactive streams | Mutations, form submissions |
| Re-triggers | Yes — when `input$` emits | One-shot via `.perform()` |
| Loading state | `.pending$` on the returned observable | `action.pending$` |
| Request cancellation | Automatic when new input arrives | No cancellation |
| Auto-suspends in JSX | Yes | No |
| State reset | Unsubscribe / resubscribe | `action.reset()` |

---

### `endpoint.send(input)` — One-Off Imperative Call

Every endpoint also exposes `send(input)`, which fires a single request and returns a `Promise<Output>`. Use it for one-off calls inside event handlers or imperative contexts:

```tsx
const user = await getUserEndpoint.send({ id: "42" })
```

The signature adapts to the generic parameters — when `Input` is `void`, `send()` takes no arguments; when `Output` is `void`, it returns `Promise<void>`.

---

### Practical Examples

#### GET with Path Parameters

```tsx
import { createHttpClient, jsonResponseBody } from "@jsxrx/api"
import { state } from "@jsxrx/core"

const client = createHttpClient({ baseUrl: "/api" })

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

// Reactive — auto-fetches when userId$ changes
const userId$ = state({ id: "42" })
const user$ = getUser.fetch(userId$)
```

#### POST with JSON Body (Action)

```tsx
import { createHttpClient, jsonRequestBody, jsonResponseBody } from "@jsxrx/api"

const createPost = client.createEndpoint<CreatePostInput, unknown, Post, Post>({
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

#### DELETE with No Response Body

```tsx
import { createHttpClient, noResponseBody } from "@jsxrx/api"

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

#### Reactive Search with Query Parameters

```tsx
import { createHttpClient, jsonResponseBody } from "@jsxrx/api"
import { state } from "@jsxrx/core"

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

// fetch() debounces (1ms) and deduplicates rapid emissions automatically
const results$ = searchUsers.fetch(search$)

// Track loading state for the spinner
results$.pending$.subscribe(loading => {
  toggleSpinner(loading)
})
```

---

### Error Handling

#### With `action()` — Subscribe to `error$`

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

#### With `fetch()` — Throw in `responseSetup` + RxJS `catchError`

Since `fetch()` cancels the previous request on each new emission, the cleanest approach is to handle errors inside `responseSetup` and catch downstream:

```tsx
import { catchError, of } from "rxjs"

const getUser = client.createEndpoint<{ id: string }, unknown, User, User>({
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

// Errors surface in the observable stream — catch with RxJS operators
const user$ = getUser.fetch(userId$).pipe(
  catchError(err => {
    console.error("User fetch failed", err)
    return of(null)   // fallback value
  })
)
```
