/**
 * @import {  Plugin } from "vite"
 */

import { transform } from "@jsxrx/compiler"
import { generate } from "escodegen"

/**
 * @returns {Plugin}
 */
export function jsxRX() {
  let shouldTransform = false
  return {
    name: 'vite-plugin-jsxrx',
    config() {
      return {
        esbuild: {
          jsx: 'automatic',
          jsxImportSource: '@jsxrx/core'
        }
      }
    },
    configResolved(config) {
      shouldTransform = config.command === 'build'
    },
    transform(code, id) {
      if (!shouldTransform || !/\.(jsx|tsx)$/.test(id)) {
        return null
      }

      const ast = this.parse(code, { jsx: true });

      const transformed = transform(ast, id)

      const output = generate(transformed)

      return {
        ast: this.parse(output),
        code: output
      }

    }
  }
}
