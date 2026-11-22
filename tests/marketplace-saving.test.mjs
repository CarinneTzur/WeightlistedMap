import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const storage = new Map();
globalThis.window = {
 localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
 dispatchEvent() {},
};
globalThis.CustomEvent ??= class { constructor(type) { this.type = type; } };
let rpcResult;
globalThis.testSupabase = {
 auth: { getUser: async () => ({ data: { user: { id: 'client' } } }) },
 rpc: async () => rpcResult,
};
const source = (await readFile(new URL('../src/services/conversationStore.js', import.meta.url), 'utf8'))
 .replace('import { isSupabaseConfigured, supabase } from "../lib/supabase";',
 'const isSupabaseConfigured = true; const supabase = globalThis.testSupabase;');
const store = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('rejected saves and claims do not create local success records', async () => {
 storage.clear();
 rpcResult = { error: new Error('Permission denied') };
 await assert.rejects(store.saveServiceRequest({ id: 'service-request-test' }), /Permission denied/);
 await assert.rejects(store.claimServiceRequest('service-request-test', { id: 'coach' }), /Permission denied/);
 await assert.rejects(store.appendDirectMessage({ id: '11111111-1111-4111-8111-111111111111' }, { text: 'draft' }, { id: 'client' }), /Permission denied/);
 assert.equal(storage.size, 0);
});

test('confirmed service save uses server values', async () => {
 storage.clear();
 rpcResult = { data: [{ id: 'service-request-test', request_status: 'awaiting_payment', payment_status: 'payment_required', payload: { client: { id: 'client' } } }], error: null };
 const saved = await store.saveServiceRequest({ id: 'service-request-test', requestStatus: 'claimed' });
 assert.equal(saved.requestStatus, 'awaiting_payment');
 assert.equal(store.loadServiceRequests({ userId: 'client' })[0].paymentStatus, 'payment_required');
});

test('expired session rejects writes before changing local storage', async () => {
 storage.clear();
 globalThis.testSupabase.auth.getUser = async () => ({ data: { user: null } });
 await assert.rejects(store.saveServiceRequest({ id: 'service-request-test' }), /Sign in again/);
 assert.equal(storage.size, 0);
});

test('successful synchronization removes cached conversations no longer authorized by the server', async () => {
 storage.clear();
 storage.set('weightlisted.directMessageThreads', JSON.stringify([{ id: 'private-revoked', messages: [{ text: 'private' }] }]));
 globalThis.testSupabase.auth.getUser = async () => ({ data: { user: { id: 'client' } } });
 globalThis.testSupabase.from = () => ({ select: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) });
 await store.syncMarketplaceData();
 assert.deepEqual(JSON.parse(storage.get('weightlisted.directMessageThreads')), []);
});
