import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const defaultRpc = 'https://archival-rpc.testnet.fastnear.com/';
export const expectedCodeHash = 'CuTHP5d4SUnkkVjUGn3b8UzBXkS2i8KABabNDrpZhKS8';
export const txHashPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export type Roles = Record<'contract' | 'customer' | 'worker' | 'verifier' | 'challenger', string>;
export function loadApprovedRoles(root: string): Roles {
  const packet = readFileSync(join(root, 'docs', 'testnet-transaction-plan.final-approval.json'));
  if (createHash('sha256').update(packet).digest('hex') !== '33266af8dab092cce7c4e5eea92d96cc539dd552dd8116a81895107902f11345') {
    throw new Error('Approved testnet role packet changed');
  }
  return JSON.parse(packet.toString('utf8')).account_ids as Roles;
}
export interface Block { hash: string; height: number; timestamp_nanosec: string }
export interface Account { amount: string; locked: string; storage_usage: number; code_hash: string }
export interface ChainJob {
  id: string;
  customer: string;
  worker: string | null;
  specification_hash: string;
  escrow: string;
  state: string;
  work_deadline: string;
  challenge_duration: string;
  correction_deadline: string | null;
  transfer_attempt: string;
  transfer_completed_at: string | null;
  refund_reason: string | null;
  submissions: Array<{
    artifact_hash: string;
    verification_deadline: string;
    challenge_end: string | null;
    verification: { passed: boolean; evidence_hash: string } | null;
  }>;
  challenges: Array<{ id: number; revision: number; state: string; evidence_hash: string; resolution_deadline: string; challenger: string }>;
}

export interface Outcome {
  id: string;
  outcome: { executor_id: string; status: Record<string, unknown>; tokens_burnt: string };
}
export interface TxResult {
  final_execution_status: string;
  status?: { Failure?: unknown; SuccessValue?: string };
  transaction?: {
    hash: string; signer_id: string; receiver_id: string;
    actions: Array<{ FunctionCall?: { method_name: string; args: string; gas: number | string; deposit: string } }>;
  };
  transaction_outcome?: Outcome;
  receipts_outcome?: Outcome[];
  receipts?: Array<{
    receipt_id: string; receiver_id: string; predecessor_id: string;
    receipt: { Action?: { actions: Array<{ Transfer?: { deposit: string }; FunctionCall?: { method_name: string } }> } };
  }>;
}

export class RpcError extends Error {
  constructor(message: string, readonly retryable = false, readonly unknownTx = false, readonly retryAfterMs = 0) { super(message); }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function retryDelay(header: string | null): number {
  if (!header) return 0;
  if (/^\d+(\.\d+)?$/.test(header)) return Number(header) * 1000;
  const at = Date.parse(header);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : 0;
}

export class NearReader {
  private queue: Promise<unknown> = Promise.resolve();
  private lastRead = 0;
  private networkCheckedUntil = 0;
  readonly endpoint: string;

  constructor(
    endpoint: string,
    readonly roles: Roles,
    private readonly transport: typeof fetch = fetch,
    private readonly spacingMs = 2000,
    private readonly networkCheckMs = 30_000,
  ) {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
      throw new Error('NEAR RPC must be an unauthenticated HTTPS URL');
    }
    this.endpoint = url.toString();
  }

  private async request<T>(method: string, params: unknown): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      await sleep(Math.max(0, this.spacingMs - (Date.now() - this.lastRead)));
      this.lastRead = Date.now();
      try {
        const response = await this.transport(this.endpoint, {
          method: 'POST', redirect: 'error',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 'writbound', method, params }),
          signal: AbortSignal.timeout(12_000),
        });
        if ([401, 402, 403].includes(response.status)) throw new RpcError('RPC requires access credentials or payment');
        if (!response.ok) throw new RpcError(`RPC returned HTTP ${response.status}`, response.status === 429 || response.status >= 500,
          false, retryDelay(response.headers.get('Retry-After')));
        const body = await response.json();
        if (body.error) {
          const cause = body.error.cause?.name;
          if (cause === 'UNKNOWN_TRANSACTION') throw new RpcError('Transaction is not yet visible to this RPC', false, true);
          throw new RpcError(`RPC rejected ${method}`, body.error.code === -429 || cause === 'TIMEOUT_ERROR',
            false, retryDelay(response.headers.get('Retry-After')));
        }
        if (!Object.hasOwn(body, 'result')) throw new RpcError('RPC returned an invalid result');
        return body.result as T;
      } catch (error) {
        const retry = error instanceof RpcError ? error.retryable : error instanceof TypeError || (error as Error).name === 'TimeoutError';
        if (!retry || attempt >= 2) {
          if (error instanceof RpcError) throw error;
          throw new RpcError('RPC unavailable or response invalid');
        }
        const minimum = error instanceof RpcError ? error.retryAfterMs : 0;
        const delay = Math.max(minimum, this.spacingMs * 2 ** (attempt + 1)) + Math.floor(Math.random() * Math.min(this.spacingMs, 1500));
        if (delay > 120_000) throw new RpcError('RPC retry guidance exceeds the bounded verification window');
        await sleep(delay);
      }
    }
  }

  private read<T>(method: string, params: unknown): Promise<T> {
    const result = this.queue.then(async () => {
      if (Date.now() >= this.networkCheckedUntil) {
        const status = await this.request<{ chain_id: string }>('status', []);
        if (status.chain_id !== 'testnet') throw new RpcError('RPC did not identify as NEAR testnet');
        this.networkCheckedUntil = Date.now() + this.networkCheckMs;
      }
      return this.request<T>(method, params);
    });
    this.queue = result.catch(() => {});
    return result;
  }

  async block(): Promise<Block> {
    const { header } = await this.read<{ header: Block }>('block', { finality: 'final' });
    if (!header?.hash || !/^\d+$/.test(header.timestamp_nanosec)) throw new RpcError('Invalid finalized block');
    return { hash: header.hash, height: header.height, timestamp_nanosec: header.timestamp_nanosec };
  }

  async view<T>(block: Block, method: string, args: object = {}): Promise<T> {
    const reply = await this.read<{ result: number[] }>('query', {
      request_type: 'call_function', account_id: this.roles.contract, method_name: method,
      args_base64: Buffer.from(JSON.stringify(args)).toString('base64'), block_id: block.hash,
    });
    try { return JSON.parse(Buffer.from(reply.result).toString()) as T; }
    catch { throw new RpcError('Invalid contract view response'); }
  }

  job(block: Block, id: string) {
    return this.view<ChainJob | null>(block, 'get_job', { job_id: id });
  }

  account(block: Block, id: string) {
    return this.read<Account>('query', { request_type: 'view_account', account_id: id, block_id: block.hash });
  }

  accessKey(block: Block, id: string, publicKey: string) {
    return this.read<{ nonce: number | string; permission: unknown }>('query', {
      request_type: 'view_access_key', account_id: id, public_key: publicKey, block_id: block.hash,
    });
  }

  code(block: Block) {
    return this.read<{ hash: string; code_base64: string }>('query', {
      request_type: 'view_code', account_id: this.roles.contract, block_id: block.hash,
    });
  }

  gasPrice(block: Block) {
    return this.read<{ gas_price: string }>('gas_price', [block.hash]);
  }

  protocol(block: Block) {
    return this.read<{ runtime_config: { storage_amount_per_byte: string } }>('EXPERIMENTAL_protocol_config', { block_id: block.hash });
  }

  transaction(hash: string, signer: string) {
    return this.read<TxResult>('EXPERIMENTAL_tx_status', { tx_hash: hash, sender_account_id: signer, wait_until: 'NONE' });
  }

  async configuration(block: Block) {
    const contract = await this.account(block, this.roles.contract);
    if (contract.code_hash !== expectedCodeHash) throw new RpcError('Deployed contract code hash does not match the approved WASM');
    const verifier = await this.view<string>(block, 'get_verifier');
    if (verifier !== this.roles.verifier) throw new RpcError('Deployed verifier does not match the approved account');
    const version = await this.view<string>(block, 'version');
    if (version !== 'writbound-escrow-0.2.0') throw new RpcError('Unexpected deployed contract version');
    const storage_quote = await this.view<string>(block, 'storage_quote');
    if (!/^\d+$/.test(storage_quote) || BigInt(storage_quote) <= 0n) throw new RpcError('Invalid storage quote');
    return { contract: this.roles.contract, verifier, version, storage_quote, code_hash: contract.code_hash };
  }
}
