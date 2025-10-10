/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Observable, Subscription } from "rxjs"
import type { VDOMType } from "./constants/vdom.js"

export interface Obj {}

export type Fn = (...args: any) => any

export interface IState<T> extends Observable<T> {
  value: T
  set(value: T): void
}

export interface Ref<T> extends IState<T | null> {
  kind: "ref"
}

export interface IDeferred<T> {
  kind: "stream"
  value$: Observable<T>
}

export interface IContext<T> {
  initialValue: T
  create(): BehaviorSubject<T>
}

type Fn = (...args: any) => any

type AsyncFn<F extends Fn> = (
  ...args: Parameters<F>
) => ReturnType<F> extends Promise<infer V>
  ? Promise<V>
  : Promise<ReturnType<F>>

export interface Emitter<T extends Fn> {
  emit: AsyncFn<T>
}

export interface OptionalEmitter<T extends Fn> {
  emit: AsyncFn<
    (
      ...args: Parameters<T>
    ) => ReturnType<T> extends Promise<infer V>
      ? V | undefined
      : ReturnType<T> | undefined
  >
}

export interface AsyncState<T, E = unknown> {
  kind: "async"
  state$: Observable<PendingState<T>>
  value$: Observable<T>
  error$: Observable<E>
}

export type PendingState<T> =
  | { state: "idle" | "pending"; value: null; error: null }
  | { state: "success"; value: T; error: null }
  | { state: "error"; value: null; error: unknown }

export type SuspensionController = {
  suspend(): void
  resume(): void
  downstream(): SuspensionController
  complete(): void
}

export type SuspensionContext = {
  suspended$: Observable<boolean>
  downstream(): SuspensionController
  complete(): void
}

export interface IContextMap {
  set<T>(context: IContext<T>, value$: Observable<T>): void
  require<T extends IContext<any>>(context: T): Observable<T["initialValue"]>
  optional(context: Context<T>): Observable<T>
}

export type CombineOutput<T> = {
  [K in keyof T]: T[K] extends IDeferred<infer V>
    ? Observable<V>
    : T[K] extends Observable<infer V>
      ? V
      : T[K]
}

export type Properties<T> = {
  [K in keyof T]: T[K] extends Ref<infer V> ? Ref<V> : T[K] | Observable<T[K]>
}

export type InputTake<P> = {
  [K in keyof P]-?: P[K] extends Observable<infer V>
    ? Observable<V>
    : Observable<P[K]>
}

export type PropsWithChildren<T = {}> = T & {
  children?: ElementNode
}

export type PropsWithKey<T = {}> = T & {
  key?: JsxRx.Key | null
}

export type PropsWithKeyAndChildren<T = {}> = PropsWithChildren<T> &
  PropsWithKey<T>

export interface ComponentInstance {
  context: IContextMap
  suspension: SuspensionController
}

export interface Component<P> {
  (props: Observable<P>): ElementNode
  displayName?: string
}

export interface ElementPosition<T = unknown, E = unknown> {
  parent: E
  previous?: ElementPosition<T, E>
  lastElement?: T | E
}

interface RenderBase {
  id: string
  key: number | string | undefined
  compareTo(node: IRenderNode)
}

export type IRenderNode =
  | IRenderElementNode
  | IRenderComponentNode
  | IRenderFragmentNode
  | IRenderSuspenseNode

export interface IRenderElementNode extends RenderBase {
  type: (typeof VDOMType)["ELEMENT"]
  tag: string
  props: Record<string, any>
  children: ElementNode
}

export interface IRenderComponentNode extends RenderBase {
  type: (typeof VDOMType)["COMPONENT"]
  component: Component<any>
  props: Record<string, any>
  name: string
}

export interface IRenderFragmentNode extends RenderBase {
  type: (typeof VDOMType)["FRAGMENT"]
  children: ElementNode
}

export interface IRenderSuspenseNode extends RenderBase {
  type: (typeof VDOMType)["SUSPENSE"]
  fallback: ElementNode
  children: ElementNode
}

export type IRenderText = string | number | bigint | boolean

export interface IRenderer<TextNode = unknown, ElementNode = unknown> {
  createTextNode(text: string): TextNode
  createElement(tag: string): ElementNode
  setText(text: string, node: TextNode): void
  setProperty(element: ElementNode, name: string, value: unknown): void
  listen(element: ElementNode, name: string, listener: () => void): () => void
  determinePropsAndEvents(names: string[]): {
    props: string[]
    events: string[]
  }
  place(
    node: TextNode | ElementNode,
    position: ElementPosition<TextNode, ElementNode>,
  ): void
  move(
    node: TextNode | ElementNode,
    position: ElementPosition<TextNode, ElementNode>,
  )
  remove(node: TextNode | ElementNode, target: ElementNode): void
  getParent(node: TextNode | ElementNode): ElementNode | null
  subscribe(): Subscription
}

export type ElementNode =
  | Observable<ElementNode>
  | IRenderNode
  | IRenderText
  | ElementNode[]
  | null
  | undefined

/**
 * Used to represent DOM API's where users can either pass
 * true or false as a boolean or as its equivalent strings.
 */
type Booleanish = boolean | "true" | "false"

/**
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/crossorigin MDN}
 */
type CrossOrigin = "anonymous" | "use-credentials" | "" | undefined

export = JsxRx
export as namespace JsxRx

declare namespace JsxRx {
  //
  // React Elements
  // ----------------------------------------------------------------------

  /**
   * Used to retrieve the possible components which accept a given set of props.
   *
   * Can be passed no type parameters to get a union of all possible components
   * and tags.
   *
   * Is a superset of {@link ComponentType}.
   *
   * @template P The props to match against. If not passed, defaults to any.
   * @template Tag An optional tag to match against. If not passed, attempts to match against all possible tags.
   *
   * @example
   *
   * ```tsx
   * // All components and tags (img, embed etc.)
   * // which accept `src`
   * type SrcComponents = ElementType<{ src: any }>;
   * ```
   *
   * @example
   *
   * ```tsx
   * // All components
   * type AllComponents = ElementType;
   * ```
   *
   * @example
   *
   * ```tsx
   * // All custom components which match `src`, and tags which
   * // match `src`, narrowed down to just `audio` and `embed`
   * type SrcComponents = ElementType<{ src: any }, 'audio' | 'embed'>;
   * ```
   */
  type ElementType<
    P = any,
    Tag extends keyof JSX.IntrinsicElements = keyof JSX.IntrinsicElements,
  > =
    | { [K in Tag]: P extends JSX.IntrinsicElements[K] ? K : never }[Tag]
    | ComponentType<P>

  /**
   * Represents any user-defined component, either as a function or a class.
   *
   * Similar to {@link JSXElementConstructor}, but with extra properties like
   * {@link FunctionComponent.defaultProps defaultProps }.
   *
   * @template P The props the component accepts.
   *
   * @see {@link ComponentClass}
   * @see {@link FunctionComponent}
   */
  type ComponentType<P = any> = Component<P>

  /**
   * A value which uniquely identifies a node among items in an array.
   *
   * @see {@link https://react.dev/learn/rendering-lists#keeping-list-items-in-order-with-key React Docs}
   */
  type Key = string | number | bigint

  /**
   * @internal The props any component can receive.
   * You don't have to add this type. All components automatically accept these props.
   * ```tsx
   * const Component = () => <div />;
   * <Component key="one" />
   * ```
   *
   * WARNING: The implementation of a component will never have access to these attributes.
   * The following example would be incorrect usage because {@link Component} would never have access to `key`:
   * ```tsx
   * const Component = (props: React.Attributes) => props.key;
   * ```
   */
  interface Attributes {
    key?: Key | null | undefined
  }

  interface RefAttributes<T> extends Attributes {
    /**
     * Allows getting a ref to the component instance.
     * Once the component unmounts, React will set `ref.current` to `null`
     * (or call the ref with `null` if you passed a callback ref).
     *
     * @see {@link https://react.dev/learn/referencing-values-with-refs#refs-and-the-dom React Docs}
     */
    ref?: Ref<T> | undefined
  }

  /**
   * Represents the built-in attributes available to class components.
   */
  interface ClassAttributes<T> extends RefAttributes<T> {}

  // ReactSVG for ReactSVGElement
  interface ReactSVGElement
    extends DOMElement<SVGAttributes<SVGElement>, SVGElement> {
    type: SVGElementType
  }

  interface ReactPortal extends ReactElement {
    children: ElementNode
  }

  type JsxRxNode = ElementNode

  //
  // Event System
  // ----------------------------------------------------------------------
  // TODO: change any to unknown when moving to TS v3
  interface BaseSyntheticEvent<E = object, C = any, T = any> {
    nativeEvent: E
    currentTarget: C
    target: T
    bubbles: boolean
    cancelable: boolean
    defaultPrevented: boolean
    eventPhase: number
    isTrusted: boolean
    preventDefault(): void
    isDefaultPrevented(): boolean
    stopPropagation(): void
    isPropagationStopped(): boolean
    persist(): void
    timeStamp: number
    type: string
  }

  /**
   * currentTarget - a reference to the element on which the event listener is registered.
   *
   * target - a reference to the element from which the event was originally dispatched.
   * This might be a child element to the element on which the event listener is registered.
   * If you thought this should be `EventTarget & T`, see https://github.com/DefinitelyTyped/DefinitelyTyped/issues/11508#issuecomment-256045682
   */
  interface SyntheticEvent<T = Element, E = Event>
    extends BaseSyntheticEvent<E, EventTarget & T, EventTarget> {}

  interface ClipboardEvent<T = Element>
    extends SyntheticEvent<T, NativeClipboardEvent> {
    clipboardData: DataTransfer
  }

  interface CompositionEvent<T = Element>
    extends SyntheticEvent<T, NativeCompositionEvent> {
    data: string
  }

  interface DragEvent<T = Element> extends MouseEvent<T, NativeDragEvent> {
    dataTransfer: DataTransfer
  }

  interface PointerEvent<T = Element>
    extends MouseEvent<T, NativePointerEvent> {
    pointerId: number
    pressure: number
    tangentialPressure: number
    tiltX: number
    tiltY: number
    twist: number
    width: number
    height: number
    pointerType: "mouse" | "pen" | "touch"
    isPrimary: boolean
  }

  interface FocusEvent<Target = Element, RelatedTarget = Element>
    extends SyntheticEvent<Target, NativeFocusEvent> {
    relatedTarget: (EventTarget & RelatedTarget) | null
    target: EventTarget & Target
  }

  interface FormEvent<T = Element> extends SyntheticEvent<T> {}

  interface InvalidEvent<T = Element> extends SyntheticEvent<T> {
    target: EventTarget & T
  }

  interface ChangeEvent<T = Element> extends SyntheticEvent<T> {
    target: EventTarget & T
  }

  interface InputEvent<T = Element>
    extends SyntheticEvent<T, NativeInputEvent> {
    data: string
  }

  export type ModifierKey =
    | "Alt"
    | "AltGraph"
    | "CapsLock"
    | "Control"
    | "Fn"
    | "FnLock"
    | "Hyper"
    | "Meta"
    | "NumLock"
    | "ScrollLock"
    | "Shift"
    | "Super"
    | "Symbol"
    | "SymbolLock"

  interface KeyboardEvent<T = Element> extends UIEvent<T, NativeKeyboardEvent> {
    altKey: boolean
    /** @deprecated */
    charCode: number
    ctrlKey: boolean
    code: string
    /**
     * See [DOM Level 3 Events spec](https://www.w3.org/TR/uievents-key/#keys-modifier). for a list of valid (case-sensitive) arguments to this method.
     */
    getModifierState(key: ModifierKey): boolean
    /**
     * See the [DOM Level 3 Events spec](https://www.w3.org/TR/uievents-key/#named-key-attribute-values). for possible values
     */
    key: string
    /** @deprecated */
    keyCode: number
    locale: string
    location: number
    metaKey: boolean
    repeat: boolean
    shiftKey: boolean
    /** @deprecated */
    which: number
  }

  interface MouseEvent<T = Element, E = NativeMouseEvent>
    extends UIEvent<T, E> {
    altKey: boolean
    button: number
    buttons: number
    clientX: number
    clientY: number
    ctrlKey: boolean
    /**
     * See [DOM Level 3 Events spec](https://www.w3.org/TR/uievents-key/#keys-modifier). for a list of valid (case-sensitive) arguments to this method.
     */
    getModifierState(key: ModifierKey): boolean
    metaKey: boolean
    movementX: number
    movementY: number
    pageX: number
    pageY: number
    relatedTarget: EventTarget | null
    screenX: number
    screenY: number
    shiftKey: boolean
  }

  interface TouchEvent<T = Element> extends UIEvent<T, NativeTouchEvent> {
    altKey: boolean
    changedTouches: TouchList
    ctrlKey: boolean
    /**
     * See [DOM Level 3 Events spec](https://www.w3.org/TR/uievents-key/#keys-modifier). for a list of valid (case-sensitive) arguments to this method.
     */
    getModifierState(key: ModifierKey): boolean
    metaKey: boolean
    shiftKey: boolean
    targetTouches: TouchList
    touches: TouchList
  }

  interface UIEvent<T = Element, E = NativeUIEvent>
    extends SyntheticEvent<T, E> {
    detail: number
    view: AbstractView
  }

  interface WheelEvent<T = Element> extends MouseEvent<T, NativeWheelEvent> {
    deltaMode: number
    deltaX: number
    deltaY: number
    deltaZ: number
  }

  interface AnimationEvent<T = Element>
    extends SyntheticEvent<T, NativeAnimationEvent> {
    animationName: string
    elapsedTime: number
    pseudoElement: string
  }

  interface ToggleEvent<T = Element>
    extends SyntheticEvent<T, NativeToggleEvent> {
    oldState: "closed" | "open"
    newState: "closed" | "open"
  }

  interface TransitionEvent<T = Element>
    extends SyntheticEvent<T, NativeTransitionEvent> {
    elapsedTime: number
    propertyName: string
    pseudoElement: string
  }

  //
  // Event Handler Types
  // ----------------------------------------------------------------------

  type EventHandler<E extends SyntheticEvent<any>> = {
    bivarianceHack(event: E): void
  }["bivarianceHack"]

  type ReactEventHandler<T = Element> = EventHandler<SyntheticEvent<T>>

  type ClipboardEventHandler<T = Element> = EventHandler<ClipboardEvent<T>>
  type CompositionEventHandler<T = Element> = EventHandler<CompositionEvent<T>>
  type DragEventHandler<T = Element> = EventHandler<DragEvent<T>>
  type FocusEventHandler<T = Element> = EventHandler<FocusEvent<T>>
  type FormEventHandler<T = Element> = EventHandler<FormEvent<T>>
  type ChangeEventHandler<T = Element> = EventHandler<ChangeEvent<T>>
  type InputEventHandler<T = Element> = EventHandler<InputEvent<T>>
  type KeyboardEventHandler<T = Element> = EventHandler<KeyboardEvent<T>>
  type MouseEventHandler<T = Element> = EventHandler<MouseEvent<T>>
  type TouchEventHandler<T = Element> = EventHandler<TouchEvent<T>>
  type PointerEventHandler<T = Element> = EventHandler<PointerEvent<T>>
  type UIEventHandler<T = Element> = EventHandler<UIEvent<T>>
  type WheelEventHandler<T = Element> = EventHandler<WheelEvent<T>>
  type AnimationEventHandler<T = Element> = EventHandler<AnimationEvent<T>>
  type ToggleEventHandler<T = Element> = EventHandler<ToggleEvent<T>>
  type TransitionEventHandler<T = Element> = EventHandler<TransitionEvent<T>>

  //
  // Props / DOM Attributes
  // ----------------------------------------------------------------------

  interface HTMLProps<T> extends AllHTMLAttributes<T>, ClassAttributes<T> {}

  type DetailedHTMLProps<E extends HTMLAttributes<T>, T> = Properties<
    ClassAttributes<T>
  > &
    Properties<E>

  interface SVGProps<T> extends SVGAttributes<T>, ClassAttributes<T> {}

  interface SVGLineElementAttributes<T> extends SVGProps<T> {}
  interface SVGTextElementAttributes<T> extends SVGProps<T> {}

  interface DOMAttributes<T> {
    children?: ElementNode
    dangerouslySetInnerHTML?:
      | {
          // Should be InnerHTML['innerHTML'].
          // But unfortunately we're mixing renderer-specific type declarations.
          __html: string | TrustedHTML
        }
      | undefined

    // Clipboard Events
    onCopy?: ClipboardEventHandler<T> | undefined
    onCopyCapture?: ClipboardEventHandler<T> | undefined
    onCut?: ClipboardEventHandler<T> | undefined
    onCutCapture?: ClipboardEventHandler<T> | undefined
    onPaste?: ClipboardEventHandler<T> | undefined
    onPasteCapture?: ClipboardEventHandler<T> | undefined

    // Composition Events
    onCompositionEnd?: CompositionEventHandler<T> | undefined
    onCompositionEndCapture?: CompositionEventHandler<T> | undefined
    onCompositionStart?: CompositionEventHandler<T> | undefined
    onCompositionStartCapture?: CompositionEventHandler<T> | undefined
    onCompositionUpdate?: CompositionEventHandler<T> | undefined
    onCompositionUpdateCapture?: CompositionEventHandler<T> | undefined

    // Focus Events
    onFocus?: FocusEventHandler<T> | undefined
    onFocusCapture?: FocusEventHandler<T> | undefined
    onBlur?: FocusEventHandler<T> | undefined
    onBlurCapture?: FocusEventHandler<T> | undefined

    // Form Events
    onChange?: FormEventHandler<T> | undefined
    onChangeCapture?: FormEventHandler<T> | undefined
    onBeforeInput?: InputEventHandler<T> | undefined
    onBeforeInputCapture?: FormEventHandler<T> | undefined
    onInput?: FormEventHandler<T> | undefined
    onInputCapture?: FormEventHandler<T> | undefined
    onReset?: FormEventHandler<T> | undefined
    onResetCapture?: FormEventHandler<T> | undefined
    onSubmit?: FormEventHandler<T> | undefined
    onSubmitCapture?: FormEventHandler<T> | undefined
    onInvalid?: FormEventHandler<T> | undefined
    onInvalidCapture?: FormEventHandler<T> | undefined

    // Image Events
    onLoad?: ReactEventHandler<T> | undefined
    onLoadCapture?: ReactEventHandler<T> | undefined
    onError?: ReactEventHandler<T> | undefined // also a Media Event
    onErrorCapture?: ReactEventHandler<T> | undefined // also a Media Event

    // Keyboard Events
    onKeyDown?: KeyboardEventHandler<T> | undefined
    onKeyDownCapture?: KeyboardEventHandler<T> | undefined
    /** @deprecated Use `onKeyUp` or `onKeyDown` instead */
    onKeyPress?: KeyboardEventHandler<T> | undefined
    /** @deprecated Use `onKeyUpCapture` or `onKeyDownCapture` instead */
    onKeyPressCapture?: KeyboardEventHandler<T> | undefined
    onKeyUp?: KeyboardEventHandler<T> | undefined
    onKeyUpCapture?: KeyboardEventHandler<T> | undefined

    // Media Events
    onAbort?: ReactEventHandler<T> | undefined
    onAbortCapture?: ReactEventHandler<T> | undefined
    onCanPlay?: ReactEventHandler<T> | undefined
    onCanPlayCapture?: ReactEventHandler<T> | undefined
    onCanPlayThrough?: ReactEventHandler<T> | undefined
    onCanPlayThroughCapture?: ReactEventHandler<T> | undefined
    onDurationChange?: ReactEventHandler<T> | undefined
    onDurationChangeCapture?: ReactEventHandler<T> | undefined
    onEmptied?: ReactEventHandler<T> | undefined
    onEmptiedCapture?: ReactEventHandler<T> | undefined
    onEncrypted?: ReactEventHandler<T> | undefined
    onEncryptedCapture?: ReactEventHandler<T> | undefined
    onEnded?: ReactEventHandler<T> | undefined
    onEndedCapture?: ReactEventHandler<T> | undefined
    onLoadedData?: ReactEventHandler<T> | undefined
    onLoadedDataCapture?: ReactEventHandler<T> | undefined
    onLoadedMetadata?: ReactEventHandler<T> | undefined
    onLoadedMetadataCapture?: ReactEventHandler<T> | undefined
    onLoadStart?: ReactEventHandler<T> | undefined
    onLoadStartCapture?: ReactEventHandler<T> | undefined
    onPause?: ReactEventHandler<T> | undefined
    onPauseCapture?: ReactEventHandler<T> | undefined
    onPlay?: ReactEventHandler<T> | undefined
    onPlayCapture?: ReactEventHandler<T> | undefined
    onPlaying?: ReactEventHandler<T> | undefined
    onPlayingCapture?: ReactEventHandler<T> | undefined
    onProgress?: ReactEventHandler<T> | undefined
    onProgressCapture?: ReactEventHandler<T> | undefined
    onRateChange?: ReactEventHandler<T> | undefined
    onRateChangeCapture?: ReactEventHandler<T> | undefined
    onSeeked?: ReactEventHandler<T> | undefined
    onSeekedCapture?: ReactEventHandler<T> | undefined
    onSeeking?: ReactEventHandler<T> | undefined
    onSeekingCapture?: ReactEventHandler<T> | undefined
    onStalled?: ReactEventHandler<T> | undefined
    onStalledCapture?: ReactEventHandler<T> | undefined
    onSuspend?: ReactEventHandler<T> | undefined
    onSuspendCapture?: ReactEventHandler<T> | undefined
    onTimeUpdate?: ReactEventHandler<T> | undefined
    onTimeUpdateCapture?: ReactEventHandler<T> | undefined
    onVolumeChange?: ReactEventHandler<T> | undefined
    onVolumeChangeCapture?: ReactEventHandler<T> | undefined
    onWaiting?: ReactEventHandler<T> | undefined
    onWaitingCapture?: ReactEventHandler<T> | undefined

    // MouseEvents
    onAuxClick?: MouseEventHandler<T> | undefined
    onAuxClickCapture?: MouseEventHandler<T> | undefined
    onClick?: MouseEventHandler<T> | undefined
    onClickCapture?: MouseEventHandler<T> | undefined
    onContextMenu?: MouseEventHandler<T> | undefined
    onContextMenuCapture?: MouseEventHandler<T> | undefined
    onDoubleClick?: MouseEventHandler<T> | undefined
    onDoubleClickCapture?: MouseEventHandler<T> | undefined
    onDrag?: DragEventHandler<T> | undefined
    onDragCapture?: DragEventHandler<T> | undefined
    onDragEnd?: DragEventHandler<T> | undefined
    onDragEndCapture?: DragEventHandler<T> | undefined
    onDragEnter?: DragEventHandler<T> | undefined
    onDragEnterCapture?: DragEventHandler<T> | undefined
    onDragExit?: DragEventHandler<T> | undefined
    onDragExitCapture?: DragEventHandler<T> | undefined
    onDragLeave?: DragEventHandler<T> | undefined
    onDragLeaveCapture?: DragEventHandler<T> | undefined
    onDragOver?: DragEventHandler<T> | undefined
    onDragOverCapture?: DragEventHandler<T> | undefined
    onDragStart?: DragEventHandler<T> | undefined
    onDragStartCapture?: DragEventHandler<T> | undefined
    onDrop?: DragEventHandler<T> | undefined
    onDropCapture?: DragEventHandler<T> | undefined
    onMouseDown?: MouseEventHandler<T> | undefined
    onMouseDownCapture?: MouseEventHandler<T> | undefined
    onMouseEnter?: MouseEventHandler<T> | undefined
    onMouseLeave?: MouseEventHandler<T> | undefined
    onMouseMove?: MouseEventHandler<T> | undefined
    onMouseMoveCapture?: MouseEventHandler<T> | undefined
    onMouseOut?: MouseEventHandler<T> | undefined
    onMouseOutCapture?: MouseEventHandler<T> | undefined
    onMouseOver?: MouseEventHandler<T> | undefined
    onMouseOverCapture?: MouseEventHandler<T> | undefined
    onMouseUp?: MouseEventHandler<T> | undefined
    onMouseUpCapture?: MouseEventHandler<T> | undefined

    // Selection Events
    onSelect?: ReactEventHandler<T> | undefined
    onSelectCapture?: ReactEventHandler<T> | undefined

    // Touch Events
    onTouchCancel?: TouchEventHandler<T> | undefined
    onTouchCancelCapture?: TouchEventHandler<T> | undefined
    onTouchEnd?: TouchEventHandler<T> | undefined
    onTouchEndCapture?: TouchEventHandler<T> | undefined
    onTouchMove?: TouchEventHandler<T> | undefined
    onTouchMoveCapture?: TouchEventHandler<T> | undefined
    onTouchStart?: TouchEventHandler<T> | undefined
    onTouchStartCapture?: TouchEventHandler<T> | undefined

    // Pointer Events
    onPointerDown?: PointerEventHandler<T> | undefined
    onPointerDownCapture?: PointerEventHandler<T> | undefined
    onPointerMove?: PointerEventHandler<T> | undefined
    onPointerMoveCapture?: PointerEventHandler<T> | undefined
    onPointerUp?: PointerEventHandler<T> | undefined
    onPointerUpCapture?: PointerEventHandler<T> | undefined
    onPointerCancel?: PointerEventHandler<T> | undefined
    onPointerCancelCapture?: PointerEventHandler<T> | undefined
    onPointerEnter?: PointerEventHandler<T> | undefined
    onPointerLeave?: PointerEventHandler<T> | undefined
    onPointerOver?: PointerEventHandler<T> | undefined
    onPointerOverCapture?: PointerEventHandler<T> | undefined
    onPointerOut?: PointerEventHandler<T> | undefined
    onPointerOutCapture?: PointerEventHandler<T> | undefined
    onGotPointerCapture?: PointerEventHandler<T> | undefined
    onGotPointerCaptureCapture?: PointerEventHandler<T> | undefined
    onLostPointerCapture?: PointerEventHandler<T> | undefined
    onLostPointerCaptureCapture?: PointerEventHandler<T> | undefined

    // UI Events
    onScroll?: UIEventHandler<T> | undefined
    onScrollCapture?: UIEventHandler<T> | undefined
    onScrollEnd?: UIEventHandler<T> | undefined
    onScrollEndCapture?: UIEventHandler<T> | undefined

    // Wheel Events
    onWheel?: WheelEventHandler<T> | undefined
    onWheelCapture?: WheelEventHandler<T> | undefined

    // Animation Events
    onAnimationStart?: AnimationEventHandler<T> | undefined
    onAnimationStartCapture?: AnimationEventHandler<T> | undefined
    onAnimationEnd?: AnimationEventHandler<T> | undefined
    onAnimationEndCapture?: AnimationEventHandler<T> | undefined
    onAnimationIteration?: AnimationEventHandler<T> | undefined
    onAnimationIterationCapture?: AnimationEventHandler<T> | undefined

    // Toggle Events
    onToggle?: ToggleEventHandler<T> | undefined
    onBeforeToggle?: ToggleEventHandler<T> | undefined

    // Transition Events
    onTransitionCancel?: TransitionEventHandler<T> | undefined
    onTransitionCancelCapture?: TransitionEventHandler<T> | undefined
    onTransitionEnd?: TransitionEventHandler<T> | undefined
    onTransitionEndCapture?: TransitionEventHandler<T> | undefined
    onTransitionRun?: TransitionEventHandler<T> | undefined
    onTransitionRunCapture?: TransitionEventHandler<T> | undefined
    onTransitionStart?: TransitionEventHandler<T> | undefined
    onTransitionStartCapture?: TransitionEventHandler<T> | undefined
  }

  export interface CSSProperties extends CSS.Properties<string | number> {
    /**
     * The index signature was removed to enable closed typing for style
     * using CSSType. You're able to use type assertion or module augmentation
     * to add properties or an index signature of your own.
     *
     * For examples and more information, visit:
     * https://github.com/frenic/csstype#what-should-i-do-when-i-get-type-errors
     */
  }

  // All the WAI-ARIA 1.1 attributes from https://www.w3.org/TR/wai-aria-1.1/
  interface AriaAttributes {
    /** Identifies the currently active element when DOM focus is on a composite widget, textbox, group, or application. */
    "aria-activedescendant"?: string | undefined
    /** Indicates whether assistive technologies will present all, or only parts of, the changed region based on the change notifications defined by the aria-relevant attribute. */
    "aria-atomic"?: Booleanish | undefined
    /**
     * Indicates whether inputting text could trigger display of one or more predictions of the user's intended value for an input and specifies how predictions would be
     * presented if they are made.
     */
    "aria-autocomplete"?: "none" | "inline" | "list" | "both" | undefined
    /** Indicates an element is being modified and that assistive technologies MAY want to wait until the modifications are complete before exposing them to the user. */
    /**
     * Defines a string value that labels the current element, which is intended to be converted into Braille.
     * @see aria-label.
     */
    "aria-braillelabel"?: string | undefined
    /**
     * Defines a human-readable, author-localized abbreviated description for the role of an element, which is intended to be converted into Braille.
     * @see aria-roledescription.
     */
    "aria-brailleroledescription"?: string | undefined
    "aria-busy"?: Booleanish | undefined
    /**
     * Indicates the current "checked" state of checkboxes, radio buttons, and other widgets.
     * @see aria-pressed @see aria-selected.
     */
    "aria-checked"?: boolean | "false" | "mixed" | "true" | undefined
    /**
     * Defines the total number of columns in a table, grid, or treegrid.
     * @see aria-colindex.
     */
    "aria-colcount"?: number | undefined
    /**
     * Defines an element's column index or position with respect to the total number of columns within a table, grid, or treegrid.
     * @see aria-colcount @see aria-colspan.
     */
    "aria-colindex"?: number | undefined
    /**
     * Defines a human readable text alternative of aria-colindex.
     * @see aria-rowindextext.
     */
    "aria-colindextext"?: string | undefined
    /**
     * Defines the number of columns spanned by a cell or gridcell within a table, grid, or treegrid.
     * @see aria-colindex @see aria-rowspan.
     */
    "aria-colspan"?: number | undefined
    /**
     * Identifies the element (or elements) whose contents or presence are controlled by the current element.
     * @see aria-owns.
     */
    "aria-controls"?: string | undefined
    /** Indicates the element that represents the current item within a container or set of related elements. */
    "aria-current"?:
      | boolean
      | "false"
      | "true"
      | "page"
      | "step"
      | "location"
      | "date"
      | "time"
      | undefined
    /**
     * Identifies the element (or elements) that describes the object.
     * @see aria-labelledby
     */
    "aria-describedby"?: string | undefined
    /**
     * Defines a string value that describes or annotates the current element.
     * @see related aria-describedby.
     */
    "aria-description"?: string | undefined
    /**
     * Identifies the element that provides a detailed, extended description for the object.
     * @see aria-describedby.
     */
    "aria-details"?: string | undefined
    /**
     * Indicates that the element is perceivable but disabled, so it is not editable or otherwise operable.
     * @see aria-hidden @see aria-readonly.
     */
    "aria-disabled"?: Booleanish | undefined
    /**
     * Indicates what functions can be performed when a dragged object is released on the drop target.
     * @deprecated in ARIA 1.1
     */
    "aria-dropeffect"?:
      | "none"
      | "copy"
      | "execute"
      | "link"
      | "move"
      | "popup"
      | undefined
    /**
     * Identifies the element that provides an error message for the object.
     * @see aria-invalid @see aria-describedby.
     */
    "aria-errormessage"?: string | undefined
    /** Indicates whether the element, or another grouping element it controls, is currently expanded or collapsed. */
    "aria-expanded"?: Booleanish | undefined
    /**
     * Identifies the next element (or elements) in an alternate reading order of content which, at the user's discretion,
     * allows assistive technology to override the general default of reading in document source order.
     */
    "aria-flowto"?: string | undefined
    /**
     * Indicates an element's "grabbed" state in a drag-and-drop operation.
     * @deprecated in ARIA 1.1
     */
    "aria-grabbed"?: Booleanish | undefined
    /** Indicates the availability and type of interactive popup element, such as menu or dialog, that can be triggered by an element. */
    "aria-haspopup"?:
      | boolean
      | "false"
      | "true"
      | "menu"
      | "listbox"
      | "tree"
      | "grid"
      | "dialog"
      | undefined
    /**
     * Indicates whether the element is exposed to an accessibility API.
     * @see aria-disabled.
     */
    "aria-hidden"?: Booleanish | undefined
    /**
     * Indicates the entered value does not conform to the format expected by the application.
     * @see aria-errormessage.
     */
    "aria-invalid"?:
      | boolean
      | "false"
      | "true"
      | "grammar"
      | "spelling"
      | undefined
    /** Indicates keyboard shortcuts that an author has implemented to activate or give focus to an element. */
    "aria-keyshortcuts"?: string | undefined
    /**
     * Defines a string value that labels the current element.
     * @see aria-labelledby.
     */
    "aria-label"?: string | undefined
    /**
     * Identifies the element (or elements) that labels the current element.
     * @see aria-describedby.
     */
    "aria-labelledby"?: string | undefined
    /** Defines the hierarchical level of an element within a structure. */
    "aria-level"?: number | undefined
    /** Indicates that an element will be updated, and describes the types of updates the user agents, assistive technologies, and user can expect from the live region. */
    "aria-live"?: "off" | "assertive" | "polite" | undefined
    /** Indicates whether an element is modal when displayed. */
    "aria-modal"?: Booleanish | undefined
    /** Indicates whether a text box accepts multiple lines of input or only a single line. */
    "aria-multiline"?: Booleanish | undefined
    /** Indicates that the user may select more than one item from the current selectable descendants. */
    "aria-multiselectable"?: Booleanish | undefined
    /** Indicates whether the element's orientation is horizontal, vertical, or unknown/ambiguous. */
    "aria-orientation"?: "horizontal" | "vertical" | undefined
    /**
     * Identifies an element (or elements) in order to define a visual, functional, or contextual parent/child relationship
     * between DOM elements where the DOM hierarchy cannot be used to represent the relationship.
     * @see aria-controls.
     */
    "aria-owns"?: string | undefined
    /**
     * Defines a short hint (a word or short phrase) intended to aid the user with data entry when the control has no value.
     * A hint could be a sample value or a brief description of the expected format.
     */
    "aria-placeholder"?: string | undefined
    /**
     * Defines an element's number or position in the current set of listitems or treeitems. Not required if all elements in the set are present in the DOM.
     * @see aria-setsize.
     */
    "aria-posinset"?: number | undefined
    /**
     * Indicates the current "pressed" state of toggle buttons.
     * @see aria-checked @see aria-selected.
     */
    "aria-pressed"?: boolean | "false" | "mixed" | "true" | undefined
    /**
     * Indicates that the element is not editable, but is otherwise operable.
     * @see aria-disabled.
     */
    "aria-readonly"?: Booleanish | undefined
    /**
     * Indicates what notifications the user agent will trigger when the accessibility tree within a live region is modified.
     * @see aria-atomic.
     */
    "aria-relevant"?:
      | "additions"
      | "additions removals"
      | "additions text"
      | "all"
      | "removals"
      | "removals additions"
      | "removals text"
      | "text"
      | "text additions"
      | "text removals"
      | undefined
    /** Indicates that user input is required on the element before a form may be submitted. */
    "aria-required"?: Booleanish | undefined
    /** Defines a human-readable, author-localized description for the role of an element. */
    "aria-roledescription"?: string | undefined
    /**
     * Defines the total number of rows in a table, grid, or treegrid.
     * @see aria-rowindex.
     */
    "aria-rowcount"?: number | undefined
    /**
     * Defines an element's row index or position with respect to the total number of rows within a table, grid, or treegrid.
     * @see aria-rowcount @see aria-rowspan.
     */
    "aria-rowindex"?: number | undefined
    /**
     * Defines a human readable text alternative of aria-rowindex.
     * @see aria-colindextext.
     */
    "aria-rowindextext"?: string | undefined
    /**
     * Defines the number of rows spanned by a cell or gridcell within a table, grid, or treegrid.
     * @see aria-rowindex @see aria-colspan.
     */
    "aria-rowspan"?: number | undefined
    /**
     * Indicates the current "selected" state of various widgets.
     * @see aria-checked @see aria-pressed.
     */
    "aria-selected"?: Booleanish | undefined
    /**
     * Defines the number of items in the current set of listitems or treeitems. Not required if all elements in the set are present in the DOM.
     * @see aria-posinset.
     */
    "aria-setsize"?: number | undefined
    /** Indicates if items in a table or grid are sorted in ascending or descending order. */
    "aria-sort"?: "none" | "ascending" | "descending" | "other" | undefined
    /** Defines the maximum allowed value for a range widget. */
    "aria-valuemax"?: number | undefined
    /** Defines the minimum allowed value for a range widget. */
    "aria-valuemin"?: number | undefined
    /**
     * Defines the current value for a range widget.
     * @see aria-valuetext.
     */
    "aria-valuenow"?: number | undefined
    /** Defines the human readable text alternative of aria-valuenow for a range widget. */
    "aria-valuetext"?: string | undefined
  }

  // All the WAI-ARIA 1.1 role attribute values from https://www.w3.org/TR/wai-aria-1.1/#role_definitions
  type AriaRole =
    | "alert"
    | "alertdialog"
    | "application"
    | "article"
    | "banner"
    | "button"
    | "cell"
    | "checkbox"
    | "columnheader"
    | "combobox"
    | "complementary"
    | "contentinfo"
    | "definition"
    | "dialog"
    | "directory"
    | "document"
    | "feed"
    | "figure"
    | "form"
    | "grid"
    | "gridcell"
    | "group"
    | "heading"
    | "img"
    | "link"
    | "list"
    | "listbox"
    | "listitem"
    | "log"
    | "main"
    | "marquee"
    | "math"
    | "menu"
    | "menubar"
    | "menuitem"
    | "menuitemcheckbox"
    | "menuitemradio"
    | "navigation"
    | "none"
    | "note"
    | "option"
    | "presentation"
    | "progressbar"
    | "radio"
    | "radiogroup"
    | "region"
    | "row"
    | "rowgroup"
    | "rowheader"
    | "scrollbar"
    | "search"
    | "searchbox"
    | "separator"
    | "slider"
    | "spinbutton"
    | "status"
    | "switch"
    | "tab"
    | "table"
    | "tablist"
    | "tabpanel"
    | "term"
    | "textbox"
    | "timer"
    | "toolbar"
    | "tooltip"
    | "tree"
    | "treegrid"
    | "treeitem"
    | (string & {})

  interface HTMLAttributes<T> extends AriaAttributes, DOMAttributes<T> {
    // React-specific Attributes
    defaultChecked?: boolean | undefined
    defaultValue?: string | number | readonly string[] | undefined
    suppressContentEditableWarning?: boolean | undefined
    suppressHydrationWarning?: boolean | undefined

    // Standard HTML Attributes
    accessKey?: string | undefined
    autoCapitalize?:
      | "off"
      | "none"
      | "on"
      | "sentences"
      | "words"
      | "characters"
      | undefined
      | (string & {})
    autoFocus?: boolean | undefined
    className?: string | undefined
    contentEditable?: Booleanish | "inherit" | "plaintext-only" | undefined
    contextMenu?: string | undefined
    dir?: string | undefined
    draggable?: Booleanish | undefined
    enterKeyHint?:
      | "enter"
      | "done"
      | "go"
      | "next"
      | "previous"
      | "search"
      | "send"
      | undefined
    hidden?: boolean | undefined
    id?: string | undefined
    lang?: string | undefined
    nonce?: string | undefined
    slot?: string | undefined
    spellCheck?: Booleanish | undefined
    style?: CSSProperties | undefined
    tabIndex?: number | undefined
    title?: string | undefined
    translate?: "yes" | "no" | undefined

    // Unknown
    radioGroup?: string | undefined // <command>, <menuitem>

    // WAI-ARIA
    role?: AriaRole | undefined

    // RDFa Attributes
    about?: string | undefined
    content?: string | undefined
    datatype?: string | undefined
    inlist?: any
    prefix?: string | undefined
    property?: string | undefined
    rel?: string | undefined
    resource?: string | undefined
    rev?: string | undefined
    typeof?: string | undefined
    vocab?: string | undefined

    // Non-standard Attributes
    autoCorrect?: string | undefined
    autoSave?: string | undefined
    color?: string | undefined
    itemProp?: string | undefined
    itemScope?: boolean | undefined
    itemType?: string | undefined
    itemID?: string | undefined
    itemRef?: string | undefined
    results?: number | undefined
    security?: string | undefined
    unselectable?: "on" | "off" | undefined

    // Popover API
    popover?: "" | "auto" | "manual" | undefined
    popoverTargetAction?: "toggle" | "show" | "hide" | undefined
    popoverTarget?: string | undefined

    // Living Standard
    /**
     * @see https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/inert
     */
    inert?: boolean | undefined
    /**
     * Hints at the type of data that might be entered by the user while editing the element or its contents
     * @see {@link https://html.spec.whatwg.org/multipage/interaction.html#input-modalities:-the-inputmode-attribute}
     */
    inputMode?:
      | "none"
      | "text"
      | "tel"
      | "url"
      | "email"
      | "numeric"
      | "decimal"
      | "search"
      | undefined
    /**
     * Specify that a standard HTML element should behave like a defined custom built-in element
     * @see {@link https://html.spec.whatwg.org/multipage/custom-elements.html#attr-is}
     */
    is?: string | undefined
    /**
     * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/exportparts}
     */
    exportparts?: string | undefined
    /**
     * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/part}
     */
    part?: string | undefined
  }

  interface AllHTMLAttributes<T> extends HTMLAttributes<T> {
    // Standard HTML Attributes
    accept?: string | undefined
    acceptCharset?: string | undefined
    action?: string | undefined
    allowFullScreen?: boolean | undefined
    allowTransparency?: boolean | undefined
    alt?: string | undefined
    as?: string | undefined
    async?: boolean | undefined
    autoComplete?: string | undefined
    autoPlay?: boolean | undefined
    capture?: boolean | "user" | "environment" | undefined
    cellPadding?: number | string | undefined
    cellSpacing?: number | string | undefined
    charSet?: string | undefined
    challenge?: string | undefined
    checked?: boolean | undefined
    cite?: string | undefined
    classID?: string | undefined
    cols?: number | undefined
    colSpan?: number | undefined
    controls?: boolean | undefined
    coords?: string | undefined
    crossOrigin?: CrossOrigin
    data?: string | undefined
    dateTime?: string | undefined
    default?: boolean | undefined
    defer?: boolean | undefined
    disabled?: boolean | undefined
    download?: any
    encType?: string | undefined
    form?: string | undefined
    formEncType?: string | undefined
    formMethod?: string | undefined
    formNoValidate?: boolean | undefined
    formTarget?: string | undefined
    frameBorder?: number | string | undefined
    headers?: string | undefined
    height?: number | string | undefined
    high?: number | undefined
    href?: string | undefined
    hrefLang?: string | undefined
    htmlFor?: string | undefined
    httpEquiv?: string | undefined
    integrity?: string | undefined
    keyParams?: string | undefined
    keyType?: string | undefined
    kind?: string | undefined
    label?: string | undefined
    list?: string | undefined
    loop?: boolean | undefined
    low?: number | undefined
    manifest?: string | undefined
    marginHeight?: number | undefined
    marginWidth?: number | undefined
    max?: number | string | undefined
    maxLength?: number | undefined
    media?: string | undefined
    mediaGroup?: string | undefined
    method?: string | undefined
    min?: number | string | undefined
    minLength?: number | undefined
    multiple?: boolean | undefined
    muted?: boolean | undefined
    name?: string | undefined
    noValidate?: boolean | undefined
    open?: boolean | undefined
    optimum?: number | undefined
    pattern?: string | undefined
    placeholder?: string | undefined
    playsInline?: boolean | undefined
    poster?: string | undefined
    preload?: string | undefined
    readOnly?: boolean | undefined
    required?: boolean | undefined
    reversed?: boolean | undefined
    rows?: number | undefined
    rowSpan?: number | undefined
    sandbox?: string | undefined
    scope?: string | undefined
    scoped?: boolean | undefined
    scrolling?: string | undefined
    seamless?: boolean | undefined
    selected?: boolean | undefined
    shape?: string | undefined
    size?: number | undefined
    sizes?: string | undefined
    span?: number | undefined
    src?: string | undefined
    srcDoc?: string | undefined
    srcLang?: string | undefined
    srcSet?: string | undefined
    start?: number | undefined
    step?: number | string | undefined
    summary?: string | undefined
    target?: string | undefined
    type?: string | undefined
    useMap?: string | undefined
    value?: string | readonly string[] | number | undefined
    width?: number | string | undefined
    wmode?: string | undefined
    wrap?: string | undefined
  }

  type HTMLAttributeReferrerPolicy =
    | ""
    | "no-referrer"
    | "no-referrer-when-downgrade"
    | "origin"
    | "origin-when-cross-origin"
    | "same-origin"
    | "strict-origin"
    | "strict-origin-when-cross-origin"
    | "unsafe-url"

  type HTMLAttributeAnchorTarget =
    | "_self"
    | "_blank"
    | "_parent"
    | "_top"
    | (string & {})

  interface AnchorHTMLAttributes<T> extends HTMLAttributes<T> {
    download?: any
    href?: string | undefined
    hrefLang?: string | undefined
    media?: string | undefined
    ping?: string | undefined
    target?: HTMLAttributeAnchorTarget | undefined
    type?: string | undefined
    referrerPolicy?: HTMLAttributeReferrerPolicy | undefined
  }

  interface AudioHTMLAttributes<T> extends MediaHTMLAttributes<T> {}

  interface AreaHTMLAttributes<T> extends HTMLAttributes<T> {
    alt?: string | undefined
    coords?: string | undefined
    download?: any
    href?: string | undefined
    hrefLang?: string | undefined
    media?: string | undefined
    referrerPolicy?: HTMLAttributeReferrerPolicy | undefined
    shape?: string | undefined
    target?: string | undefined
  }

  interface BaseHTMLAttributes<T> extends HTMLAttributes<T> {
    href?: string | undefined
    target?: string | undefined
  }

  interface BlockquoteHTMLAttributes<T> extends HTMLAttributes<T> {
    cite?: string | undefined
  }

  interface ButtonHTMLAttributes<T> extends HTMLAttributes<T> {
    disabled?: boolean | undefined
    form?: string | undefined
    formAction?: string
    formEncType?: string | undefined
    formMethod?: string | undefined
    formNoValidate?: boolean | undefined
    formTarget?: string | undefined
    name?: string | undefined
    type?: "submit" | "reset" | "button" | undefined
    value?: string | readonly string[] | number | undefined
  }

  interface CanvasHTMLAttributes<T> extends HTMLAttributes<T> {
    height?: number | string | undefined
    width?: number | string | undefined
  }

  interface ColHTMLAttributes<T> extends HTMLAttributes<T> {
    span?: number | undefined
    width?: number | string | undefined
  }

  interface ColgroupHTMLAttributes<T> extends HTMLAttributes<T> {
    span?: number | undefined
  }

  interface DataHTMLAttributes<T> extends HTMLAttributes<T> {
    value?: string | readonly string[] | number | undefined
  }

  interface DetailsHTMLAttributes<T> extends HTMLAttributes<T> {
    open?: boolean | undefined
    name?: string | undefined
  }

  interface DelHTMLAttributes<T> extends HTMLAttributes<T> {
    cite?: string | undefined
    dateTime?: string | undefined
  }

  interface DialogHTMLAttributes<T> extends HTMLAttributes<T> {
    onCancel?: ReactEventHandler<T> | undefined
    onClose?: ReactEventHandler<T> | undefined
    open?: boolean | undefined
  }

  interface EmbedHTMLAttributes<T> extends HTMLAttributes<T> {
    height?: number | string | undefined
    src?: string | undefined
    type?: string | undefined
    width?: number | string | undefined
  }

  interface FieldsetHTMLAttributes<T> extends HTMLAttributes<T> {
    disabled?: boolean | undefined
    form?: string | undefined
    name?: string | undefined
  }

  interface FormHTMLAttributes<T> extends HTMLAttributes<T> {
    acceptCharset?: string | undefined
    action?: string | undefined
    autoComplete?: string | undefined
    encType?: string | undefined
    method?: string | undefined
    name?: string | undefined
    noValidate?: boolean | undefined
    target?: string | undefined
  }

  interface HtmlHTMLAttributes<T> extends HTMLAttributes<T> {
    manifest?: string | undefined
  }

  interface IframeHTMLAttributes<T> extends HTMLAttributes<T> {
    allow?: string | undefined
    allowFullScreen?: boolean | undefined
    allowTransparency?: boolean | undefined
    /** @deprecated */
    frameBorder?: number | string | undefined
    height?: number | string | undefined
    loading?: "eager" | "lazy" | undefined
    /** @deprecated */
    marginHeight?: number | undefined
    /** @deprecated */
    marginWidth?: number | undefined
    name?: string | undefined
    referrerPolicy?: HTMLAttributeReferrerPolicy | undefined
    sandbox?: string | undefined
    /** @deprecated */
    scrolling?: string | undefined
    seamless?: boolean | undefined
    src?: string | undefined
    srcDoc?: string | undefined
    width?: number | string | undefined
  }

  interface ImgHTMLAttributes<T> extends HTMLAttributes<T> {
    alt?: string | undefined
    crossOrigin?: CrossOrigin
    decoding?: "async" | "auto" | "sync" | undefined
    fetchPriority?: "high" | "low" | "auto"
    height?: number | string | undefined
    loading?: "eager" | "lazy" | undefined
    referrerPolicy?: HTMLAttributeReferrerPolicy | undefined
    sizes?: string | undefined
    src?: string | undefined
    srcSet?: string | undefined
    useMap?: string | undefined
    width?: number | string | undefined
  }

  interface InsHTMLAttributes<T> extends HTMLAttributes<T> {
    cite?: string | undefined
    dateTime?: string | undefined
  }

  type HTMLInputTypeAttribute =
    | "button"
    | "checkbox"
    | "color"
    | "date"
    | "datetime-local"
    | "email"
    | "file"
    | "hidden"
    | "image"
    | "month"
    | "number"
    | "password"
    | "radio"
    | "range"
    | "reset"
    | "search"
    | "submit"
    | "tel"
    | "text"
    | "time"
    | "url"
    | "week"
    | (string & {})

  type AutoFillAddressKind = "billing" | "shipping"
  type AutoFillBase = "" | "off" | "on"
  type AutoFillContactField =
    | "email"
    | "tel"
    | "tel-area-code"
    | "tel-country-code"
    | "tel-extension"
    | "tel-local"
    | "tel-local-prefix"
    | "tel-local-suffix"
    | "tel-national"
  type AutoFillContactKind = "home" | "mobile" | "work"
  type AutoFillCredentialField = "webauthn"
  type AutoFillNormalField =
    | "additional-name"
    | "address-level1"
    | "address-level2"
    | "address-level3"
    | "address-level4"
    | "address-line1"
    | "address-line2"
    | "address-line3"
    | "bday-day"
    | "bday-month"
    | "bday-year"
    | "cc-csc"
    | "cc-exp"
    | "cc-exp-month"
    | "cc-exp-year"
    | "cc-family-name"
    | "cc-given-name"
    | "cc-name"
    | "cc-number"
    | "cc-type"
    | "country"
    | "country-name"
    | "current-password"
    | "family-name"
    | "given-name"
    | "honorific-prefix"
    | "honorific-suffix"
    | "name"
    | "new-password"
    | "one-time-code"
    | "organization"
    | "postal-code"
    | "street-address"
    | "transaction-amount"
    | "transaction-currency"
    | "username"
  type OptionalPrefixToken<T extends string> = `${T} ` | ""
  type OptionalPostfixToken<T extends string> = ` ${T}` | ""
  type AutoFillField =
    | AutoFillNormalField
    | `${OptionalPrefixToken<AutoFillContactKind>}${AutoFillContactField}`
  type AutoFillSection = `section-${string}`
  type AutoFill =
    | AutoFillBase
    | `${OptionalPrefixToken<AutoFillSection>}${OptionalPrefixToken<AutoFillAddressKind>}${AutoFillField}${OptionalPostfixToken<AutoFillCredentialField>}`
  type HTMLInputAutoCompleteAttribute = AutoFill | (string & {})

  interface InputHTMLAttributes<T> extends HTMLAttributes<T> {
    accept?: string | undefined
    alt?: string | undefined
    autoComplete?: HTMLInputAutoCompleteAttribute | undefined
    capture?: boolean | "user" | "environment" | undefined // https://www.w3.org/TR/html-media-capture/#the-capture-attribute
    checked?: boolean | undefined
    disabled?: boolean | undefined
    form?: string | undefined
    formAction?: string | undefined
    formEncType?: string | undefined
    formMethod?: string | undefined
    formNoValidate?: boolean | undefined
    formTarget?: string | undefined
    height?: number | string | undefined
    list?: string | undefined
    max?: number | string | undefined
    maxLength?: number | undefined
    min?: number | string | undefined
    minLength?: number | undefined
    multiple?: boolean | undefined
    name?: string | undefined
    pattern?: string | undefined
    placeholder?: string | undefined
    readOnly?: boolean | undefined
    required?: boolean | undefined
    size?: number | undefined
    src?: string | undefined
    step?: number | string | undefined
    type?: HTMLInputTypeAttribute | undefined
    value?: string | readonly string[] | number | undefined
    width?: number | string | undefined

    onChange?: ChangeEventHandler<T> | undefined
  }

  interface KeygenHTMLAttributes<T> extends HTMLAttributes<T> {
    challenge?: string | undefined
    disabled?: boolean | undefined
    form?: string | undefined
    keyType?: string | undefined
    keyParams?: string | undefined
    name?: string | undefined
  }

  interface LabelHTMLAttributes<T> extends HTMLAttributes<T> {
    form?: string | undefined
    htmlFor?: string | undefined
  }

  interface LiHTMLAttributes<T> extends HTMLAttributes<T> {
    value?: string | readonly string[] | number | undefined
  }

  interface LinkHTMLAttributes<T> extends HTMLAttributes<T> {
    as?: string | undefined
    blocking?: "render" | (string & {}) | undefined
    crossOrigin?: CrossOrigin
    fetchPriority?: "high" | "low" | "auto"
    href?: string | undefined
    hrefLang?: string | undefined
    integrity?: string | undefined
    media?: string | undefined
    imageSrcSet?: string | undefined
    imageSizes?: string | undefined
    referrerPolicy?: HTMLAttributeReferrerPolicy | undefined
    sizes?: string | undefined
    type?: string | undefined
    charSet?: string | undefined

    // React props
    precedence?: string | undefined
  }

  interface MapHTMLAttributes<T> extends HTMLAttributes<T> {
    name?: string | undefined
  }

  interface MenuHTMLAttributes<T> extends HTMLAttributes<T> {
    type?: string | undefined
  }

  interface MediaHTMLAttributes<T> extends HTMLAttributes<T> {
    autoPlay?: boolean | undefined
    controls?: boolean | undefined
    controlsList?: string | undefined
    crossOrigin?: CrossOrigin
    loop?: boolean | undefined
    mediaGroup?: string | undefined
    muted?: boolean | undefined
    playsInline?: boolean | undefined
    preload?: string | undefined
    src?: string | undefined
  }

  interface MetaHTMLAttributes<T> extends HTMLAttributes<T> {
    charSet?: string | undefined
    content?: string | undefined
    httpEquiv?: string | undefined
    media?: string | undefined
    name?: string | undefined
  }

  interface MeterHTMLAttributes<T> extends HTMLAttributes<T> {
    form?: string | undefined
    high?: number | undefined
    low?: number | undefined
    max?: number | string | undefined
    min?: number | string | undefined
    optimum?: number | undefined
    value?: string | readonly string[] | number | undefined
  }

  interface QuoteHTMLAttributes<T> extends HTMLAttributes<T> {
    cite?: string | undefined
  }

  interface ObjectHTMLAttributes<T> extends HTMLAttributes<T> {
    classID?: string | undefined
    data?: string | undefined
    form?: string | undefined
    height?: number | string | undefined
    name?: string | undefined
    type?: string | undefined
    useMap?: string | undefined
    width?: number | string | undefined
    wmode?: string | undefined
  }

  interface OlHTMLAttributes<T> extends HTMLAttributes<T> {
    reversed?: boolean | undefined
    start?: number | undefined
    type?: "1" | "a" | "A" | "i" | "I" | undefined
  }

  interface OptgroupHTMLAttributes<T> extends HTMLAttributes<T> {
    disabled?: boolean | undefined
    label?: string | undefined
  }

  interface OptionHTMLAttributes<T> extends HTMLAttributes<T> {
    disabled?: boolean | undefined
    label?: string | undefined
    selected?: boolean | undefined
    value?: string | readonly string[] | number | undefined
  }

  interface OutputHTMLAttributes<T> extends HTMLAttributes<T> {
    form?: string | undefined
    htmlFor?: string | undefined
    name?: string | undefined
  }

  interface ParamHTMLAttributes<T> extends HTMLAttributes<T> {
    name?: string | undefined
    value?: string | readonly string[] | number | undefined
  }

  interface ProgressHTMLAttributes<T> extends HTMLAttributes<T> {
    max?: number | string | undefined
    value?: string | readonly string[] | number | undefined
  }

  interface SlotHTMLAttributes<T> extends HTMLAttributes<T> {
    name?: string | undefined
  }

  interface ScriptHTMLAttributes<T> extends HTMLAttributes<T> {
    async?: boolean | undefined
    blocking?: "render" | (string & {}) | undefined
    /** @deprecated */
    charSet?: string | undefined
    crossOrigin?: CrossOrigin
    defer?: boolean | undefined
    fetchPriority?: "high" | "low" | "auto" | undefined
    integrity?: string | undefined
    noModule?: boolean | undefined
    referrerPolicy?: HTMLAttributeReferrerPolicy | undefined
    src?: string | undefined
    type?: string | undefined
  }

  interface SelectHTMLAttributes<T> extends HTMLAttributes<T> {
    autoComplete?: string | undefined
    disabled?: boolean | undefined
    form?: string | undefined
    multiple?: boolean | undefined
    name?: string | undefined
    required?: boolean | undefined
    size?: number | undefined
    value?: string | readonly string[] | number | undefined
    onChange?: ChangeEventHandler<T> | undefined
  }

  interface SourceHTMLAttributes<T> extends HTMLAttributes<T> {
    height?: number | string | undefined
    media?: string | undefined
    sizes?: string | undefined
    src?: string | undefined
    srcSet?: string | undefined
    type?: string | undefined
    width?: number | string | undefined
  }

  interface StyleHTMLAttributes<T> extends HTMLAttributes<T> {
    blocking?: "render" | (string & {}) | undefined
    media?: string | undefined
    scoped?: boolean | undefined
    type?: string | undefined

    // React props
    href?: string | undefined
    precedence?: string | undefined
  }

  interface TableHTMLAttributes<T> extends HTMLAttributes<T> {
    align?: "left" | "center" | "right" | undefined
    bgcolor?: string | undefined
    border?: number | undefined
    cellPadding?: number | string | undefined
    cellSpacing?: number | string | undefined
    frame?: boolean | undefined
    rules?: "none" | "groups" | "rows" | "columns" | "all" | undefined
    summary?: string | undefined
    width?: number | string | undefined
  }

  interface TextareaHTMLAttributes<T> extends HTMLAttributes<T> {
    autoComplete?: string | undefined
    cols?: number | undefined
    dirName?: string | undefined
    disabled?: boolean | undefined
    form?: string | undefined
    maxLength?: number | undefined
    minLength?: number | undefined
    name?: string | undefined
    placeholder?: string | undefined
    readOnly?: boolean | undefined
    required?: boolean | undefined
    rows?: number | undefined
    value?: string | readonly string[] | number | undefined
    wrap?: string | undefined

    onChange?: ChangeEventHandler<T> | undefined
  }

  interface TdHTMLAttributes<T> extends HTMLAttributes<T> {
    align?: "left" | "center" | "right" | "justify" | "char" | undefined
    colSpan?: number | undefined
    headers?: string | undefined
    rowSpan?: number | undefined
    scope?: string | undefined
    abbr?: string | undefined
    height?: number | string | undefined
    width?: number | string | undefined
    valign?: "top" | "middle" | "bottom" | "baseline" | undefined
  }

  interface ThHTMLAttributes<T> extends HTMLAttributes<T> {
    align?: "left" | "center" | "right" | "justify" | "char" | undefined
    colSpan?: number | undefined
    headers?: string | undefined
    rowSpan?: number | undefined
    scope?: string | undefined
    abbr?: string | undefined
  }

  interface TimeHTMLAttributes<T> extends HTMLAttributes<T> {
    dateTime?: string | undefined
  }

  interface TrackHTMLAttributes<T> extends HTMLAttributes<T> {
    default?: boolean | undefined
    kind?: string | undefined
    label?: string | undefined
    src?: string | undefined
    srcLang?: string | undefined
  }

  interface VideoHTMLAttributes<T> extends MediaHTMLAttributes<T> {
    height?: number | string | undefined
    playsInline?: boolean | undefined
    poster?: string | undefined
    width?: number | string | undefined
    disablePictureInPicture?: boolean | undefined
    disableRemotePlayback?: boolean | undefined

    onResize?: ReactEventHandler<T> | undefined
    onResizeCapture?: ReactEventHandler<T> | undefined
  }

  // this list is "complete" in that it contains every SVG attribute
  // that React supports, but the types can be improved.
  // Full list here: https://facebook.github.io/react/docs/dom-elements.html
  //
  // The three broad type categories are (in order of restrictiveness):
  //   - "number | string"
  //   - "string"
  //   - union of string literals
  interface SVGAttributes<T> extends AriaAttributes, DOMAttributes<T> {
    // React-specific Attributes
    suppressHydrationWarning?: boolean | undefined

    // Attributes which also defined in HTMLAttributes
    // See comment in SVGDOMPropertyConfig.js
    className?: string | undefined
    color?: string | undefined
    height?: number | string | undefined
    id?: string | undefined
    lang?: string | undefined
    max?: number | string | undefined
    media?: string | undefined
    method?: string | undefined
    min?: number | string | undefined
    name?: string | undefined
    style?: CSSProperties | undefined
    target?: string | undefined
    type?: string | undefined
    width?: number | string | undefined

    // Other HTML properties supported by SVG elements in browsers
    role?: AriaRole | undefined
    tabIndex?: number | undefined
    crossOrigin?: CrossOrigin

    // SVG Specific attributes
    accentHeight?: number | string | undefined
    accumulate?: "none" | "sum" | undefined
    additive?: "replace" | "sum" | undefined
    alignmentBaseline?:
      | "auto"
      | "baseline"
      | "before-edge"
      | "text-before-edge"
      | "middle"
      | "central"
      | "after-edge"
      | "text-after-edge"
      | "ideographic"
      | "alphabetic"
      | "hanging"
      | "mathematical"
      | "inherit"
      | undefined
    allowReorder?: "no" | "yes" | undefined
    alphabetic?: number | string | undefined
    amplitude?: number | string | undefined
    arabicForm?: "initial" | "medial" | "terminal" | "isolated" | undefined
    ascent?: number | string | undefined
    attributeName?: string | undefined
    attributeType?: string | undefined
    autoReverse?: Booleanish | undefined
    azimuth?: number | string | undefined
    baseFrequency?: number | string | undefined
    baselineShift?: number | string | undefined
    baseProfile?: number | string | undefined
    bbox?: number | string | undefined
    begin?: number | string | undefined
    bias?: number | string | undefined
    by?: number | string | undefined
    calcMode?: number | string | undefined
    capHeight?: number | string | undefined
    clip?: number | string | undefined
    clipPath?: string | undefined
    clipPathUnits?: number | string | undefined
    clipRule?: number | string | undefined
    colorInterpolation?: number | string | undefined
    colorInterpolationFilters?:
      | "auto"
      | "sRGB"
      | "linearRGB"
      | "inherit"
      | undefined
    colorProfile?: number | string | undefined
    colorRendering?: number | string | undefined
    contentScriptType?: number | string | undefined
    contentStyleType?: number | string | undefined
    cursor?: number | string | undefined
    cx?: number | string | undefined
    cy?: number | string | undefined
    d?: string | undefined
    decelerate?: number | string | undefined
    descent?: number | string | undefined
    diffuseConstant?: number | string | undefined
    direction?: number | string | undefined
    display?: number | string | undefined
    divisor?: number | string | undefined
    dominantBaseline?:
      | "auto"
      | "use-script"
      | "no-change"
      | "reset-size"
      | "ideographic"
      | "alphabetic"
      | "hanging"
      | "mathematical"
      | "central"
      | "middle"
      | "text-after-edge"
      | "text-before-edge"
      | "inherit"
      | undefined
    dur?: number | string | undefined
    dx?: number | string | undefined
    dy?: number | string | undefined
    edgeMode?: number | string | undefined
    elevation?: number | string | undefined
    enableBackground?: number | string | undefined
    end?: number | string | undefined
    exponent?: number | string | undefined
    externalResourcesRequired?: Booleanish | undefined
    fill?: string | undefined
    fillOpacity?: number | string | undefined
    fillRule?: "nonzero" | "evenodd" | "inherit" | undefined
    filter?: string | undefined
    filterRes?: number | string | undefined
    filterUnits?: number | string | undefined
    floodColor?: number | string | undefined
    floodOpacity?: number | string | undefined
    focusable?: Booleanish | "auto" | undefined
    fontFamily?: string | undefined
    fontSize?: number | string | undefined
    fontSizeAdjust?: number | string | undefined
    fontStretch?: number | string | undefined
    fontStyle?: number | string | undefined
    fontVariant?: number | string | undefined
    fontWeight?: number | string | undefined
    format?: number | string | undefined
    fr?: number | string | undefined
    from?: number | string | undefined
    fx?: number | string | undefined
    fy?: number | string | undefined
    g1?: number | string | undefined
    g2?: number | string | undefined
    glyphName?: number | string | undefined
    glyphOrientationHorizontal?: number | string | undefined
    glyphOrientationVertical?: number | string | undefined
    glyphRef?: number | string | undefined
    gradientTransform?: string | undefined
    gradientUnits?: string | undefined
    hanging?: number | string | undefined
    horizAdvX?: number | string | undefined
    horizOriginX?: number | string | undefined
    href?: string | undefined
    ideographic?: number | string | undefined
    imageRendering?: number | string | undefined
    in2?: number | string | undefined
    in?: string | undefined
    intercept?: number | string | undefined
    k1?: number | string | undefined
    k2?: number | string | undefined
    k3?: number | string | undefined
    k4?: number | string | undefined
    k?: number | string | undefined
    kernelMatrix?: number | string | undefined
    kernelUnitLength?: number | string | undefined
    kerning?: number | string | undefined
    keyPoints?: number | string | undefined
    keySplines?: number | string | undefined
    keyTimes?: number | string | undefined
    lengthAdjust?: number | string | undefined
    letterSpacing?: number | string | undefined
    lightingColor?: number | string | undefined
    limitingConeAngle?: number | string | undefined
    local?: number | string | undefined
    markerEnd?: string | undefined
    markerHeight?: number | string | undefined
    markerMid?: string | undefined
    markerStart?: string | undefined
    markerUnits?: number | string | undefined
    markerWidth?: number | string | undefined
    mask?: string | undefined
    maskContentUnits?: number | string | undefined
    maskUnits?: number | string | undefined
    mathematical?: number | string | undefined
    mode?: number | string | undefined
    numOctaves?: number | string | undefined
    offset?: number | string | undefined
    opacity?: number | string | undefined
    operator?: number | string | undefined
    order?: number | string | undefined
    orient?: number | string | undefined
    orientation?: number | string | undefined
    origin?: number | string | undefined
    overflow?: number | string | undefined
    overlinePosition?: number | string | undefined
    overlineThickness?: number | string | undefined
    paintOrder?: number | string | undefined
    panose1?: number | string | undefined
    path?: string | undefined
    pathLength?: number | string | undefined
    patternContentUnits?: string | undefined
    patternTransform?: number | string | undefined
    patternUnits?: string | undefined
    pointerEvents?: number | string | undefined
    points?: string | undefined
    pointsAtX?: number | string | undefined
    pointsAtY?: number | string | undefined
    pointsAtZ?: number | string | undefined
    preserveAlpha?: Booleanish | undefined
    preserveAspectRatio?: string | undefined
    primitiveUnits?: number | string | undefined
    r?: number | string | undefined
    radius?: number | string | undefined
    refX?: number | string | undefined
    refY?: number | string | undefined
    renderingIntent?: number | string | undefined
    repeatCount?: number | string | undefined
    repeatDur?: number | string | undefined
    requiredExtensions?: number | string | undefined
    requiredFeatures?: number | string | undefined
    restart?: number | string | undefined
    result?: string | undefined
    rotate?: number | string | undefined
    rx?: number | string | undefined
    ry?: number | string | undefined
    scale?: number | string | undefined
    seed?: number | string | undefined
    shapeRendering?: number | string | undefined
    slope?: number | string | undefined
    spacing?: number | string | undefined
    specularConstant?: number | string | undefined
    specularExponent?: number | string | undefined
    speed?: number | string | undefined
    spreadMethod?: string | undefined
    startOffset?: number | string | undefined
    stdDeviation?: number | string | undefined
    stemh?: number | string | undefined
    stemv?: number | string | undefined
    stitchTiles?: number | string | undefined
    stopColor?: string | undefined
    stopOpacity?: number | string | undefined
    strikethroughPosition?: number | string | undefined
    strikethroughThickness?: number | string | undefined
    string?: number | string | undefined
    stroke?: string | undefined
    strokeDasharray?: string | number | undefined
    strokeDashoffset?: string | number | undefined
    strokeLinecap?: "butt" | "round" | "square" | "inherit" | undefined
    strokeLinejoin?: "miter" | "round" | "bevel" | "inherit" | undefined
    strokeMiterlimit?: number | string | undefined
    strokeOpacity?: number | string | undefined
    strokeWidth?: number | string | undefined
    surfaceScale?: number | string | undefined
    systemLanguage?: number | string | undefined
    tableValues?: number | string | undefined
    targetX?: number | string | undefined
    targetY?: number | string | undefined
    textAnchor?: "start" | "middle" | "end" | "inherit" | undefined
    textDecoration?: number | string | undefined
    textLength?: number | string | undefined
    textRendering?: number | string | undefined
    to?: number | string | undefined
    transform?: string | undefined
    u1?: number | string | undefined
    u2?: number | string | undefined
    underlinePosition?: number | string | undefined
    underlineThickness?: number | string | undefined
    unicode?: number | string | undefined
    unicodeBidi?: number | string | undefined
    unicodeRange?: number | string | undefined
    unitsPerEm?: number | string | undefined
    vAlphabetic?: number | string | undefined
    values?: string | undefined
    vectorEffect?: number | string | undefined
    version?: string | undefined
    vertAdvY?: number | string | undefined
    vertOriginX?: number | string | undefined
    vertOriginY?: number | string | undefined
    vHanging?: number | string | undefined
    vIdeographic?: number | string | undefined
    viewBox?: string | undefined
    viewTarget?: number | string | undefined
    visibility?: number | string | undefined
    vMathematical?: number | string | undefined
    widths?: number | string | undefined
    wordSpacing?: number | string | undefined
    writingMode?: number | string | undefined
    x1?: number | string | undefined
    x2?: number | string | undefined
    x?: number | string | undefined
    xChannelSelector?: string | undefined
    xHeight?: number | string | undefined
    xlinkActuate?: string | undefined
    xlinkArcrole?: string | undefined
    xlinkHref?: string | undefined
    xlinkRole?: string | undefined
    xlinkShow?: string | undefined
    xlinkTitle?: string | undefined
    xlinkType?: string | undefined
    xmlBase?: string | undefined
    xmlLang?: string | undefined
    xmlns?: string | undefined
    xmlnsXlink?: string | undefined
    xmlSpace?: string | undefined
    y1?: number | string | undefined
    y2?: number | string | undefined
    y?: number | string | undefined
    yChannelSelector?: string | undefined
    z?: number | string | undefined
    zoomAndPan?: string | undefined
  }

  interface WebViewHTMLAttributes<T> extends HTMLAttributes<T> {
    allowFullScreen?: boolean | undefined
    allowpopups?: boolean | undefined
    autosize?: boolean | undefined
    blinkfeatures?: string | undefined
    disableblinkfeatures?: string | undefined
    disableguestresize?: boolean | undefined
    disablewebsecurity?: boolean | undefined
    guestinstance?: string | undefined
    httpreferrer?: string | undefined
    nodeintegration?: boolean | undefined
    partition?: string | undefined
    plugins?: boolean | undefined
    preload?: string | undefined
    src?: string | undefined
    useragent?: string | undefined
    webpreferences?: string | undefined
  }

  // TODO: Move to react-dom
  type HTMLElementType =
    | "a"
    | "abbr"
    | "address"
    | "area"
    | "article"
    | "aside"
    | "audio"
    | "b"
    | "base"
    | "bdi"
    | "bdo"
    | "big"
    | "blockquote"
    | "body"
    | "br"
    | "button"
    | "canvas"
    | "caption"
    | "center"
    | "cite"
    | "code"
    | "col"
    | "colgroup"
    | "data"
    | "datalist"
    | "dd"
    | "del"
    | "details"
    | "dfn"
    | "dialog"
    | "div"
    | "dl"
    | "dt"
    | "em"
    | "embed"
    | "fieldset"
    | "figcaption"
    | "figure"
    | "footer"
    | "form"
    | "h1"
    | "h2"
    | "h3"
    | "h4"
    | "h5"
    | "h6"
    | "head"
    | "header"
    | "hgroup"
    | "hr"
    | "html"
    | "i"
    | "iframe"
    | "img"
    | "input"
    | "ins"
    | "kbd"
    | "keygen"
    | "label"
    | "legend"
    | "li"
    | "link"
    | "main"
    | "map"
    | "mark"
    | "menu"
    | "menuitem"
    | "meta"
    | "meter"
    | "nav"
    | "noscript"
    | "object"
    | "ol"
    | "optgroup"
    | "option"
    | "output"
    | "p"
    | "param"
    | "picture"
    | "pre"
    | "progress"
    | "q"
    | "rp"
    | "rt"
    | "ruby"
    | "s"
    | "samp"
    | "search"
    | "slot"
    | "script"
    | "section"
    | "select"
    | "small"
    | "source"
    | "span"
    | "strong"
    | "style"
    | "sub"
    | "summary"
    | "sup"
    | "table"
    | "template"
    | "tbody"
    | "td"
    | "textarea"
    | "tfoot"
    | "th"
    | "thead"
    | "time"
    | "title"
    | "tr"
    | "track"
    | "u"
    | "ul"
    | "var"
    | "video"
    | "wbr"
    | "webview"

  // TODO: Move to react-dom
  type SVGElementType =
    | "animate"
    | "circle"
    | "clipPath"
    | "defs"
    | "desc"
    | "ellipse"
    | "feBlend"
    | "feColorMatrix"
    | "feComponentTransfer"
    | "feComposite"
    | "feConvolveMatrix"
    | "feDiffuseLighting"
    | "feDisplacementMap"
    | "feDistantLight"
    | "feDropShadow"
    | "feFlood"
    | "feFuncA"
    | "feFuncB"
    | "feFuncG"
    | "feFuncR"
    | "feGaussianBlur"
    | "feImage"
    | "feMerge"
    | "feMergeNode"
    | "feMorphology"
    | "feOffset"
    | "fePointLight"
    | "feSpecularLighting"
    | "feSpotLight"
    | "feTile"
    | "feTurbulence"
    | "filter"
    | "foreignObject"
    | "g"
    | "image"
    | "line"
    | "linearGradient"
    | "marker"
    | "mask"
    | "metadata"
    | "path"
    | "pattern"
    | "polygon"
    | "polyline"
    | "radialGradient"
    | "rect"
    | "stop"
    | "svg"
    | "switch"
    | "symbol"
    | "text"
    | "textPath"
    | "tspan"
    | "use"
    | "view"

  //
  // Browser Interfaces
  // https://github.com/nikeee/2048-typescript/blob/master/2048/js/touch.d.ts
  // ----------------------------------------------------------------------

  interface AbstractView {
    styleMedia: StyleMedia
    document: Document
  }

  interface Touch {
    identifier: number
    target: EventTarget
    screenX: number
    screenY: number
    clientX: number
    clientY: number
    pageX: number
    pageY: number
  }

  interface TouchList {
    [index: number]: Touch
    length: number
    item(index: number): Touch
    identifiedTouch(identifier: number): Touch
  }

  //
  // Error Interfaces
  // ----------------------------------------------------------------------
  interface ErrorInfo {
    /**
     * Captures which component contained the exception, and its ancestors.
     */
    componentStack?: string | null
    digest?: string | null
  }

  // Keep in sync with JSX namespace in ./jsx-runtime.d.ts and ./jsx-dev-runtime.d.ts
  namespace JSX {
    type ElementType<P = any> = string | Component<P>
    interface ElementAttributesProperty {
      props: {}
    }
    interface ElementChildrenAttribute {
      children: {}
    }

    type LibraryManagedAttributes<C, P> =
      C extends Component<infer CP> ? Properties<CP> : P

    interface IntrinsicAttributes extends JsxRx.Attributes {}

    interface IntrinsicElements {
      // HTML
      a: JsxRx.DetailedHTMLProps<
        JsxRx.AnchorHTMLAttributes<HTMLAnchorElement>,
        HTMLAnchorElement
      >
      abbr: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      address: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      area: JsxRx.DetailedHTMLProps<
        JsxRx.AreaHTMLAttributes<HTMLAreaElement>,
        HTMLAreaElement
      >
      article: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      aside: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      audio: JsxRx.DetailedHTMLProps<
        JsxRx.AudioHTMLAttributes<HTMLAudioElement>,
        HTMLAudioElement
      >
      b: JsxRx.DetailedHTMLProps<JsxRx.HTMLAttributes<HTMLElement>, HTMLElement>
      base: JsxRx.DetailedHTMLProps<
        JsxRx.BaseHTMLAttributes<HTMLBaseElement>,
        HTMLBaseElement
      >
      bdi: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      bdo: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      big: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      blockquote: JsxRx.DetailedHTMLProps<
        JsxRx.BlockquoteHTMLAttributes<HTMLQuoteElement>,
        HTMLQuoteElement
      >
      body: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLBodyElement>,
        HTMLBodyElement
      >
      br: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLBRElement>,
        HTMLBRElement
      >
      button: JsxRx.DetailedHTMLProps<
        JsxRx.ButtonHTMLAttributes<HTMLButtonElement>,
        HTMLButtonElement
      >
      canvas: JsxRx.DetailedHTMLProps<
        JsxRx.CanvasHTMLAttributes<HTMLCanvasElement>,
        HTMLCanvasElement
      >
      caption: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      center: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      cite: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      code: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      col: JsxRx.DetailedHTMLProps<
        JsxRx.ColHTMLAttributes<HTMLTableColElement>,
        HTMLTableColElement
      >
      colgroup: JsxRx.DetailedHTMLProps<
        JsxRx.ColgroupHTMLAttributes<HTMLTableColElement>,
        HTMLTableColElement
      >
      data: JsxRx.DetailedHTMLProps<
        JsxRx.DataHTMLAttributes<HTMLDataElement>,
        HTMLDataElement
      >
      datalist: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLDataListElement>,
        HTMLDataListElement
      >
      dd: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      del: JsxRx.DetailedHTMLProps<
        JsxRx.DelHTMLAttributes<HTMLModElement>,
        HTMLModElement
      >
      details: JsxRx.DetailedHTMLProps<
        JsxRx.DetailsHTMLAttributes<HTMLDetailsElement>,
        HTMLDetailsElement
      >
      dfn: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      dialog: JsxRx.DetailedHTMLProps<
        JsxRx.DialogHTMLAttributes<HTMLDialogElement>,
        HTMLDialogElement
      >
      div: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLDivElement>,
        HTMLDivElement
      >
      dl: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLDListElement>,
        HTMLDListElement
      >
      dt: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      em: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      embed: JsxRx.DetailedHTMLProps<
        JsxRx.EmbedHTMLAttributes<HTMLEmbedElement>,
        HTMLEmbedElement
      >
      fieldset: JsxRx.DetailedHTMLProps<
        JsxRx.FieldsetHTMLAttributes<HTMLFieldSetElement>,
        HTMLFieldSetElement
      >
      figcaption: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      figure: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      footer: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      form: JsxRx.DetailedHTMLProps<
        JsxRx.FormHTMLAttributes<HTMLFormElement>,
        HTMLFormElement
      >
      h1: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLHeadingElement>,
        HTMLHeadingElement
      >
      h2: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLHeadingElement>,
        HTMLHeadingElement
      >
      h3: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLHeadingElement>,
        HTMLHeadingElement
      >
      h4: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLHeadingElement>,
        HTMLHeadingElement
      >
      h5: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLHeadingElement>,
        HTMLHeadingElement
      >
      h6: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLHeadingElement>,
        HTMLHeadingElement
      >
      head: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLHeadElement>,
        HTMLHeadElement
      >
      header: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      hgroup: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      hr: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLHRElement>,
        HTMLHRElement
      >
      html: JsxRx.DetailedHTMLProps<
        JsxRx.HtmlHTMLAttributes<HTMLHtmlElement>,
        HTMLHtmlElement
      >
      i: JsxRx.DetailedHTMLProps<JsxRx.HTMLAttributes<HTMLElement>, HTMLElement>
      iframe: JsxRx.DetailedHTMLProps<
        JsxRx.IframeHTMLAttributes<HTMLIFrameElement>,
        HTMLIFrameElement
      >
      img: JsxRx.DetailedHTMLProps<
        JsxRx.ImgHTMLAttributes<HTMLImageElement>,
        HTMLImageElement
      >
      input: JsxRx.DetailedHTMLProps<
        JsxRx.InputHTMLAttributes<HTMLInputElement>,
        HTMLInputElement
      >
      ins: JsxRx.DetailedHTMLProps<
        JsxRx.InsHTMLAttributes<HTMLModElement>,
        HTMLModElement
      >
      kbd: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      keygen: JsxRx.DetailedHTMLProps<
        JsxRx.KeygenHTMLAttributes<HTMLElement>,
        HTMLElement
      >
      label: JsxRx.DetailedHTMLProps<
        JsxRx.LabelHTMLAttributes<HTMLLabelElement>,
        HTMLLabelElement
      >
      legend: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLLegendElement>,
        HTMLLegendElement
      >
      li: JsxRx.DetailedHTMLProps<
        JsxRx.LiHTMLAttributes<HTMLLIElement>,
        HTMLLIElement
      >
      link: JsxRx.DetailedHTMLProps<
        JsxRx.LinkHTMLAttributes<HTMLLinkElement>,
        HTMLLinkElement
      >
      main: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      map: JsxRx.DetailedHTMLProps<
        JsxRx.MapHTMLAttributes<HTMLMapElement>,
        HTMLMapElement
      >
      mark: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      menu: JsxRx.DetailedHTMLProps<
        JsxRx.MenuHTMLAttributes<HTMLElement>,
        HTMLElement
      >
      menuitem: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      meta: JsxRx.DetailedHTMLProps<
        JsxRx.MetaHTMLAttributes<HTMLMetaElement>,
        HTMLMetaElement
      >
      meter: JsxRx.DetailedHTMLProps<
        JsxRx.MeterHTMLAttributes<HTMLMeterElement>,
        HTMLMeterElement
      >
      nav: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      noindex: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      noscript: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      object: JsxRx.DetailedHTMLProps<
        JsxRx.ObjectHTMLAttributes<HTMLObjectElement>,
        HTMLObjectElement
      >
      ol: JsxRx.DetailedHTMLProps<
        JsxRx.OlHTMLAttributes<HTMLOListElement>,
        HTMLOListElement
      >
      optgroup: JsxRx.DetailedHTMLProps<
        JsxRx.OptgroupHTMLAttributes<HTMLOptGroupElement>,
        HTMLOptGroupElement
      >
      option: JsxRx.DetailedHTMLProps<
        JsxRx.OptionHTMLAttributes<HTMLOptionElement>,
        HTMLOptionElement
      >
      output: JsxRx.DetailedHTMLProps<
        JsxRx.OutputHTMLAttributes<HTMLOutputElement>,
        HTMLOutputElement
      >
      p: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLParagraphElement>,
        HTMLParagraphElement
      >
      param: JsxRx.DetailedHTMLProps<
        JsxRx.ParamHTMLAttributes<HTMLParamElement>,
        HTMLParamElement
      >
      picture: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      pre: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLPreElement>,
        HTMLPreElement
      >
      progress: JsxRx.DetailedHTMLProps<
        JsxRx.ProgressHTMLAttributes<HTMLProgressElement>,
        HTMLProgressElement
      >
      q: JsxRx.DetailedHTMLProps<
        JsxRx.QuoteHTMLAttributes<HTMLQuoteElement>,
        HTMLQuoteElement
      >
      rp: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      rt: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      ruby: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      s: JsxRx.DetailedHTMLProps<JsxRx.HTMLAttributes<HTMLElement>, HTMLElement>
      samp: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      search: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      slot: JsxRx.DetailedHTMLProps<
        JsxRx.SlotHTMLAttributes<HTMLSlotElement>,
        HTMLSlotElement
      >
      script: JsxRx.DetailedHTMLProps<
        JsxRx.ScriptHTMLAttributes<HTMLScriptElement>,
        HTMLScriptElement
      >
      section: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      select: JsxRx.DetailedHTMLProps<
        JsxRx.SelectHTMLAttributes<HTMLSelectElement>,
        HTMLSelectElement
      >
      small: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      source: JsxRx.DetailedHTMLProps<
        JsxRx.SourceHTMLAttributes<HTMLSourceElement>,
        HTMLSourceElement
      >
      span: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLSpanElement>,
        HTMLSpanElement
      >
      strong: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      style: JsxRx.DetailedHTMLProps<
        JsxRx.StyleHTMLAttributes<HTMLStyleElement>,
        HTMLStyleElement
      >
      sub: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      summary: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      sup: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      table: JsxRx.DetailedHTMLProps<
        JsxRx.TableHTMLAttributes<HTMLTableElement>,
        HTMLTableElement
      >
      template: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLTemplateElement>,
        HTMLTemplateElement
      >
      tbody: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLTableSectionElement>,
        HTMLTableSectionElement
      >
      td: JsxRx.DetailedHTMLProps<
        JsxRx.TdHTMLAttributes<HTMLTableDataCellElement>,
        HTMLTableDataCellElement
      >
      textarea: JsxRx.DetailedHTMLProps<
        JsxRx.TextareaHTMLAttributes<HTMLTextAreaElement>,
        HTMLTextAreaElement
      >
      tfoot: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLTableSectionElement>,
        HTMLTableSectionElement
      >
      th: JsxRx.DetailedHTMLProps<
        JsxRx.ThHTMLAttributes<HTMLTableHeaderCellElement>,
        HTMLTableHeaderCellElement
      >
      thead: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLTableSectionElement>,
        HTMLTableSectionElement
      >
      time: JsxRx.DetailedHTMLProps<
        JsxRx.TimeHTMLAttributes<HTMLTimeElement>,
        HTMLTimeElement
      >
      title: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLTitleElement>,
        HTMLTitleElement
      >
      tr: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLTableRowElement>,
        HTMLTableRowElement
      >
      track: JsxRx.DetailedHTMLProps<
        JsxRx.TrackHTMLAttributes<HTMLTrackElement>,
        HTMLTrackElement
      >
      u: JsxRx.DetailedHTMLProps<JsxRx.HTMLAttributes<HTMLElement>, HTMLElement>
      ul: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLUListElement>,
        HTMLUListElement
      >
      var: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      video: JsxRx.DetailedHTMLProps<
        JsxRx.VideoHTMLAttributes<HTMLVideoElement>,
        HTMLVideoElement
      >
      wbr: JsxRx.DetailedHTMLProps<
        JsxRx.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      webview: JsxRx.DetailedHTMLProps<
        JsxRx.WebViewHTMLAttributes<HTMLWebViewElement>,
        HTMLWebViewElement
      >

      // SVG
      svg: JsxRx.SVGProps<SVGSVGElement>

      animate: JsxRx.SVGProps<SVGElement> // TODO: It is SVGAnimateElement but is not in TypeScript's lib.dom.d.ts for now.
      animateMotion: JsxRx.SVGProps<SVGElement>
      animateTransform: JsxRx.SVGProps<SVGElement> // TODO: It is SVGAnimateTransformElement but is not in TypeScript's lib.dom.d.ts for now.
      circle: JsxRx.SVGProps<SVGCircleElement>
      clipPath: JsxRx.SVGProps<SVGClipPathElement>
      defs: JsxRx.SVGProps<SVGDefsElement>
      desc: JsxRx.SVGProps<SVGDescElement>
      ellipse: JsxRx.SVGProps<SVGEllipseElement>
      feBlend: JsxRx.SVGProps<SVGFEBlendElement>
      feColorMatrix: JsxRx.SVGProps<SVGFEColorMatrixElement>
      feComponentTransfer: JsxRx.SVGProps<SVGFEComponentTransferElement>
      feComposite: JsxRx.SVGProps<SVGFECompositeElement>
      feConvolveMatrix: JsxRx.SVGProps<SVGFEConvolveMatrixElement>
      feDiffuseLighting: JsxRx.SVGProps<SVGFEDiffuseLightingElement>
      feDisplacementMap: JsxRx.SVGProps<SVGFEDisplacementMapElement>
      feDistantLight: JsxRx.SVGProps<SVGFEDistantLightElement>
      feDropShadow: JsxRx.SVGProps<SVGFEDropShadowElement>
      feFlood: JsxRx.SVGProps<SVGFEFloodElement>
      feFuncA: JsxRx.SVGProps<SVGFEFuncAElement>
      feFuncB: JsxRx.SVGProps<SVGFEFuncBElement>
      feFuncG: JsxRx.SVGProps<SVGFEFuncGElement>
      feFuncR: JsxRx.SVGProps<SVGFEFuncRElement>
      feGaussianBlur: JsxRx.SVGProps<SVGFEGaussianBlurElement>
      feImage: JsxRx.SVGProps<SVGFEImageElement>
      feMerge: JsxRx.SVGProps<SVGFEMergeElement>
      feMergeNode: JsxRx.SVGProps<SVGFEMergeNodeElement>
      feMorphology: JsxRx.SVGProps<SVGFEMorphologyElement>
      feOffset: JsxRx.SVGProps<SVGFEOffsetElement>
      fePointLight: JsxRx.SVGProps<SVGFEPointLightElement>
      feSpecularLighting: JsxRx.SVGProps<SVGFESpecularLightingElement>
      feSpotLight: JsxRx.SVGProps<SVGFESpotLightElement>
      feTile: JsxRx.SVGProps<SVGFETileElement>
      feTurbulence: JsxRx.SVGProps<SVGFETurbulenceElement>
      filter: JsxRx.SVGProps<SVGFilterElement>
      foreignObject: JsxRx.SVGProps<SVGForeignObjectElement>
      g: JsxRx.SVGProps<SVGGElement>
      image: JsxRx.SVGProps<SVGImageElement>
      line: JsxRx.SVGLineElementAttributes<SVGLineElement>
      linearGradient: JsxRx.SVGProps<SVGLinearGradientElement>
      marker: JsxRx.SVGProps<SVGMarkerElement>
      mask: JsxRx.SVGProps<SVGMaskElement>
      metadata: JsxRx.SVGProps<SVGMetadataElement>
      mpath: JsxRx.SVGProps<SVGElement>
      path: JsxRx.SVGProps<SVGPathElement>
      pattern: JsxRx.SVGProps<SVGPatternElement>
      polygon: JsxRx.SVGProps<SVGPolygonElement>
      polyline: JsxRx.SVGProps<SVGPolylineElement>
      radialGradient: JsxRx.SVGProps<SVGRadialGradientElement>
      rect: JsxRx.SVGProps<SVGRectElement>
      set: JsxRx.SVGProps<SVGSetElement>
      stop: JsxRx.SVGProps<SVGStopElement>
      switch: JsxRx.SVGProps<SVGSwitchElement>
      symbol: JsxRx.SVGProps<SVGSymbolElement>
      text: JsxRx.SVGTextElementAttributes<SVGTextElement>
      textPath: JsxRx.SVGProps<SVGTextPathElement>
      tspan: JsxRx.SVGProps<SVGTSpanElement>
      use: JsxRx.SVGProps<SVGUseElement>
      view: JsxRx.SVGProps<SVGViewElement>
    }
  }
}
