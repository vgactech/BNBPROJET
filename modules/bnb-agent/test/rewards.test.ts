import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRewardSender, createTestnetRewardSender, MAX_REWARD_WEI, RewardBroadcastUncertainError, validateReward } from '../src/rewards.ts';

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
