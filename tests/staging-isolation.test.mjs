import test from 'node:test';
import assert from 'node:assert/strict';
import { getBackendConfig } from '../src/lib/environment.js';
const production = { VITE_SUPABASE_URL: 'https://ovuiqnqaoxmjsfilceon.supabase.co', VITE_SUPABASE_ANON_KEY: 'production-public-key' };
test('staging never falls back to production credentials', () => {
 assert.equal(getBackendConfig(production, true).url, 'https://zimtgpfxddttxytattmd.supabase.co');
 assert.notEqual(getBackendConfig(production, true).key, production.VITE_SUPABASE_ANON_KEY);
 assert.equal(getBackendConfig({...production, VITE_STAGING_SUPABASE_URL: 'https://test.supabase.co'}, true), null);
 assert.equal(getBackendConfig({...production, VITE_STAGING_SUPABASE_URL: production.VITE_SUPABASE_URL, VITE_STAGING_SUPABASE_ANON_KEY:'test'}, true), null);
});
test('staging uses only its dedicated backend while production stays unchanged', () => {
 const env={...production,VITE_STAGING_SUPABASE_URL:'https://staging-example.supabase.co',VITE_STAGING_SUPABASE_ANON_KEY:'staging-public-key'};
 assert.deepEqual(getBackendConfig(env,true),{url:env.VITE_STAGING_SUPABASE_URL,key:env.VITE_STAGING_SUPABASE_ANON_KEY});
 assert.deepEqual(getBackendConfig(env,false),{url:production.VITE_SUPABASE_URL,key:production.VITE_SUPABASE_ANON_KEY});
});
