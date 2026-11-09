import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = [];
function visit(directory) {
  for (const item of readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const relative = path.join(directory, item.name);
    if (item.isDirectory()) visit(relative);
    else if (item.name.endsWith('.mjs')) files.push(relative);
  }
}
for (const directory of ['src', 'scripts', 'tests']) visit(directory);
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });
  if (result.status !== 0) { console.error(file, result.stderr); process.exit(1); }
}
console.log(`Syntax OK: ${files.length} JavaScript modules.`);
const result = spawnSync(process.execPath, ['--test'], { cwd: root, encoding: 'utf8' });
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.status ?? 1;
