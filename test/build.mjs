// Bundles the unit tests (test/unit/*.test.ts) into test/out/unit.js, run with
// `node --test test/out/unit.js`.
import esbuild from 'esbuild';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tests = readdirSync(`${root}/test/unit`).filter((f) => f.endsWith('.test.ts')).sort();
await esbuild.build({
  absWorkingDir: root,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  logLevel: 'warning',
  stdin: { contents: tests.map((f) => `import './${f}';`).join('\n'), resolveDir: `${root}/test/unit`, loader: 'ts', sourcefile: 'unit-tests.ts' },
  outfile: 'test/out/unit.js',
});
