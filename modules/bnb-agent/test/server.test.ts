import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createApp } from '../src/server.ts';
import type { RewardSender } from '../src/rewards.ts';
const token = 'test-admin-token-123456789';
const recipient = '0x1234567890123456789012345678901234567890';
async function fixture(sender?: RewardSender) {
  const dataDir = mkdtempSync(join(tmpdir(), 'lvx-test-'));
  const server = createApp({ dataDir, adminToken: token, rewardSender: sender });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const addr = server.address(); if (!addr || typeof addr === 'string') throw new Error();
  const base = `http://127.0.0.1:${addr.port}`;
  const post = (path: string, body: unknown, auth = true) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  return { dataDir, base, post, close: async () => { server.close(); await once(server, 'close'); rmSync(dataDir, { recursive: true, force: true }); } };
}
test('HTTP audit is idempotent, never stores source, serves UI with headers and honest status', async () => {
  const f = await fixture();
  try {
    const page = await fetch(f.base); assert.equal(page.status, 200); assert.match(page.headers.get('content-security-policy')!, /frame-ancestors/);
    const status = await (await fetch(f.base + '/api/status')).json(); assert.equal(status.agentId, null); assert.equal(status.payoutStatus, 'not-configured');
    const source = "eval('UNIQUE_SECRET_CUSTOMER_719221');";
    const first = await (await f.post('/api/audits', { source })).json();
    const second = await (await f.post('/api/audits', { source })).json();
    assert.equal(first.id, second.id);
    const list = await (await fetch(f.base + '/api/audits')).json(); assert.equal(list.length, 1);
    assert.ok(!JSON.stringify(list).includes('UNIQUE_SECRET_CUSTOMER_719221'));
    assert.ok(!readFileSync(join(f.dataDir, 'audits.sqlite-wal')).includes('UNIQUE_SECRET_CUSTOMER_719221'));
    assert.equal((await f.post('/api/audits', { source: '' })).status, 400);
    assert.equal((await f.post('/api/audits', { source: 'x'.repeat(230 * 1024) })).status, 413);
    assert.equal((await fetch(f.base + '/api/audits', { method: 'POST', body: '{}' })).status, 415);
  } finally { await f.close(); }
});
test('review requires administrator; approved reward broadcasts once and remains submitted', async () => {
  let calls = 0;
  const f = await fixture({ async pay() { calls++; return { transactionHash: '0x' + 'ab'.repeat(32) }; } });
  try {
    const report = await (await f.post('/api/audits', { source: 'eval(input)' })).json();
    const path = `/api/audits/${report.id}`;
    assert.equal((await f.post(path + '/review', { approved: true }, false)).status, 401);
    assert.equal((await f.post(path + '/reward', { recipient })).status, 409);
    assert.equal((await f.post(path + '/review', { approved: true, recipient })).status, 200);
    const payouts = await Promise.all([f.post(path + '/reward', { recipient }), f.post(path + '/reward', { recipient })]);
    assert.deepEqual(payouts.map(p => p.status).sort(), [202, 409]);
    assert.equal(calls, 1);
    const reportAfter = (await (await fetch(f.base + '/api/audits')).json())[0];
    assert.equal(reportAfter.rewardState, 'submitted');
    assert.equal((await f.post(path + '/review', { approved: true })).status, 409);
  } finally { await f.close(); }
});
test('uncertain broadcast is locked and safe reports never become rewardable', async () => {
  let calls = 0;
  const f = await fixture({ async pay() { calls++; throw new Error('SECRET_ERROR_VALUE'); } });
  try {
    const safe = await (await f.post('/api/audits', { source: 'const x = 1;' })).json();
    await f.post(`/api/audits/${safe.id}/review`, { approved: true });
    assert.equal((await f.post(`/api/audits/${safe.id}/reward`, { recipient })).status, 409);
    const risk = await (await f.post('/api/audits', { source: 'eval(input)' })).json();
    const path = `/api/audits/${risk.id}`;
    await f.post(path + '/review', { approved: true });
    const response = await f.post(path + '/reward', { recipient });
    assert.equal(response.status, 502); assert.ok(!(await response.text()).includes('SECRET_ERROR_VALUE'));
    assert.equal((await f.post(path + '/reward', { recipient })).status, 409);
    assert.equal(calls, 1);
  } finally { await f.close(); }
});
