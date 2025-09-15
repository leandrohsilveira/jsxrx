import { BehaviorSubject, combineLatest, distinctUntilChanged, map, of, switchMap, tap } from "rxjs"
import { toTreeNode } from "./elements"
import { shallowEqual } from "./util/object"

/**
 * @param {import("./types").JsxRxNode} node
 * @param {Element} target 
 */
export function render(node, target) {
  if (node === null) return of(null)
  return renderNode(toTreeNode(node, 0), { parent: target })
    .pipe(tap(vdom => console.log('vdom', vdom)))
}

/**
 * @param {import("./types").JsxRxTreeNode} node
 * @param {{ parent: Element, after?: Element, before?: Element }} target
 * @returns {import("rxjs").Observable<null | import("./types").JsxRxVNode>}
 */
function renderNode(node, { parent, before, after }) {
  if (node === null) return of(null)
  switch (node.type) {
    case 'element':
      return renderElementNode(node, { parent, before, after })
    case 'text':
      return renderTextNode(node, { parent, before, after })
    case "component":
      return renderComponentNode(node, { parent, before, after })
  }
}

/**
 * @param {import("./types").JsxRxText} node
 * @param {{ parent: Element, after?: Element, before?: Element }} target
 * @returns {import("rxjs").Observable<import("./types").JsxRxVText>}
 */
function renderTextNode(node, { parent, before, after }) {
  const text$ = new BehaviorSubject(node.text)

  return text$.pipe(
    map(text => document.createTextNode(text)),
    tap(element => {
      if (before) before.before(element)
      else if (after) after.after(element)
      else parent.append(element)
    }),
    map(element => ({
      id: node.id,
      element,
    }))
  )
}

/**
 * @param {import("./types").JsxRxElement} node
 * @param {{ parent: Element, after?: Element, before?: Element }} target
 * @returns {import("rxjs").Observable<import("./types").JsxRxVElement>}
 */
function renderElementNode(node, { parent, before, after }) {

  const props$ = new BehaviorSubject(node.props)

  return props$.pipe(
    distinctUntilChanged(shallowEqual),
    map(props => {
      const element = document.createElement(node.tag)
      setProps(element, props)
      return element
    }),
    tap(element => {
      if (before) before.before(element)
      else if (after) after.after(element)
      else parent.append(element)
    }),
    switchMap(parent =>
      combineLatest({
        element: of(parent),
        children: combineLatest(node.children.map((child, index) => renderNode(toTreeNode(child, index), { parent })))
      })
    ),
    map(({ element, children }) => {
      /** @type {*} */
      const childrenMap = {}

      for (const vnode of children) {
        if (vnode) childrenMap[vnode.id] = vnode
      }

      return { element, children: childrenMap }
    }),
    map(({ element, children }) => ({
      id: node.id,
      element,
      children
    }))
  )
}

/**
 * @param {import("./types").JsxRxComponent<*>} node
 * @param {{ parent: Element, after?: Element, before?: Element }} target
 * @returns {import("rxjs").Observable<import("./types").JsxRxVComponent<*>>}
 */
function renderComponentNode(node, { parent, before, after }) {

  const props$ = new BehaviorSubject(node.props)

  const node$ = node.component(props$.asObservable())

  return node$.pipe(
    switchMap(children => renderNode(toTreeNode(children, 0), { parent, before, after })),
    map(children => ({
      id: node.id,
      component: node.component,
      children
    }))
  )
}

/**
 * @param {Element} element 
 * @param {Record<string, unknown>} props 
 */
function setProps(element, props) {
  for (const [name, value] of Object.entries(props)) {
    switch (name) {
      case 'class':
        return element.className = String(value)
      default:
        return element.setAttribute(name, String(value))
    }
  }
}
