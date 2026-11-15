import fs from 'node:fs';
import path from 'node:path';

const input = path.resolve('MAU-Connect-Source-Code.md');
const markdown = fs.readFileSync(input, 'utf8');
const pattern = /## File: `([^`]+)`\s+````[^\n]*\n([\s\S]*?)\n````/g;
let match;
const files = [];
const paths = new Set();
while ((match = pattern.exec(markdown))) {
  const relative = match[1];
  if (relative.includes('..') || path.isAbsolute(relative)) throw new Error(`Unsafe path: ${relative}`);
  const target = path.resolve(relative);
  const root = path.resolve('.') + path.sep;
  if (!target.startsWith(root)) throw new Error(`Unsafe target: ${relative}`);
  const normalized = target.toLowerCase();
  if (paths.has(normalized)) throw new Error(`Duplicate path: ${relative}`);
  paths.add(normalized);
  const content = match[2] + '\n';
  if (fs.existsSync(target)) {
    if (fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n') !== content.replace(/\r\n/g, '\n')) {
      throw new Error(`Refusing to overwrite modified file: ${relative}. Existing project files have been preserved.`);
    }
    continue;
  }
  files.push({ target, content });
}
if (!paths.size) throw new Error('No labeled code blocks found');
// Validate the whole bundle before creating anything. Never replace local edits.
for (const { target, content } of files) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, { flag: 'wx' });
}
console.log(`Extracted ${files.length} new files; preserved ${paths.size - files.length} existing files`);
