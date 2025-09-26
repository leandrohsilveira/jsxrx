import * as JsxRx from "./jsx";

export { JSX } from "./jsx-runtime"

export interface JSXSource {
  /**
   * The source file where the element originates from.
   */
  fileName?: string | undefined;

  /**
   * The line number where the element was created.
   */
  lineNumber?: number | undefined;

  /**
   * The column number where the element was created.
   */
  columnNumber?: number | undefined;
}

/**
 * Create a React element.
 *
 * You should not use this function directly. Use JSX and a transpiler instead.
 */
export function Fragment(
  key: JsxRx.Key | undefined,
  isStatic: boolean,
  source?: JSXSource,
  self?: unknown,
): JsxRx.ElementNode;

/**
 * Create a React element.
 *
 * You should not use this function directly. Use JSX and a transpiler instead.
 */
export function jsxDEV(
  type: JsxRx.ElementType,
  props: unknown,
  key: JsxRx.Key | undefined,
  isStatic: boolean,
  source?: JSXSource,
  self?: unknown,
): JsxRx.ElementNode;
