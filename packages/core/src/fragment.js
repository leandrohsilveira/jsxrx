/**
 * @import { Component, PropsWithChildren } from "./jsx"
 */

import { map } from "rxjs"

/** @type {Component<PropsWithChildren<{}>>} */
export const Fragment = ({ props$ }) => {
  return props$.pipe(map(({ children }) => children))
}
