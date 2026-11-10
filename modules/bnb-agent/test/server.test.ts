import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../src/server.ts';
import { AuditStore } from '../src/store.ts';
import { audit } from '../src/auditor.ts';
import type { RewardSender, RewardReceiptReader } from '../src/rewards.ts';
const token = 'test-admin-token-123456789';
const recipient = '0x1234567890123456789012345678901234567890';
async function fixture(sender?: RewardSender, receiptReader?: RewardReceiptReader, existingDir?: string) {
  const dataDir = existingDir ?? mkdtempSync(join(tmpdir(), 'lvx-test-'));
  const server = createApp({ dataDir, adminToken: token, rewardSender: sender, receiptReader });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const addr = server.address(); if (!addr || typeof addr === 'string') throw new Error();
  const base = `http://127.0.0.1:${addr.port}`;
  const post = (path: string, body: unknown, auth = true) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  return { dataDir, base, post, close: async (remove = true) => { server.close(); await once(server, 'close'); if (remove) rmSync(dataDir, { recursive: true, force: true }); } };
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


test('submitted receipt is checked read-only, paid state and audit idempotence survive restart', async () => {
  let calls = 0;
  const hash = '0x' + 'cd'.repeat(32);
  let receiptStatus: 'pending' | 'success' = 'pending';
  const sender: RewardSender = { async pay() { calls++; return { transactionHash: hash }; } };
  const reader: RewardReceiptReader = { async inspectReceipt(request) {
    assert.equal(request.transactionHash, hash);
    assert.equal(request.recipient.toLowerCase(), recipient.toLowerCase());
    assert.equal(request.amountWei, 100_000_000_000_000n);
    return { status: receiptStatus, transactionHash: hash, blockNumber: receiptStatus === 'pending' ? null : '12345' };
  } };
  let f = await fixture(sender, reader);
  try {
    const source = 'eval(restartMission)';
    const report = await (await f.post('/api/audits', { source })).json();
    const path = `/api/audits/${report.id}`;
    await f.post(path + '/review', { approved: true, recipient });
    assert.equal((await f.post(path + '/reward', { recipient })).status, 202);
    const dataDir = f.dataDir;
    await f.close(false);
    f = await fixture(sender, reader, dataDir);
    const repeated = await (await f.post('/api/audits', { source })).json();
    assert.equal(repeated.id, report.id); assert.equal(repeated.rewardState, 'submitted'); assert.equal(repeated.transactionHash, hash); assert.equal(repeated.rewardAmountWei, '100000000000000');
    assert.equal((await f.post(path + '/reward', { recipient })).status, 409);
    assert.equal((await f.post(path + '/reconcile', {}, false)).status, 401);
    assert.equal((await f.post(path + '/reconcile', { transactionHash: '0x' + 'ff'.repeat(32) })).status, 202);
    receiptStatus = 'success';
    const confirmed = await f.post(path + '/reconcile', {});
    assert.equal(confirmed.status, 200);
    const paid = await confirmed.json(); assert.equal(paid.rewardState, 'paid'); assert.equal(paid.receiptBlockNumber, '12345');
    await f.close(false);
    f = await fixture(sender, reader, dataDir);
    assert.equal((await f.post(path + '/review', { approved: true })).status, 409);
    assert.equal((await f.post(path + '/reward', { recipient })).status, 409);
    assert.equal(calls, 1);
    const persisted = await (await f.post('/api/audits', { source })).json(); assert.equal(persisted.rewardState, 'paid');
  } finally { await f.close(); }
});

test('all durable payout locks survive process restart including interrupted sending', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'lvx-lock-test-'));
  const store = new AuditStore(join(dataDir, 'audits.sqlite'));
  const reports = [];
  for (const state of ['sending', 'uncertain', 'submitted', 'paid', 'reverted']) {
    const report = audit({ source: `eval(${state}Mission)` }); reports.push(report);
    store.save(report); store.review(report.id, true, recipient); assert.equal(store.reserveReward(report.id, recipient, 100_000_000_000_000n), true);
    if (state === 'uncertain') store.recordUncertain(report.id);
    if (['submitted', 'paid', 'reverted'].includes(state)) store.recordSubmitted(report.id, '0x' + 'ef'.repeat(32));
    if (state === 'paid' || state === 'reverted') store.recordReceipt(report.id, '0x' + 'ef'.repeat(32), state, '500');
  }
  store.close();
  let calls = 0;
  const f = await fixture({ async pay() { calls++; throw new Error('must never broadcast'); } }, undefined, dataDir);
  try {
    for (const report of reports) {
      assert.equal((await f.post(`/api/audits/${report.id}/reward`, { recipient })).status, 409);
      assert.equal((await f.post(`/api/audits/${report.id}/review`, { approved: true })).status, 409);
    }
    assert.equal(calls, 0);
  } finally { await f.close(); }
});

test('reverted receipts stay locked; malformed receipt cannot manufacture a paid state', async () => {
  const hash = '0x' + 'da'.repeat(32);
  let mismatch = true;
  const f = await fixture({ async pay() { return { transactionHash: hash }; } }, { async inspectReceipt() {
    return { status: 'reverted', transactionHash: mismatch ? '0x' + 'bb'.repeat(32) : hash, blockNumber: '789' };
  } });
  try {
    const report = await (await f.post('/api/audits', { source: 'eval(revertedMission)' })).json();
    const path = `/api/audits/${report.id}`;
    await f.post(path + '/review', { approved: true }); await f.post(path + '/reward', { recipient });
    assert.equal((await f.post(path + '/reconcile', {})).status, 502);
    assert.equal((await (await fetch(f.base + '/api/audits')).json())[0].rewardState, 'submitted');
    mismatch = false;
    const result = await (await f.post(path + '/reconcile', {})).json(); assert.equal(result.rewardState, 'reverted');
    assert.equal((await f.post(path + '/reward', { recipient })).status, 409);
  } finally { await f.close(); }
});

test('frame policy allows explicitly configured HTTP loopback only', async () => {
  const before = process.env.LVX_ORIGIN;
  process.env.LVX_ORIGIN = 'http://localhost:8080,http://127.0.0.1:9999,http://[::1]:5173,http://evil.example,http://localhost:8080/path,https://user:pass@example.com';
  const f = await fixture();
  try {
    const policy = (await fetch(f.base)).headers.get('content-security-policy')!;
    assert.match(policy, /http:\/\/localhost:8080/); assert.match(policy, /http:\/\/127\.0\.0\.1:9999/); assert.match(policy, /http:\/\/\[::1\]:5173/);
    assert.ok(!policy.includes('evil.example')); assert.ok(!policy.includes('/path')); assert.ok(!policy.includes('user:pass'));
    const response = await fetch(f.base + '/api/audits', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://evil.example' }, body: JSON.stringify({ source: 'eval(input)' }) });
    assert.equal(response.status, 403); assert.equal(response.headers.get('access-control-allow-origin'), null);
  } finally { await f.close(); if (before === undefined) delete process.env.LVX_ORIGIN; else process.env.LVX_ORIGIN = before; }
});


test('existing audit database migrates without losing reports or unlocking legacy submissions', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'lvx-migration-test-'));
  const legacy = new DatabaseSync(join(dataDir, 'audits.sqlite'));
  legacy.exec("CREATE TABLE audits (id TEXT PRIMARY KEY, report TEXT NOT NULL, review_approved INTEGER NOT NULL DEFAULT 0, recipient TEXT, reward_state TEXT NOT NULL DEFAULT 'unreviewed', transaction_hash TEXT)");
  const report = audit({ source: 'eval(legacyMission)' });
  legacy.prepare('INSERT INTO audits VALUES (?, ?, 1, ?, ?, ?)').run(report.id, JSON.stringify(report), recipient, 'submitted', '0x' + 'cc'.repeat(32));
  legacy.close();
  const f = await fixture({ async pay() { throw new Error('must never broadcast'); } }, undefined, dataDir);
  try {
    const [stored] = await (await fetch(f.base + '/api/audits')).json();
    assert.equal(stored.id, report.id); assert.equal(stored.rewardState, 'submitted');
    assert.equal(stored.rewardAmountWei, null); assert.equal(stored.receiptBlockNumber, null);
    assert.equal((await f.post(`/api/audits/${report.id}/reward`, { recipient })).status, 409);
  } finally { await f.close(); }
});
