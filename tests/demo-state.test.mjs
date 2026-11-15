import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const source = fs.readFileSync(new URL('../app/demo-state.ts', import.meta.url), 'utf8');
const compiled = stripTypeScriptTypes(source);
const { restoreDemoState, restoreSavedIds, getDemoSeller } =
  await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

const seller = {
  id: 'demo-seller', name: 'Original seller', role: 'seller', phone: '',
  payment_method: 'Cash', payment_instructions: 'Pay at pickup', suspended: false,
};
const listing = {
  id: 'demo-1', seller_id: seller.id, title: 'Chair', description: 'A chair',
  price: 100, negotiable: false, category: 'Home', location: 'Lagos',
  condition: 'Used', images: ['https://example.test/chair.jpg'],
  status: 'active', created_at: '2026-10-28T00:00:00Z',
};
const defaults = {
  items: [listing], users: [seller], audit: [], reports: [],
  settings: {
    site_name: 'Marketplace', hero_title: 'Welcome', hero_subtitle: 'Buy and sell',
    payment_mode: 'seller', payment_instructions: '', categories: ['Home'],
  },
};

test('wrong-shaped stored collections and settings recover without render errors', () => {
  const state = restoreDemoState(JSON.parse('{"items":{},"users":"bad","settings":{"categories":{}},"audit":false,"reports":42}'), defaults);
  assert.deepEqual(state, defaults);
  assert.deepEqual(restoreSavedIds(JSON.parse('{}')), []);
  assert.equal(state.items.filter(item => item.status === 'active').length, 1);
  assert.deepEqual([...state.settings.categories], ['Home']);
  for (const value of [null, undefined, false, 42, 'bad', []]) {
    assert.deepEqual(restoreDemoState(value, defaults), defaults);
  }
});

test('malformed records are skipped while usable persisted records survive', () => {
  const audit = { id: 'audit-1', action: 'remove', created_at: listing.created_at, details: { id: listing.id } };
  const report = { id: 'report-1', listing_id: listing.id, reason: 'Incorrect item', status: 'open' };
  const state = restoreDemoState({
    items: [null, {}, { ...listing, images: [null] }, listing],
    users: [{ ...seller, name: {} }, seller],
    audit: [audit, { ...audit, details: { reason: {} } }],
    reports: [null, { ...report, reason: {} }, report],
  }, defaults);
  assert.deepEqual(state.items, [listing]);
  assert.deepEqual(state.users, [seller]);
  assert.deepEqual(state.audit, [audit]);
  assert.deepEqual(state.reports, [report]);
  assert.deepEqual(restoreSavedIds([null, listing.id, {}, 4]), [listing.id]);
});

test('valid saved demo state including an intentionally empty marketplace is preserved', () => {
  const stored = JSON.parse(JSON.stringify({
    ...defaults,
    items: [],
    settings: { ...defaults.settings, site_name: 'My marketplace', categories: ['Books'] },
  }));
  assert.deepEqual(restoreDemoState(stored, defaults), stored);
});

test('demo sign-in restores edited profile and payment details after a reload', () => {
  const editedSeller = {
    ...seller, name: 'Updated seller', phone: '+2348012345678',
    payment_method: 'Bank transfer', payment_instructions: 'Confirm with me first',
  };
  const stored = JSON.parse(JSON.stringify({ ...defaults, users: [editedSeller] }));
  const restored = restoreDemoState(stored, defaults);
  assert.deepEqual(getDemoSeller(restored.users, seller), editedSeller);
  assert.equal(getDemoSeller([], seller), seller);
});
