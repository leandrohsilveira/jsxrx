import { Observable, Subscription } from "rxjs"
import { ElementNode, ElementPosition, IRenderComponentNode } from "../jsx"
import { IVRenderEventType } from "../constants/types"

export interface VNode<T, E, N extends ElementNode = ElementNode> {
  key: string | number | null
  firstElement: T | E | null
  lastElement: T | E | null
  mount(): Subscription
  update(next: N): void
  placeIn(position: ElementPosition<T, E>): void
  remove(): void
}

export interface VNodeWithChildren<T, E, N extends ElementNode = ElementNode>
  extends VNode<T, E, N> {
  children: VChildren<T, E> | null
}

export interface VChildren<T, E> extends VNode<T, E> {
  nodes: Record<string, VNode<T, E>>
}

export interface VNodeObservable<T, E>
  extends VNode<T, E, Observable<ElementNode>> {
  latest: VNode<T, E> | null
}

export interface VNodeComponent<T, E>
  extends VNode<T, E, IRenderComponentNode> {
  content: VNode<T, E> | null
}

export interface VRoot {
  mount(element: ElementNode): Subscription
}

export interface VRenderEvent<T, E> {
  event: IVRenderEventType
  payload: T | E
  position: ElementPosition<T, E>
}
