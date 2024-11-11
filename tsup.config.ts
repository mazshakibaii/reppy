import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  shims: true,
  splitting: false,
  sourcemap: true,
  noExternal: ["log-symbols", "is-unicode-supported", "chalk"],
  banner: {
    js: `#!/usr/bin/env node
'use strict';`,
  },
  esbuildOptions(options) {
    options.platform = "node"
  },
  target: "node20",
  minify: false,
})
