# JsxRx Todo App Example

A complete, runnable Todo application demonstrating component composition, state
management, conditional rendering, list rendering with keys, and derived state
using JsxRx. This example builds on concepts from the
[Quickstart](../quickstart.md) — if you haven't read it, start there first.

## Overview

The Todo app allows users to:

- **Add** new todos
- **Toggle** todos as completed or incomplete
- **Delete** todos
- **Filter** by status (All, Active, Completed)
- **See** active and completed counts — derived purely from state, no extra
  variables

The architecture follows a unidirectional data flow: `App` owns the `todos$` and
`filter$` state cells, passes derived data down to child components via
observable props, and receives mutations back up through callbacks.

> **Surgical reactivity:** when a todo is toggled, only the affected DOM nodes
> (its checkbox, text style, and the counters) update. Components never
> re-execute — that's the JsxRx performance model in a nutshell.

---

## File Structure

```text
todo-app/
├── package.json          (same as the quickstart template)
├── vite.config.ts        (same as the quickstart template)
├── tsconfig.json         (same as the quickstart template)
├── index.html            (same as the quickstart template)
└── src/
    ├── main.tsx          (entry point — mounts the app)
    ├── App.tsx           (root component — owns all state)
    ├── types.ts          (shared TypeScript types)
    └── components/
        ├── AddTodo.tsx   (input form to create todos)
        ├── TodoList.tsx  (renders the filtered list)
        └── TodoItem.tsx  (renders a single todo row)
```

Copy the `package.json`, `vite.config.ts`, `tsconfig.json`, and `index.html`
from the [Quickstart](../quickstart.md) — they are identical for this project.

---

## src/main.tsx

The entry point creates a DOM renderer and mounts the root component:

```tsx
import { createRoot } from "@jsxrx/core/dom"
import { App } from "./App"

createRoot(document.querySelector("[root]")).mount(<App />)
```

---

## src/types.ts

Shared type definitions used across multiple files:

```ts
export type Todo = {
  id: string
  text: string
  completed: boolean
  createdAt: Date
}
```

---

## src/App.tsx

The root component. It **owns all state** (`todos$`, `filter$`) and passes derived
data down to child components as observable props. Mutations flow back up through
callbacks:

```tsx
import { combine, state } from "@jsxrx/core"
import { map } from "rxjs"
import { AddTodo } from "./components/AddTodo"
import { TodoList } from "./components/TodoList"
import type { Todo } from "./types"

export function App() {
  // ── State cells ────────────────────────────────────────────
  const todos$ = state<Todo[]>([])
  const filter$ = state<"all" | "active" | "completed">("all")

  // ── Mutations (called by children via callbacks) ────────────
  function addTodo(text: string) {
    const newTodo: Todo = {
      id: Date.now().toString(),
      text,
      completed: false,
      createdAt: new Date(),
    }
    todos$.set([...todos$.value, newTodo])
  }

  function toggleTodo(id: string) {
    todos$.set(
      todos$.value.map(todo =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo,
      ),
    )
  }

  function deleteTodo(id: string) {
    todos$.set(todos$.value.filter(todo => todo.id !== id))
  }

  // ── Derived state (computed via pipe, NOT extra state variables) ──
  const activeCount$ = todos$.pipe(
    map(todos => todos.filter(t => !t.completed).length),
  )

  const completedCount$ = todos$.pipe(
    map(todos => todos.filter(t => t.completed).length),
  )

  const filteredTodos$ = combine({
    todos: todos$,
    filter: filter$,
  }).pipe(
    map(({ todos, filter }) => {
      if (filter === "active") return todos.filter(t => !t.completed)
      if (filter === "completed") return todos.filter(t => t.completed)
      return todos
    }),
  )

  // ── Render ──────────────────────────────────────────────────
  return (
    <div
      style={{
        maxWidth: "500px",
        margin: "2rem auto",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1>JsxRx Todo App</h1>

      <AddTodo onAdd={addTodo} />

      <TodoList
        todos={filteredTodos$}
        onToggle={toggleTodo}
        onDelete={deleteTodo}
      />

      <div
        style={{
          display: "flex",
          gap: "1rem",
          marginTop: "1rem",
          justifyContent: "space-between",
        }}
      >
        <span>{activeCount$} items left</span>

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button onClick={() => filter$.set("all")}>All</button>
          <button onClick={() => filter$.set("active")}>Active</button>
          <button onClick={() => filter$.set("completed")}>Completed</button>
        </div>

        <span>{completedCount$} completed</span>
      </div>
    </div>
  )
}
```

**Key patterns in App.tsx:** `combine()` merges two observables so `filteredTodos$`
recomputes when either changes. Derived state is just `pipe(map(...))` — no
`useMemo`. Callbacks are plain functions, stable for the component's entire
lifecycle because `App` runs once. State updates always use **new arrays**
(immutable pattern) so internal `distinctUntilChanged` detects changes.

---

## src/components/AddTodo.tsx

Manages the input form. Receives an `onAdd` callback via props and uses the
`emitter()` pattern to invoke it safely:

```tsx
import { emitter, Props, state } from "@jsxrx/core"
import type { Observable } from "rxjs"

type AddTodoProps = {
  onAdd: (text: string) => void
}

export function AddTodo(props$: Observable<AddTodoProps>) {
  const { onAdd$ } = Props.take(props$)
  const submitEmitter = emitter(onAdd$)
  const text$ = state("")

  function handleSubmit(e: Event) {
    e.preventDefault()
    const text = text$.value.trim()
    if (text) {
      submitEmitter.emit(text)
      text$.set("")
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}
    >
      <input
        type="text"
        placeholder="What needs to be done?"
        value={text$}
        onInput={(e: InputEvent) =>
          text$.set((e.currentTarget as HTMLInputElement).value)
        }
        style={{ flex: 1, padding: "0.5rem" }}
      />
      <button type="submit">Add</button>
    </form>
  )
}
```

**Key patterns in AddTodo.tsx:** `Props.take(props$)` destructs the props stream;
`onAdd$` becomes `Observable<(text: string) => void>`. `emitter(onAdd$)`
creates a stable invoker that always calls the latest callback — no stale
closures. `text$ = state("")` is a local state cell bound to the input via
`value={text$}`. On submit, the emitter calls the parent's `addTodo`, then
clears the input.

---

## src/components/TodoList.tsx

Receives a `todos$` observable and renders a `<TodoItem>` for each todo, using
the `each()` operator for per-item reactivity:

```tsx
import { each, Props } from "@jsxrx/core"
import type { Observable } from "rxjs"
import { shallowComparator } from "@jsxrx/utils"
import { TodoItem } from "./TodoItem"
import type { Todo } from "../types"

type TodoListProps = {
  todos: Observable<Todo[]>
  onToggle: (id: string) => void
  onDelete: (id: string) => void
}

export function TodoList(props$: Observable<TodoListProps>) {
  const { todos$, onToggle$, onDelete$ } = Props.take(props$)

  return (
    <ul style={{ listStyle: "none", padding: 0 }}>
      {todos$.pipe(
        each(
          todo$ => (
            <TodoItem
              todo={todo$}
              onToggle={onToggle$}
              onDelete={onDelete$}
            />
          ),
          {
            trackBy: todo => todo.id,
            distinct: shallowComparator,
            whenEmpty: (
              <li style={{ padding: "1rem", color: "#999" }}>
                No todos yet
              </li>
            ),
          },
        ),
      )}
    </ul>
  )
}
```

**Key patterns in TodoList.tsx:** `each()` receives a mapper that gets an
`Observable<Todo>` per item via `todo$` — each item drives its own reactive
bindings. Items are tracked by `trackBy: todo => todo.id` (replacing the
inline `key` prop), so existing items update in place when the array changes.
The `distinct` option with `shallowComparator` skips updates when item
references haven't changed. `whenEmpty` renders a fallback when the list is
empty. `onToggle$` and `onDelete$` are passed through as observables (not
callbacks); the child uses `emitter()` to unwrap them.

---

## src/components/TodoItem.tsx

Renders a single todo row. Derives reactive values from the `todo` prop stream
so the checkbox and text style update when the todo is toggled:

```tsx
import { emitter, Props } from "@jsxrx/core"
import { map } from "rxjs"
import type { Observable } from "rxjs"
import type { Todo } from "../types"

type TodoItemProps = {
  todo: Todo
  onToggle: (id: string) => void
  onDelete: (id: string) => void
}

export function TodoItem(props$: Observable<TodoItemProps>) {
  const { todo$, onToggle$, onDelete$ } = Props.take(props$)
  const toggleEmitter = emitter(onToggle$)
  const deleteEmitter = emitter(onDelete$)

  // Derive reactive values from the todo prop stream
  const text$ = todo$.pipe(map(todo => todo.text))
  const completed$ = todo$.pipe(map(todo => todo.completed))
  const spanStyle$ = todo$.pipe(
    map(todo => ({
      flex: 1,
      textDecoration: todo.completed ? "line-through" : "none",
      color: todo.completed ? "#999" : "inherit",
    })),
  )

  function handleToggle() {
    toggleEmitter.emit(todo$.value.id)
  }

  function handleDelete() {
    deleteEmitter.emit(todo$.value.id)
  }

  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        padding: "0.5rem",
        borderBottom: "1px solid #eee",
      }}
    >
      <input
        type="checkbox"
        checked={completed$}
        onChange={handleToggle}
      />
      <span style={spanStyle$}>{text$}</span>
      <button
        onClick={handleDelete}
        style={{
          color: "red",
          border: "none",
          background: "none",
          cursor: "pointer",
        }}
      >
        ✕
      </button>
    </li>
  )
}
```

**Key patterns in TodoItem.tsx:** Reactive derivations (`text$`, `completed$`,
`spanStyle$`) are computed from `todo$` via `pipe(map(...))`. When props change,
these observables emit and the DOM updates surgically. `todo$.value.id` is read
at interaction time in `handleToggle`/`handleDelete`, so it always reflects the
latest value. The `<li>` style is static; the `<span>` style is a reactive
observable that toggles strikethrough and color.

---

## Concepts Demonstrated

1.  **Component decomposition** — `App` → `AddTodo` → `TodoList` → `TodoItem`.
    Each component manages its own concerns. `App` owns the state; leaf
    components are purely presentational.

2.  **State flow** — `todos$` and `filter$` are managed in `App` and passed down
    as observable props. Mutations flow **up** via callbacks (`onAdd`,
    `onToggle`, `onDelete`). This is a unidirectional data flow.

3.  **Derived state** — `activeCount$`, `completedCount$`, and `filteredTodos$`
    are computed purely via `pipe(map(...))`. No extra state variables, no
    manual synchronization.

4.  **Keys in lists** — The `each()` operator with `trackBy: todo => todo.id`
    replaces the inline `key` prop. Items are tracked by their `trackBy` key
    across array emissions — existing components update in place, only new items
    trigger the mapper.

5.  **Immutable updates** — `todos$.set([...todos$.value, newTodo])` always
    creates a new array. This ensures `distinctUntilChanged` (used internally by
    `Props.take()`) detects changes correctly.

6.  **Filter implementation** — Uses `combine({ todos: todos$, filter: filter$ })`
    to react to both state changes simultaneously. When either `todos$` or
    `filter$` emits, the filtered list recomputes.

7.  **`emitter()` for callbacks** — Decouples event emission from callback
    identity. The emitter always invokes the latest function emitted by the
    observable. No stale closures, no `useCallback`.

8.  **Surgical DOM updates** — When a single todo is toggled, only its checkbox,
    text styling, and the two count labels update. The rest of the DOM is
    untouched. Components never re-execute.

---

## Running the App

```bash
cd todo-app
npm install
npm run dev
```

Open the URL shown in the terminal (usually `http://localhost:5173`).

---

## What's Next

Enhance the app with these extensions to explore more JsxRx patterns:

- **localStorage persistence** — Subscribe to `todos$` and write to
  `localStorage` on each emission. Restore from `localStorage` when the app
  mounts. Use the `Lifecycle` parameter's `subscription` for automatic cleanup.

- **Edit mode** — Add a double-click handler on `TodoItem` that sets an
  `editing$` local state cell. Conditionally render an input (using
  `pipe(map(...))` with `switchMap`) instead of the text span.

- **Drag-and-drop reordering** — Integrate a drag-and-drop library by
  subscribing to `todos$` in a `Lifecycle` subscription and calling
  `todos$.set()` when items are reordered.

- **Routing to detail pages** — Install `@jsxrx/router` and add a `/todos/:id`
  route that displays a single todo's details. Use `combine()` with the route
  params and `todos$` to derive the selected todo.

- **Async API calls** — Replace the local `todos$` state with
  `toActivityAware()` wrapping HTTP requests. Use `pending()` to show loading
  spinners, and `<Suspense>` boundaries for graceful fallback UI.
