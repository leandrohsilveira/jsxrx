# Observable Reactivity

In JsxRx, **RxJS Observables are the engine behind all DOM updates**. Instead of a framework-controlled rendering loop, you place Observables directly in your JSX and they drive updates with surgical precision. This is the core idea: **RxJS owns the values; JsxRx owns the DOM projection of those values.**

---

## Observable-Driven Reactivity

Every piece of dynamic content in a JsxRx component flows through an Observable. When you write `{count$}` in your JSX, you're not just interpolating a value — you're establishing a live binding. Whenever `count$` emits, the corresponding DOM node updates automatically, and **only that node** is touched.

Three principles define how this works:

- **Components run once.** A component function is called when the component mounts and never again. It's an initialization function, not a render loop.
- **Observables trigger updates.** Only Observables embedded in JSX cause DOM changes when they emit. Static JSX stays static.
- **You control the granularity.** By choosing where to place Observables in your tree, you decide exactly which DOM nodes update and when. There are no dependency arrays, no `useMemo`, and no implicit re-renders.

### How JsxRx Compares

| Framework | Reactivity Source | Component Execution Model |
|---|---|---|
| React | State setter (`useState`) | Re-runs component function on state change |
| Solid | Signals (compiler) | Component runs once; effects re-run |
| Vue | `ref()` / `reactive()` | Re-runs render function on dependency change |
| **JsxRx** | **RxJS Observables** | **Component runs once; Observables update the DOM** |

Where React re-runs your entire component to discover what changed, and Solid/Vue use a compiler or proxy system to track dependencies, JsxRx lets you place Observables exactly where updates should happen. The framework doesn't decide what re-renders — you do.

---

## Components Never Re-render

This is the most important mental model shift when working with JsxRx. A component function is **not a render function** — it's an **initialization function** that sets up observable pipelines and returns a JSX tree. The function runs exactly once when the component mounts.

Here's a counter component that demonstrates three different update behaviors:

```jsx
import { state } from "@jsxrx/core"
import { map } from "rxjs"

function Counter() {
  const count$ = state(0)

  function increase() {
    count$.set(count$.value + 1)
  }

  function decrease() {
    count$.set(count$.value - 1)
  }

  return (
    <>
      <p>The count is: {count$}</p>
      {count$.pipe(
        map(count => {
          if (count % 2 === 0) return <p>The count is even</p>
          return <p>The count is odd</p>
        }),
      )}
      <p>This text never changes</p>
    </>
  )
}
```

When `count$` emits a new value, three different things happen — and only where Observables are involved:

1. **`<p>The count is: {count$}</p>`** — The `{count$}` expression embeds an Observable directly. Each time `count$` emits, that text node updates in the DOM. **Only that text node is touched.**

2. **`{count$.pipe(map(...))}`** — A derived Observable maps each count value to a JSX element. When `count$` emits, this derived Observable emits a new `<p>` element, and JsxRx patches the DOM if the element changed (e.g., from "even" to "odd"). **Only this subtree is touched.**

3. **`<p>This text never changes</p>`** — This is plain, static JSX with no embedded Observables. It's created once at mount time and **never updated again** for the lifetime of the component. The framework ignores it during updates because no Observable above it triggers a re-evaluation.

### What Happens When Props Change

When a parent component passes new props, the component function is **not called again**. Instead, new prop values are pushed into the component's props Observable. Any JSX subtree that depends on those props — through `map`, `combineLatest`, or direct embedding — updates automatically. The component function itself stays idle.

The only exception is when the component's **identity** changes (e.g., `<OldComponent />` is replaced by `<NewComponent />`). In that case, the old component unmounts and the new one mounts fresh.

---

## Observable Patterns in JSX

JsxRx supports several patterns for embedding Observables in JSX. Each creates a reactive boundary — only the subtree rooted at the Observable updates when it emits.

### 1. Direct Embedding (Text Binding)

```jsx
<p>The count is: {count$}</p>
```

The Observable emits primitive values (string, number, boolean, bigint). Each emission updates the text content of the parent element. **This is the most efficient pattern** — it touches a single text node and nothing else.

### 2. Conditional Rendering

Use `map` with a ternary to conditionally render content:

```jsx
{show$.pipe(
  map(show => show ? <VisibleContent /> : null)
)}
```

When `show$` emits `true`, the Observable emits `<VisibleContent />` and the component mounts. When `show$` becomes `false`, it emits `null`, causing the previous content to unmount.

To toggle between two views:

```jsx
{condition$.pipe(
  map(ok => ok ? <SuccessView /> : <ErrorView />)
)}
```

When the condition changes, JsxRx reconciles the subtree. If the emitted JSX tree has a different root identity than the previous one, the old tree is unmounted and the new one is mounted.

> **Important:** Do not use `filter()` to hide content. `filter()` suppresses emissions when the predicate is false, so previously rendered content stays visible in the DOM. Use `map(condition ? <Element /> : null)` instead.

### 3. List Rendering

JsxRx provides two approaches for rendering lists from observables, depending on your performance and reactivity needs.

**Simple approach** — use when items are static or the list is small:

```jsx
{items$.pipe(
  map(items => items.map(item => <Item key={item.id} data={item} />))
)}
```

The Observable emits an array, and `map` produces an array of JSX elements. Each child is reconciled by its `key` prop. However, every emission re-maps the entire array, recreating all JSX elements even if only one item changed.

**Optimized approach** — use `each()` for dynamic lists where items change independently:

```jsx
import { each } from "@jsxrx/core"
import { map } from "rxjs"

{items$.pipe(
  each(
    (item$, index$) => (
      <ListItem>
        <span>{item$.pipe(map(item => item.name))}</span>
      </ListItem>
    ),
    {
      trackBy: item => item.id,
      distinct: shallowComparator,
      whenEmpty: <p className="empty">No items</p>,
    },
  ),
)}
```

`each()` transforms the source `Observable<T[]>` into an `Observable<Observable<R>[]>`. For each item, the `mapper` receives an `Observable<T>` (not a plain value) and an `Observable<number>` of its index. Items are identified by `trackBy`:

- **Existing keys** — the item observable pushes the new value; the component updates surgically without re-mapping.
- **New keys** — the mapper is called, creating a new component instance.
- **Removed keys** — the previous output is unmounted and cleaned up.
- **Empty arrays** — the `whenEmpty` value is rendered instead.

This per-item reactive model prevents unnecessary work: a single item change no longer re-maps the entire list. Combine with `distinct` (using `shallowComparator` from `@jsxrx/utils`) to skip updates when the item reference hasn't changed.

For optimal performance with large lists, always provide a stable, unique `trackBy` key.

### 4. Derived Values

```jsx
<p>Double: {count$.pipe(map(c => c * 2))}</p>
<p>Formatted: {date$.pipe(map(d => d.toLocaleDateString()))}</p>
```

Any RxJS operator can derive values from an Observable. The derived Observable emits transformed values, which are rendered as text. This keeps transformation logic in the Observable pipeline rather than in the component body.

### 5. Combining Multiple Observables

```jsx
import { combineLatest } from "rxjs"

{combineLatest([firstName$, lastName$]).pipe(
  map(([first, last]) => <p>Hello, {first} {last}!</p>
))}
```

Use RxJS's `combineLatest` (or JsxRx's `combine()` utility) to merge multiple Observables. The result emits whenever any source Observable emits, triggering an update of the combined subtree.

### 6. Dynamic Component Rendering

```jsx
{componentType$.pipe(
  map(Component => <Component propA={valueA$} propB={valueB$} />
))}
```

The Observable emits a component function. Each emission creates a new component instance. If the component function changes, the old component is unmounted and the new one is mounted with fresh state. Props can themselves be Observables, creating nested reactivity.

### 7. Observables as Element Props

```jsx
<div className={class$} style={style$}>
  {content$}
</div>
```

Observables can be passed directly as element props. The element subscribes to each observable prop and updates the DOM attribute whenever the Observable emits.

---

## Key Takeaway

JsxRx gives you **precise control over what updates and when**. You decide the granularity of reactivity by choosing where to place Observables in your JSX tree:

- Embed `{count$}` for text that should update → only that text node updates
- Embed `{count$.pipe(map(c => <ComplexTree />))}` for subtrees that should re-render → only that subtree reconciles
- Leave static content as plain JSX → it never updates

There are no magic re-renders, no dependency arrays to maintain, no `useMemo` or `useCallback` wrappers to prevent unnecessary work. The mental model is straightforward: **Observables produce values; JSX projects those values into the DOM. When an Observable emits, the DOM updates at exactly that projection point.**

This model is particularly powerful for applications with complex, independent data streams — real-time dashboards, collaborative editors, financial tickers, monitoring systems — where different parts of the UI update at different frequencies and from different sources. In JsxRx, each data stream maps cleanly to its own Observable, and each Observable drives its own DOM subtree, without interference.

---

**Next**: [Properties Intake](./04-props.md)
