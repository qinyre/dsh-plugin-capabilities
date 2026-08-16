/**
 * Build the node half to lib/index.js (single ESM bundle).
 *
 * External: the host's cordis (peer dependency resolved by the profile) and
 * node builtins. Everything else is inlined, so the published package is
 * self-contained on the host side.
 */
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

await build({
  entryPoints: [join(root, 'src', 'index.ts')],
  outfile: join(root, 'lib', 'index.js'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  // yaml stays external: bundling its CJS dist into the ESM output makes
  // esbuild's require shim throw "Dynamic require of process" under the
  // loader's real-ESM import. The profile installs it from "dependencies".
  // skill-filesystem is dynamically imported as a host-plane provider.
  external: ['@deepseek-ai/cordis', 'yaml', '@deepseek-ai/dsh-skill-filesystem'],
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
  },
  logLevel: 'info',
})

console.log('[dsh-plugin-capabilities] node half written to lib/index.js')