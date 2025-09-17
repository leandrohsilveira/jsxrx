import type { Observable } from "rxjs"
import type { VDOMType } from "./constants/vdom.js"

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
  pipe?(props: Input<P>): D;
  render(data: Data<D>): IRenderRaw | null
}

export type PropsFromInput<Props extends Obj, Events extends Obj> = Props &
{ [K in keyof Events]: (payload: Events[K]) => void }

export interface Component<P extends Obj> {
  (props: Observable<Props<P>>): Observable<IRenderNode | null>
}

interface RenderBase {
  id: string
}

export interface ElementPlacement<T = unknown, E = unknown> {
  parent: E
  previous?(): T | E | null
  next?(): T | E | null
}

export type IRenderRaw = IRenderNode | string | number | boolean
export type IRenderNode = IRenderElementNode | IRenderTextNode | IRenderComponentNode

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface IRenderElementNode<P extends Obj = any> extends RenderBase {
  type: typeof VDOMType['ELEMENT']
  tag: string
  props: P
  children: Record<string, IRenderNode>
}

export interface IRenderTextNode extends RenderBase {
  type: typeof VDOMType['TEXT']
  text: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface IRenderComponentNode<P extends Obj = any> extends RenderBase {
  type: typeof VDOMType['COMPONENT']
  component: Component<P>
  props: P
}

export interface IRenderer<TextNode = unknown, ElementNode = unknown> {
  createTextNode(text: string): TextNode
  createElement(tag: string): ElementNode
  setText(text: string, node: TextNode): void
  setProperty(element: ElementNode, name: string, value: unknown): void
  listen(element: ElementNode, name: string, listener: () => void): () => void
  determinePropsAndEvents(names: string[]): { props: string[], events: string[] }
  place(node: TextNode | ElementNode, placement: ElementPlacement<TextNode, ElementNode>): void
  remove(node: TextNode | ElementNode, target: ElementNode): void
}

export type IRenderNodeMap = {
  [VDOMType.TEXT]: IRenderTextNode
  [VDOMType.ELEMENT]: IRenderElementNode
  [VDOMType.COMPONENT]: IRenderComponentNode
}
