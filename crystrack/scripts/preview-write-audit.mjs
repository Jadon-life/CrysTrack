/** Static inventory only; importing or running this script never calls any service. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function sourceFiles(folder) {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap((item) => {
    const location = path.join(folder, item.name);
    return item.isDirectory() ? sourceFiles(location) : /\.(tsx?|mjs)$/.test(item.name) ? [location] : [];
  });
}
export function apiWriterInventory() {
  return sourceFiles(path.join(ROOT, 'src/app/api')).flatMap((file) => {
    const src = fs.readFileSync(file, 'utf8');
    const methods = [...src.matchAll(/export\s+(?:async\s+)?function\s+(POST|PUT|PATCH|DELETE)\b/g)].map((match) => match[1]);
    // Callback GET exchanges a code for a session, so GET alone is not a safe allowlist.
    if (file.endsWith('/api/auth/callback/route.ts')) methods.push('GET');
    return methods.length ? [{ file: path.relative(ROOT, file), methods }] : [];
  }).sort((a, b) => a.file.localeCompare(b.file));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(apiWriterInventory(), null, 2));
}
