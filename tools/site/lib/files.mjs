// File helpers: walk a folder (sorted, forward slashes) and read or write bytes.
import fs from 'node:fs';
import path from 'node:path';

export function walk(dir, base = dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base, out);
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

export function readBytes(file) {
  return fs.existsSync(file) ? fs.readFileSync(file) : null;
}
