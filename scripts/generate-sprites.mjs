// scripts/generate-sprites.mjs
// Genera los PNG fuente de `assets-src/sprites/` (doc 06 §3) a partir de los modelos de
// `scripts/sprites/`. Usa el propio Vite del proyecto para cargar los módulos TypeScript.
//   node scripts/generate-sprites.mjs            → todos
//   node scripts/generate-sprites.mjs tile hat_  → solo los que contienen esos textos
//   node scripts/generate-sprites.mjs --svg      → guarda también los SVG intermedios
import { createServer } from 'vite';

const args = process.argv.slice(2);
const keepSvg = args.includes('--svg');
const only = args.filter((a) => !a.startsWith('--'));

const server = await createServer({
  configFile: false,
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const { generate } = await server.ssrLoadModule('/scripts/sprites/index.ts');
  await generate({ outDir: 'assets-src/sprites', only, keepSvg });
} finally {
  await server.close();
}
