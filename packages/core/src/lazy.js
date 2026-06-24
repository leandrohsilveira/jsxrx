import { from, map } from "rxjs"
import { Props } from "./component"
import { RenderComponentNode } from "./vdom"
import { assert } from "@jsxrx/utils"

/**
  * @import { Component } from "./jsx"
 * /

/**
  * @template {'default'} N
  * @template {Record<N, Component<*>>} T
  * @overload
  * @param {() => Promise<T>} importer 
  * @returns {T[N]}
  */
/**
 * @template {string} N
 * @template {Record<N, Component<*>>} T
 * @overload
 * @param {() => Promise<T>} importer
 * @param {N} name
 * @returns {T[N]}
 */
/**
 * @template {string} N
 * @template {Record<N, Component<*>>} T
 * @param {() => Promise<T>} importer
 * @param {N} [name='default']
 * @returns {T[N]}
 */
export function lazy(importer, name) {
  /** @type {Component<*>} */
  const LazyComponent = props$ => {
    return Props.spread(props$).pipe(
      map(props =>
        from(importer()).pipe(
          map(mod => {
            const modName = name ?? "default"
            assert(
              modName in mod,
              `Lazy component module "${modName}" does not exists`,
            )
            return mod[/** @type {N} */ (modName)]
          }),
          map(
            component =>
              new RenderComponentNode(
                `lazy:${component.displayName ?? component.name}`,
                component,
                props,
                null,
              ),
          ),
        ),
      ),
    )
  }

  LazyComponent.displayName = "LazyComponent"

  return /** @type {*} */ (LazyComponent)
}
