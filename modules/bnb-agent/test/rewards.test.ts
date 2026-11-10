import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRewardReceiptReader, createRewardSender, createTestnetReceiptReader, createTestnetRewardSender, MAX_REWARD_WEI, RewardBroadcastUncertainError, validateReward } from '../src/rewards.ts';
import type { RewardReceiptTransport } from '../src/rewards.ts';

const recipient = '0x0000000000000000000000000000000000000001';
const transactionHash = `0x${'ab'.repeat(32)}`;

test('reward bounds and recipient are validated before a transfer', () => {
  assert.equal(validateReward(recipient, MAX_REWARD_WEI).amountWei, MAX_REWARD_WEI);
  for (const amount of [0n, -1n, MAX_REWARD_WEI + 1n]) assert.throws(() => validateReward(recipient, amount));
  assert.throws(() => validateReward('not-an-address', 1n));
  assert.throws(() => validateReward('0x0000000000000000000000000000000000000000', 1n));
});

test('a mainnet RPC cannot broadcast a reward', async () => {
  let calls = 0;
  const sender = createRewardSender({ getChainId: async () => 56, sendTransaction: async () => { calls++; return transactionHash; } });
  await assert.rejects(sender.pay({ auditId: 'reviewed-audit', recipient, amountWei: 1n }), /chain 97/);
  assert.equal(calls, 0);
});

test('testnet broadcasts the exact bounded payment once and returns its hash', async () => {
  const calls: unknown[] = [];
  const sender = createRewardSender({ getChainId: async () => 97, sendTransaction: async (input) => { calls.push(input); return transactionHash; } });
  assert.deepEqual(await sender.pay({ auditId: 'reviewed-audit', recipient, amountWei: 100n }), { transactionHash });
  assert.deepEqual(calls, [{ to: recipient, value: 100n }]);
});

test('an ambiguous broadcast becomes uncertain without retry or secret disclosure', async () => {
  let calls = 0;
  const sender = createRewardSender({ getChainId: async () => 97, sendTransaction: async () => { calls++; throw new Error('provider internal secret'); } });
  await assert.rejects(sender.pay({ auditId: 'reviewed-audit', recipient, amountWei: 1n }), (error: unknown) => {
    assert.ok(error instanceof RewardBroadcastUncertainError);
    assert.ok(!error.message.includes('provider internal secret'));
    return true;
  });
  assert.equal(calls, 1);
});

test('no audit ID or oversized payment reaches RPC', async () => {
  let calls = 0;
  const sender = createRewardSender({ getChainId: async () => { calls++; return 97; }, sendTransaction: async () => transactionHash });
  await assert.rejects(sender.pay({ auditId: '', recipient, amountWei: 1n }));
  await assert.rejects(sender.pay({ auditId: 'audit', recipient, amountWei: MAX_REWARD_WEI + 1n }));
  assert.equal(calls, 0);
});

test('invalid configuration errors never echo private key input', () => {
  const secret = 'secret-not-a-private-key';
  assert.throws(() => createTestnetRewardSender({ privateKey: secret }), error => error instanceof Error && !error.message.includes(secret));
  assert.throws(() => createTestnetRewardSender({ privateKey: `0x${'01'.repeat(32)}`, rpcUrl: 'http://example.com' }), /HTTPS/);
});

const treasury = '0x0000000000000000000000000000000000000002';
const receiptRequest = { transactionHash, recipient, amountWei: 100n, expectedSender: treasury };

function receiptTransport(overrides: Partial<RewardReceiptTransport> = {}): RewardReceiptTransport {
  return {
    getChainId: async () => 97,
    getTransactionReceipt: async () => ({ transactionHash, status: 'success', blockNumber: 123n }),
    getTransaction: async () => ({ hash: transactionHash, from: treasury, to: recipient, value: 100n }),
    ...overrides,
  };
}

test('receipt reader verifies a successful exact testnet payment without a signing key', async () => {
  const reader = createRewardReceiptReader(receiptTransport());
  assert.deepEqual(await reader.inspectReceipt(receiptRequest), { status: 'success', transactionHash, blockNumber: '123' });
  assert.ok(createTestnetReceiptReader({ rpcUrl: 'https://example.com' }));
});

test('missing receipt is pending and never needs transaction lookup', async () => {
  const reader = createRewardReceiptReader(receiptTransport({
    getTransactionReceipt: async () => null,
    getTransaction: async () => { throw new Error('must not be called'); },
  }));
  assert.deepEqual(await reader.inspectReceipt(receiptRequest), { status: 'pending', transactionHash, blockNumber: null });
});

test('reverted receipt cannot be reported as a successful payment', async () => {
  const reader = createRewardReceiptReader(receiptTransport({
    getTransactionReceipt: async () => ({ transactionHash, status: 'reverted', blockNumber: 124n }),
  }));
  assert.equal((await reader.inspectReceipt(receiptRequest)).status, 'reverted');
});

test('receipt reader refuses other chains before reading receipts', async () => {
  let calls = 0;
  const reader = createRewardReceiptReader(receiptTransport({
    getChainId: async () => 56,
    getTransactionReceipt: async () => { calls++; return null; },
  }));
  await assert.rejects(reader.inspectReceipt(receiptRequest), /chain 97/);
  assert.equal(calls, 0);
});

test('receipt verification rejects different hashes, recipients, amounts, and senders', async () => {
  const otherHash = `0x${'cd'.repeat(32)}`;
  const cases: Partial<RewardReceiptTransport>[] = [
    { getTransactionReceipt: async () => ({ transactionHash: otherHash, status: 'success', blockNumber: 1n }) },
    { getTransaction: async () => ({ hash: otherHash, from: treasury, to: recipient, value: 100n }) },
    { getTransaction: async () => ({ hash: transactionHash, from: treasury, to: treasury, value: 100n }) },
    { getTransaction: async () => ({ hash: transactionHash, from: treasury, to: recipient, value: 101n }) },
    { getTransaction: async () => ({ hash: transactionHash, from: recipient, to: recipient, value: 100n }) },
  ];
  for (const mismatch of cases) {
    await assert.rejects(createRewardReceiptReader(receiptTransport(mismatch)).inspectReceipt(receiptRequest), /does not match/);
  }
});

test('read-only RPC failures do not expose provider credentials', async () => {
  const reader = createRewardReceiptReader(receiptTransport({ getChainId: async () => { throw new Error('https://rpc.example/secret-token'); } }));
  await assert.rejects(reader.inspectReceipt(receiptRequest), error => error instanceof Error && !error.message.includes('secret-token'));
});
