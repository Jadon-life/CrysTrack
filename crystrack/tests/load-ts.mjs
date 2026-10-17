import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
export function loadTs(file, mocks = {}, cache = new Map()) {
  const full = path.resolve(file);
  if (cache.has(full)) return cache.get(full).exports;
  const loaded = { exports: {} };
  cache.set(full, loaded);
  const native = createRequire(full);
  const require = (id) => {
    if (Object.hasOwn(mocks, id)) return mocks[id];
    if (id.startsWith('@/') || id.startsWith('.')) {
      const target = id.startsWith('@/')
        ? path.resolve('src', id.slice(2))
        : path.resolve(path.dirname(full), id);
      const resolved = [target, `${target}.ts`, `${target}/index.ts`].find(
        (v) => fs.existsSync(v) && fs.statSync(v).isFile(),
      );
      if (resolved?.endsWith('.ts')) return loadTs(resolved, mocks, cache);
    }
    return native(id);
  };
  const code = ts.transpileModule(fs.readFileSync(full, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  new Function('require', 'module', 'exports', code)(
    require,
    loaded,
    loaded.exports,
  );
  return loaded.exports;
}
