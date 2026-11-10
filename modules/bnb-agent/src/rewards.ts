import { createPublicClient, createWalletClient, getAddress, http, isAddress, zeroAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bscTestnet } from 'viem/chains';

export const TESTNET_CHAIN_ID = 97;
export const MAX_REWARD_WEI = 1_000_000_000_000_000n; // 0.001 tBNB

export interface RewardRequest {
  auditId: string;
  recipient: string;
  amountWei: bigint;
}

export interface RewardSender {
  pay(request: RewardRequest): Promise<{ transactionHash: string }>;
}

/** Persist an uncertain state and reconcile the wallet before any manual retry. */
export class RewardBroadcastUncertainError extends Error {
  constructor() {
    super('Transaction outcome unknown: reconcile the treasury on BSC Testnet before retrying.');
    this.name = 'RewardBroadcastUncertainError';
  }
}

export function validateReward(recipient: string, amountWei: bigint) {
  if (typeof recipient !== 'string' || !isAddress(recipient)) {
    throw new Error('A valid EVM recipient address is required.');
  }
  const address = getAddress(recipient);
  if (address === zeroAddress) throw new Error('The zero address cannot receive rewards.');
  if (typeof amountWei !== 'bigint' || amountWei <= 0n || amountWei > MAX_REWARD_WEI) {
    throw new Error('Reward must be greater than zero and at most 0.001 tBNB.');
  }
  return { recipient: address, amountWei };
}

export interface RewardTransport {
  getChainId(): Promise<number>;
  sendTransaction(input: { to: `0x${string}`; value: bigint }): Promise<string>;
}

/** Injection boundary for tests; review, persistence and idempotency belong to the caller. */
export function createRewardSender(transport: RewardTransport): RewardSender {
  return {
    async pay(request) {
      if (!request.auditId?.trim() || request.auditId.length > 128) {
        throw new Error('A validated audit identifier is required.');
      }
      const reward = validateReward(request.recipient, request.amountWei);
      if (await transport.getChainId() !== TESTNET_CHAIN_ID) {
        throw new Error('Refusing payment: RPC must report BSC Testnet chain 97.');
      }
      // A transport failure can happen after broadcast; never automatically retry.
      try {
        const transactionHash = await transport.sendTransaction({ to: reward.recipient, value: reward.amountWei });
        if (!/^0x[0-9a-fA-F]{64}$/.test(transactionHash)) throw new Error('Invalid transaction response.');
        return { transactionHash };
      } catch {
        throw new RewardBroadcastUncertainError();
      }
    },
  };
}

export function createTestnetRewardSender(options: { privateKey?: string; rpcUrl?: string } = {}): RewardSender {
  const privateKey = options.privateKey ?? process.env.BNB_TREASURY_PRIVATE_KEY;
  if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error('Configure BNB_TREASURY_PRIVATE_KEY through secure environment settings.');
  }
  const rpcUrl = options.rpcUrl ?? process.env.BNB_RPC_URL ?? 'https://data-seed-prebsc-1-s1.bnbchain.org:8545';
  let parsed: URL;
  try { parsed = new URL(rpcUrl); } catch { throw new Error('BNB_RPC_URL must be a valid HTTPS URL.'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new Error('BNB_RPC_URL must use HTTPS without embedded credentials.');
  }
  let account: ReturnType<typeof privateKeyToAccount>;
  try { account = privateKeyToAccount(privateKey as `0x${string}`); }
  catch { throw new Error('BNB_TREASURY_PRIVATE_KEY is not a valid signing key.'); }
  // Disable transport retries, including requests that submit signed transactions.
  const publicClient = createPublicClient({ chain: bscTestnet, transport: http(rpcUrl, { retryCount: 0 }) });
  const walletClient = createWalletClient({ account, chain: bscTestnet, transport: http(rpcUrl, { retryCount: 0 }) });
  return createRewardSender({
    getChainId: () => publicClient.getChainId(),
    sendTransaction: ({ to, value }) => walletClient.sendTransaction({ to, value }),
  });
}
