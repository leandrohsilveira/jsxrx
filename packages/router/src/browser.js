/**
 * @import { Route, RouteBasic, RouteOptions, Routes, RouteWithChildrenOptions, RouteWithProps } from "./types.js"
 * @import { Component, WithChildren } from "@jsxrx/core"
 */

/**
 * @template {string} K
 * @param {...K} keys
 */
export function params(...keys) {
  return keys
}

/**
 * @overload
 * @param {Component<unknown>} component
 * @returns {RouteBasic<unknown>}
 */
/**
 * @template {Record<string, unknown>} Props
 * @template {string} Path
 * @template {string} Query
 * @overload
 * @param {Component<Props>} component
 * @param {RouteOptions<Props, Path, Query>} options
 * @returns {RouteWithProps<Props, Path, Query>}
 */
/**
 * @template Props
 * @template {string} Path
 * @template {string} Query
 * @param {Component<Props> | Component<WithChildren> | Component<unknown>} component
 * @param {RouteOptions<Props, Path, Query> | RouteWithChildrenOptions} [options]
 * @returns {Route<Props, Path, Query>}
 */
export function route(component, options) {
  return /** @type {*} */ ({
    ...options,
    component,
  })
}

/**
 * @param {Routes} input
 */
export function defineRoutes(input) {
  return input
}
