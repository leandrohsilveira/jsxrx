import { Subscription } from "rxjs"
import { ElementPlacement, IRenderElementNode, IRenderFragmentNode, IRenderNode } from "../jsx"

export type Notify<T, E> = (vdom: IVDOMNode<T, E>) => void

export interface IVDOMNode<T, E> {
  id: string
  name: string
  firstElement(): Promise<T | E | null>
  lastElement(): Promise<T | E | null>
  apply(node: IRenderNode, placement: ElementPlacement): void
  subscribe(notify?: Notify<T, E>): Promise<Subscription>
}

export interface IVDOMChildrenBase<N extends IRenderFragmentNode | IRenderElementNode, T, E> {
  createChildPlacement(vdom: Record<string, IVDOMNode<T, E>>, simblings: { previous: string | null, next: string | null }, parentPlacement: ElementPlacement<T, E>): ElementPlacement<T, E>
  handleChildren(vdom: Record<string, IVDOMNode<T, E>>, node: N, placement: ElementPlacement<T, E>): Promise<string[]>
}
