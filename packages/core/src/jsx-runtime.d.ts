/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-empty-object-type */

import JsxRx, { ElementNode } from "./jsx";

export namespace JSX {
  type ElementType<P extends JsxRx.Obj = any> = JsxRx.JSX.ElementType<P>;
  type Element<P extends JsxRx.Obj = any, T extends string = any> = JsxRx.Element<P, T>;
  interface ElementAttributesProperty extends JsxRx.JSX.ElementAttributesProperty { }
  interface ElementChildrenAttribute extends JsxRx.JSX.ElementChildrenAttribute { }
  type LibraryManagedAttributes<C, P> = JsxRx.JSX.LibraryManagedAttributes<C, P>;
  interface IntrinsicAttributes extends JsxRx.JSX.IntrinsicAttributes { }
  interface IntrinsicClassAttributes<T> extends JsxRx.JSX.IntrinsicClassAttributes<T> { }
  interface IntrinsicElements extends JsxRx.JSX.IntrinsicElements { }
}

/**
 * Create a React element.
 *
 * You should not use this function directly. Use JSX and a transpiler instead.
 */
export const Fragment: symbol

/**
 * Create a React element.
 *
 * You should not use this function directly. Use JSX and a transpiler instead.
 */
export function jsx(
  type: JsxRx.ElementType,
  props: unknown,
  key: JsxRx.Key | undefined,
): ElementNode;

/**
 * Create a React element.
 *
 * You should not use this function directly. Use JSX and a transpiler instead.
 */
export function jsxs(
  type: JsxRx.ElementType,
  props: unknown,
  key: JsxRx.Key | undefined,
): ElementNode;
