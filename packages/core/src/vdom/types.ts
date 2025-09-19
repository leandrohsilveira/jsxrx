import { Subscription } from "rxjs"
import { ElementPlacement, IRenderNode } from "../jsx"

export type Notify<T, E> = (vdom: IVDOMNode<T, E>) => void

export interface IVDOMNode<T, E> {
  id: string
  name: string
  element: T | E | null
  apply(node: IRenderNode, placement: ElementPlacement): void
  subscribe(notify?: Notify<T, E>): Promise<Subscription>
}
