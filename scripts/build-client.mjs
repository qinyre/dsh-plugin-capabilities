/**
 * Build the client bundle to lib/client.js.
 *
 * The bundle is a closure-factory artifact for the dsh web shell:
 * - externals resolve through the injected require (the loader module table:
 *   react, cordis, @deepseek-ai/dsh-client-ui-* — never bundled);
 * - the CJS-style factory wrapper matches what the host's client-modules
 *   loader expects (loader table entries only; no globals).
 */
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const id = 'dsh-plugin-capabilities'

// Mirror the host's platform module table (packages/client/web/src/platform.ts
// + the runtime store exemption). Anything else under @deepseek-ai/* that the
// bundle touches must be type-only (erased) — this client has no other
// runtime @deepseek-ai imports.
const platformModules = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
  '@deepseek-ai/dsh-client-runtime/client',
]

const banner = `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {\nvar module = { exports: {} }; var exports = module.exports;`
const footer = '\nreturn module.exports; } });'

await build({
  entryPoints: [join(root, 'src', 'client', 'index.ts')],
  outfile: join(root, 'lib', 'client.js'),
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  sourcemap: true,
  external: platformModules,
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
  },
  banner: { js: banner },
  footer: { js: footer },
  logLevel: 'info',
})

console.log(`[dsh-plugin-capabilities] client bundle written to lib/client.js (${id})`)