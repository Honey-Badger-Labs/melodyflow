import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const m = JSON.parse(readFileSync(new URL('manifest.webmanifest', root), 'utf8'));
const hasAny = i => !i.purpose || i.purpose.split(/\s+/).includes('any');
const png = (size, pred) => m.icons.find(i => i.type === 'image/png' && i.sizes.split(/\s+/).includes(size) && pred(i));

function pngSize(file) {
  const b = readFileSync(new URL(file, root));
  assert.equal(b.toString('ascii', 1, 4), 'PNG', file + ' is not a PNG');
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

test('manifest has 192 and 512 PNG icons with purpose any (Chrome installability)', () => {
  assert.ok(png('192x192', hasAny), 'missing 192x192 any PNG');
  assert.ok(png('512x512', hasAny), 'missing 512x512 any PNG');
  assert.ok(png('512x512', i => (i.purpose || '').includes('maskable')), 'missing maskable 512');
});

test('icon-512.png exists and is 512x512', () => {
  assert.deepEqual(pngSize('icon-512.png'), [512, 512]);
  assert.deepEqual(pngSize('icon-192.png'), [192, 192]);
});

test('manifest identity and display unchanged', () => {
  assert.equal(m.id, '/melodyflow/');
  assert.equal(m.display, 'standalone');
  assert.equal(m.orientation, 'any');
  assert.equal(m.start_url, '.');
  assert.equal(m.scope, '.');
});

test('index.html wires an install prompt and hint', () => {
  const h = readFileSync(new URL('index.html', root), 'utf8');
  assert.match(h, /beforeinstallprompt/);
  assert.match(h, /Install MelodyFlow/);
  assert.match(h, /Add to Home Screen/);
  assert.match(h, /display-mode: standalone/);
});
