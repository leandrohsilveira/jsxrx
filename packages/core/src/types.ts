import type { Observable } from "rxjs"

export type Obj = Record<string, unknown>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Fn = (...args: any) => any

export type Data<T extends Obj> = {
  [K in keyof T]:
  T[K] extends Observable<infer V>
  ? V
  : T[K]
}

export type Props<T extends Obj> = {
  [K in keyof T]:
  T[K] extends Observable<infer V>
  ? V
  : T[K]
}

export type ExpandedProps<T extends Obj> = {
  [K in keyof T]:
  T[K] extends Observable<infer V>
  ? Observable<V>
  : Observable<T[K]>
}

export interface Input<P extends Obj> {
  props$: Observable<Props<P>>
  props: ExpandedProps<P>
}

export interface ComponentInput<P extends Obj, D extends Obj = P> {
  name?: string
  load?(props: Input<P>): D;
  render(data: Data<D>): JsxRxNode
}

export type PropsFromInput<Props extends Obj, Events extends Obj> = Props &
{ [K in keyof Events]: (payload: Events[K]) => void }

export interface Component<P extends Obj> {
  (props: Observable<Props<P>>): Observable<JsxRxNode>
}

export type JsxRxElement = {
  id: string
  type: 'element'
  tag: string
  props: Record<string, unknown>
  children: JsxRxNode[]
}

export type JsxRxText = {
  id: string
  type: 'text',
  text: string
}

export type JsxRxComponent<T extends Obj> = {
  id: string
  type: 'component',
  component: Component<T>
  props: T
}

export type JsxRxComponentFn<T extends Obj> = (props: T) => JsxRxNode

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type JsxRxTreeNode = JsxRxElement | JsxRxText | JsxRxComponent<any> | null

export type JsxRxNode = string | number | boolean | JsxRxTreeNode | null

export type JsxRxVText = { id: string, element: Text }
export type JsxRxVElement = { id: string, element: Element, children: Record<string, JsxRxVNode> }
export type JsxRxVComponent<T extends Obj> = { id: string, component: Component<T>, children: JsxRxVNode | null }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type JsxRxVNode = JsxRxVText | JsxRxVElement | JsxRxVComponent<any>
