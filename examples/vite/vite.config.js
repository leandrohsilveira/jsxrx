import { defineConfig } from "vite"
import { jsxRX } from "@jsxrx/vite-plugin"
import { analyzer } from "vite-bundle-analyzer"
import { env } from "node:process"

export default defineConfig(() => ({
  plugins: [
    jsxRX(),
    analyzer({ enabled: env.VITE_PLUGIN_ENABLE_ANALYZER === "true" }),
  ],
}))
