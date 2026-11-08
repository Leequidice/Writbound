export const signerRoles = {
  create_job: 'customer', accept_job: 'worker', submit_work: 'worker',
  attest_verification: 'verifier', open_challenge: 'challenger', resolve_challenge: 'verifier',
  settle_job: 'customer', expire_job: 'customer', refund_job: 'customer',
} as const;
export type Method = keyof typeof signerRoles;
export type Mode = 'success' | 'challenge' | 'cleanup';
export interface Transaction {
  id: string; status: 'prepared' | 'pending' | 'finalized' | 'failed'; hash: string | null; explorer: string | null;
  intent: { method: Method; mode: Mode; signer: string; beneficiary?: { account_id: string; amount: string } };
  result: { transfer_receipt?: string; callback_receipt?: string; failure?: unknown } | null;
}
export interface ChainView {
  link?: { chain_id: string; mode: Mode } | null;
  block?: { height: number; timestamp_nanosec: string };
  job: { id: string; state: string; work_deadline: string; submissions: Array<{ challenge_end: string | null }> } | null;
  transactions: Transaction[];
  error?: string;
}
export const successPath: Method[] = ['create_job', 'accept_job', 'submit_work', 'attest_verification', 'settle_job'];
export const challengePath: Method[] = ['create_job', 'accept_job', 'submit_work', 'attest_verification', 'open_challenge', 'resolve_challenge', 'refund_job'];

export function nextMethod(mode: Mode, chain: ChainView | null): Method | null {
  if (!chain || chain.error || chain.transactions.some(tx => tx.status !== 'finalized')) return null;
  const path: Method[] = mode === 'cleanup' ? ['expire_job', 'refund_job'] : mode === 'success' ? successPath : challengePath;
  const next = path.find(method => !chain.transactions.some(tx => tx.intent.method === method));
  if (next === 'create_job') return chain.job ? null : next;
  if (!next || !chain.job || !chain.block) return null;
  const job = chain.job;
  const now = BigInt(chain.block.timestamp_nanosec);
  const challengeEnd = job.submissions.at(-1)?.challenge_end;
  const allowed = {
    accept_job: job.state === 'Open' && now < BigInt(job.work_deadline),
    submit_work: job.state === 'Accepted' && now < BigInt(job.work_deadline),
    attest_verification: job.state === 'Submitted',
    open_challenge: job.state === 'Verified' && Boolean(challengeEnd && now < BigInt(challengeEnd)),
    resolve_challenge: job.state === 'Verified',
    settle_job: job.state === 'Verified' && Boolean(challengeEnd && now >= BigInt(challengeEnd)),
    expire_job: ['Open', 'Accepted'].includes(job.state) && now >= BigInt(job.work_deadline),
    refund_job: job.state === 'Refundable',
  };
  return allowed[next] ? next : null;
}

export function chainLabel(chain: ChainView | null): string {
  if (!chain) return 'NEAR testnet · refresh to inspect';
  if (chain.error) return 'NEAR testnet · live state unavailable';
  if (!chain.job) return 'Local job · awaiting finalized creation';
  return `NEAR testnet · finalized block ${chain.block?.height ?? 'unavailable'}`;
}

export const nsDate = (value?: string | null) => value ? new Date(Number(BigInt(value) / 1_000_000n)).toISOString() : '—';
