import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const source = fs.readFileSync(new URL('../app/saved-listings.ts', import.meta.url), 'utf8');
const compiled = stripTypeScriptTypes(source);
const { restoreSavedIds } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

test('malformed browser storage cannot become saved listing IDs', () => {
  for (const value of [null, undefined, false, 42, 'listing-1', {}, { ids: ['listing-1'] }]) {
    assert.deepEqual(restoreSavedIds(value), []);
  }
});

test('saved listings keep unique valid IDs and discard malformed entries', () => {
  assert.deepEqual(restoreSavedIds(['listing-1', null, {}, 4, '', 'listing-1', 'listing-2']), ['listing-1', 'listing-2']);
  assert.deepEqual(restoreSavedIds([]), []);
});
