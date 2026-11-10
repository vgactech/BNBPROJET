import { createPublicClient, createWalletClient, getAddress, http, isAddress, TransactionReceiptNotFoundError, zeroAddress } from 'viem';
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

export interface RewardReceiptRequest {
  transactionHash: string;
  recipient: string;
  amountWei: bigint;
  expectedSender?: string;
}

export interface RewardReceiptResult {
  status: 'pending' | 'success' | 'reverted';
  transactionHash: string;
  blockNumber: string | null;
}

export interface RewardReceiptReader {
  inspectReceipt(request: RewardReceiptRequest): Promise<RewardReceiptResult>;
}

export interface RewardReceiptTransport {
  getChainId(): Promise<number>;
  getTransactionReceipt(hash: `0x${string}`): Promise<{
    transactionHash: string;
    status: 'success' | 'reverted';
    blockNumber: bigint;
  } | null>;
  getTransaction(hash: `0x${string}`): Promise<{
    hash: string;
    from: string;
    to: string | null;
    value: bigint;
  }>;
}

function validateRpcUrl(rpcUrl: string) {
  let parsed: URL;
  try { parsed = new URL(rpcUrl); } catch { throw new Error('BNB_RPC_URL must be a valid HTTPS URL.'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new Error('BNB_RPC_URL must use HTTPS without embedded credentials.');
  }
  return rpcUrl;
}

async function readRpc<T>(read: () => Promise<T>): Promise<T> {
  try { return await read(); }
  catch { throw new Error('Unable to read reward transaction from BSC Testnet RPC.'); }
}

/** Read-only verification: never signs, broadcasts, funds, or retries a payout. */
export function createRewardReceiptReader(transport: RewardReceiptTransport, expectedSender?: string): RewardReceiptReader {
  const configuredSender = expectedSender ? validateReward(expectedSender, 1n).recipient : undefined;
  return {
    async inspectReceipt(request) {
      if (!/^0x[0-9a-fA-F]{64}$/.test(request.transactionHash)) throw new Error('A valid transaction hash is required.');
      const hash = request.transactionHash as `0x${string}`;
      const reward = validateReward(request.recipient, request.amountWei);
      const sender = request.expectedSender ? validateReward(request.expectedSender, 1n).recipient : configuredSender;
      if (await readRpc(() => transport.getChainId()) !== TESTNET_CHAIN_ID) {
        throw new Error('Refusing reconciliation: RPC must report BSC Testnet chain 97.');
      }
      const receipt = await readRpc(() => transport.getTransactionReceipt(hash));
      if (!receipt) return { status: 'pending', transactionHash: hash, blockNumber: null };
      if (receipt.transactionHash.toLowerCase() !== hash.toLowerCase()) throw new Error('Reward receipt transaction hash does not match.');
      if (receipt.status !== 'success' && receipt.status !== 'reverted') throw new Error('Reward receipt status is invalid.');
      if (typeof receipt.blockNumber !== 'bigint' || receipt.blockNumber < 0n) throw new Error('Reward receipt block number is invalid.');
      const transaction = await readRpc(() => transport.getTransaction(hash));
      if (transaction.hash.toLowerCase() !== hash.toLowerCase()) throw new Error('Reward transaction hash does not match.');
      if (!transaction.to || !isAddress(transaction.to) || getAddress(transaction.to) !== reward.recipient || transaction.value !== reward.amountWei) {
        throw new Error('Reward transaction recipient or amount does not match the stored payout.');
      }
      if (!isAddress(transaction.from) || transaction.from === zeroAddress || (sender && getAddress(transaction.from) !== sender)) {
        throw new Error('Reward transaction sender does not match the treasury.');
      }
      return { status: receipt.status, transactionHash: hash, blockNumber: receipt.blockNumber.toString() };
    },
  };
}

export function createTestnetReceiptReader(options: { rpcUrl?: string; expectedSender?: string } = {}): RewardReceiptReader {
  const rpcUrl = validateRpcUrl(options.rpcUrl ?? process.env.BNB_RPC_URL ?? 'https://data-seed-prebsc-1-s1.bnbchain.org:8545');
  const client = createPublicClient({ chain: bscTestnet, transport: http(rpcUrl, { retryCount: 0 }) });
  return createRewardReceiptReader({
    getChainId: () => client.getChainId(),
    getTransactionReceipt: async hash => {
      try { return await client.getTransactionReceipt({ hash }); }
      catch (error) {
        if (error instanceof TransactionReceiptNotFoundError) return null;
        throw error;
      }
    },
    getTransaction: hash => client.getTransaction({ hash }),
  }, options.expectedSender ?? process.env.BNB_TREASURY_ADDRESS);
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
  const rpcUrl = validateRpcUrl(options.rpcUrl ?? process.env.BNB_RPC_URL ?? 'https://data-seed-prebsc-1-s1.bnbchain.org:8545');
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
