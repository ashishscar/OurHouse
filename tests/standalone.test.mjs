import test from 'node:test';
import assert from 'node:assert/strict';
import {standaloneWorker} from '../standalone/worker.mjs';

test('direct hosting rejects forged proxy identity but preserves Google authorization and request body', async () => {
 const original = new Request('https://ourhouse.example/api/secure/changes', {method: 'POST', headers: {
  'oai-authenticated-user-id': 'supabase:someone-else', 'OAI-Authenticated-User-Email': 'victim@example.invalid',
  'oai-authenticated-user-full-name': 'Forged', authorization: 'Bearer synthetic_google_session',
  'x-ourhouse-auth': 'supabase', origin: 'https://ourhouse.example', 'content-type': 'application/json',
 }, body: '{"encrypted":"fixture"}'});
 let called = false;
 const worker = standaloneWorker({async fetch(request, env, ctx) {
  called = true; assert.equal(env.marker, 1); assert.equal(ctx.marker, 2);
  assert.equal([...request.headers.keys()].some(name => name.startsWith('oai-')), false);
  assert.equal(request.headers.get('authorization'), 'Bearer synthetic_google_session');
  assert.equal(request.headers.get('x-ourhouse-auth'), 'supabase');
  assert.equal(await request.text(), '{"encrypted":"fixture"}');
  return Response.json({ok: true});
 }});
 assert.equal((await worker.fetch(original, {marker: 1}, {marker: 2})).status, 200); assert.ok(called);
});

test('standalone hosting does not offer a ChatGPT login path or an external return redirect', async () => {
 const worker = standaloneWorker({fetch() { throw Error('legacy flow must not reach application'); }});
 for (const path of ['/signin-with-chatgpt?return_to=https://evil.example', '/signout-with-chatgpt', '/callback', '/?legacy=1']) {
  const response = await worker.fetch(new Request('https://ourhouse.example' + path), {}, {});
  assert.equal(response.status, 303); assert.equal(response.headers.get('location'), 'https://ourhouse.example/');
 }
});

test('direct Cloudflare cron retries both private delivery and provider cleanup without user activity', async () => {
 const seen = [], env = {fixture: true}; let pending;
 const worker = standaloneWorker({}, [async config => {assert.equal(config, env); seen.push('push');}, async config => {assert.equal(config, env); seen.push('account cleanup');}]);
 worker.scheduled({}, env, {waitUntil(promise) {pending = promise;}});
 await pending; assert.deepEqual(seen, ['push', 'account cleanup']);
});

test('cron failures are visible to Cloudflare while the other job still runs', async () => {
 let otherRan = false, pending;
 const worker = standaloneWorker({}, [async () => {throw Error('temporary outage');}, async () => {otherRan = true;}]);
 worker.scheduled({}, {}, {waitUntil(promise) {pending = promise;}});
 await assert.rejects(pending, /temporary outage/); assert.ok(otherRan);
});
