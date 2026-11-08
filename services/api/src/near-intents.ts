import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { type ChainJob, type Roles, type TxResult } from './near-rpc.js';

export const hour = 3_600_000_000_000n;
const day = hour * 24n;
const escrow = '10000000000000000000000';
export const demoArtifact = '41db277a79fb2579196eb99425c7e0de408665097e38c42c5d04459941704c2d';
export const digest = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');
export const hashPattern = /^[0-9a-f]{64}$/;
export const isJobId = (value: unknown): value is string => typeof value === 'string'
  && /^(0|[1-9]\d{0,19})$/.test(value) && BigInt(value) <= 18_446_744_073_709_551_615n;

export const signerRole = {
  create_job: 'customer', accept_job: 'worker', submit_work: 'worker',
  attest_verification: 'verifier', open_challenge: 'challenger', resolve_challenge: 'verifier',
  settle_job: 'customer', expire_job: 'customer', refund_job: 'customer',
} as const;
export type Method = keyof typeof signerRole;
export type Mode = 'success' | 'challenge' | 'cleanup';
export const sequences: Record<Mode, readonly Method[]> = {
  success: ['create_job', 'accept_job', 'submit_work', 'attest_verification', 'settle_job'],
  challenge: ['create_job', 'accept_job', 'submit_work', 'attest_verification', 'open_challenge', 'resolve_challenge', 'refund_job'],
  cleanup: ['expire_job', 'refund_job'],
};
export interface Intent {
  network: 'testnet';
  method: Method;
  signer: string;
  receiver: string;
  args: Record<string, unknown>;
  gas: string;
  deposit: string;
  mode: Mode;
  evidence?: string;
  beneficiary?: { account_id: string; amount: string };
}

export class IntentError extends Error {
  constructor(message: string, readonly status = 409) { super(message); }
}
function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new IntentError(message);
}

interface Prepare {
  method: Method;
  signer: string;
  roles: Roles;
  mode: Mode;
  now: bigint;
  quote: string;
  spec: string;
  job: ChainJob | null;
  artifact?: string;
  reportHash?: string;
}

export function prepareIntent(p: Prepare): Intent {
  requireCondition(Object.hasOwn(signerRole, p.method) && p.signer === p.roles[signerRole[p.method]], 'Wrong signer for this action');
  requireCondition(p.mode !== 'cleanup' || ['expire_job', 'refund_job'].includes(p.method), 'Job 0 only supports cleanup');
  const payment = p.method === 'settle_job' || p.method === 'refund_job';
  const intent: Intent = {
    network: 'testnet', method: p.method, signer: p.signer, receiver: p.roles.contract,
    args: {}, gas: payment ? '150000000000000' : '100000000000000', deposit: '0', mode: p.mode,
  };
  if (p.method === 'create_job') {
    requireCondition(!p.job && hashPattern.test(p.spec) && /^\d+$/.test(p.quote) && BigInt(p.quote) > 0n, 'Invalid creation inputs or job already mapped');
    intent.args = {
      escrow, specification_hash: p.spec, work_deadline: (p.now + 2n * hour).toString(),
      challenge_duration: hour.toString(),
    };
    intent.deposit = (BigInt(escrow) + BigInt(p.quote)).toString();
    return intent;
  }

  const job = p.job;
  requireCondition(job && isJobId(job.id) && job.customer === p.roles.customer, 'Expected finalized job and approved customer');
  requireCondition(p.mode === 'cleanup' ? job.id === '0' : job.specification_hash === p.spec, 'Job commitment or cleanup ID differs');
  requireCondition(job.worker === null || job.worker === p.roles.worker, 'Unexpected assigned worker');
  intent.args = { job_id: job.id };
  const submission = job.submissions.at(-1);
  const before = (deadline: string | null | undefined) => deadline != null && p.now < BigInt(deadline);
  const expired = (deadline: string | null | undefined) => deadline != null && !before(deadline);
  const pending = job.challenges.filter(challenge => challenge.state === 'Pending');
  const bindEvidence = (kind: string, extra: Record<string, unknown> = {}) => {
    requireCondition(p.reportHash && hashPattern.test(p.reportHash) && p.artifact && hashPattern.test(p.artifact), 'Verified artifact and report are required');
    requireCondition(submission?.artifact_hash === p.artifact, 'Finalized artifact does not match verified bytes');
    const evidence = JSON.stringify({
      schema_version: 1, kind, network: 'testnet', contract: p.roles.contract,
      job_id: job.id, specification_hash: job.specification_hash, artifact_hash: p.artifact,
      source_report_sha256: p.reportHash, ...extra,
    }) + '\n';
    intent.evidence = evidence;
    return digest(evidence);
  };

  switch (p.method) {
    case 'accept_job':
      requireCondition(job.state === 'Open' && job.worker === null && before(job.work_deadline), 'Job is not open for acceptance');
      break;
    case 'submit_work':
      requireCondition(job.worker === p.signer && job.state === 'Accepted' && before(job.work_deadline), 'Worker cannot submit at this state or deadline');
      requireCondition(p.artifact && hashPattern.test(p.artifact), 'Verified artifact is required');
      intent.args.artifact_hash = p.artifact;
      intent.args.metadata = null;
      break;
    case 'attest_verification':
      requireCondition(job.state === 'Submitted' && before(submission?.verification_deadline), 'Verification is closed');
      intent.args.passed = true;
      intent.args.evidence_hash = bindEvidence(
        p.mode === 'challenge' ? 'seeded_positive_demo_fixture' : 'deterministic_verification_pass',
        { deterministic_verification_passed: p.mode === 'success' },
      );
      break;
    case 'open_challenge':
      requireCondition(p.mode === 'challenge' && job.state === 'Verified' && before(submission?.challenge_end), 'Challenge window is closed or fixture mode is missing');
      requireCondition(!job.challenges.some(c => c.challenger === p.signer && c.revision === job.submissions.length), 'Challenger already used this revision');
      requireCondition(job.challenges.filter(c => c.revision === job.submissions.length).length < 4, 'Challenge slots are full');
      intent.args.evidence_hash = bindEvidence('deterministic_fixture_failure');
      break;
    case 'resolve_challenge': {
      const challenge = pending.find(c => c.challenger === p.roles.challenger && c.revision === job.submissions.length);
      requireCondition(p.mode === 'challenge' && job.state === 'Verified' && challenge && pending.every(c => before(c.resolution_deadline)), 'No eligible pending fixture challenge');
      requireCondition(challenge.evidence_hash === bindEvidence('deterministic_fixture_failure'), 'Finalized challenge evidence differs');
      intent.args.challenge_id = challenge.id;
      intent.args.upheld = true;
      intent.args.allow_correction = false;
      intent.args.resolution_hash = bindEvidence('upheld_fixture_challenge', {
        challenge_id: challenge.id, challenge_evidence_hash: challenge.evidence_hash, upheld: true, allow_correction: false,
      });
      break;
    }
    case 'settle_job':
      requireCondition(p.mode === 'success' && job.worker === p.roles.worker && job.state === 'Verified'
        && submission?.verification?.passed && expired(submission.challenge_end) && !pending.length, 'Settlement requires a passed job, elapsed challenge window and no pending challenge');
      intent.beneficiary = { account_id: p.roles.worker, amount: job.escrow };
      break;
    case 'expire_job':
      requireCondition(p.mode === 'cleanup' && ['Open', 'Accepted'].includes(job.state) && expired(job.work_deadline), 'Job 0 has no eligible work timeout');
      break;
    case 'refund_job':
      requireCondition(p.mode !== 'success' && job.state === 'Refundable', 'Job is not refundable for this workflow');
      requireCondition(job.refund_reason === (p.mode === 'cleanup' ? 'work_timeout' : 'challenge_upheld'), 'Refund reason differs from the approved workflow');
      intent.beneficiary = { account_id: job.customer, amount: job.escrow };
      break;
  }
  return intent;
}

export function inspectTransaction(intent: Intent, hash: string, tx: TxResult) {
  if (tx.final_execution_status !== 'FINAL') return { status: 'pending' as const };
  const transaction = tx.transaction;
  const action = transaction?.actions?.[0]?.FunctionCall;
  requireCondition(transaction?.hash === hash && transaction.signer_id === intent.signer
    && transaction.receiver_id === intent.receiver && transaction.actions.length === 1 && action, 'Final transaction identity or action differs from the intent');
  let args: unknown;
  try { args = JSON.parse(Buffer.from(action.args, 'base64').toString()); }
  catch { throw new IntentError('Final transaction has invalid arguments'); }
  requireCondition(action.method_name === intent.method && String(action.gas) === intent.gas
    && action.deposit === intent.deposit && isDeepStrictEqual(args, intent.args), 'Final transaction parameters differ from the intent');
  requireCondition(tx.status && (Object.hasOwn(tx.status, 'Failure') || typeof tx.status.SuccessValue === 'string')
    && tx.transaction_outcome && tx.receipts_outcome?.length, 'Incomplete final receipt data');
  const outcomes = [tx.transaction_outcome, ...tx.receipts_outcome];
  const failure = tx.status.Failure ?? outcomes.find(o => Object.hasOwn(o.outcome.status, 'Failure'))?.outcome.status.Failure;
  const fee_yocto = outcomes.reduce((sum, o) => sum + BigInt(o.outcome.tokens_burnt), 0n).toString();
  if (failure) return { status: 'failed' as const, failure, fee_yocto };
  if (intent.beneficiary) {
    const beneficiary = intent.beneficiary;
    const matches = tx.receipts?.filter(r => r.receiver_id === beneficiary.account_id && r.predecessor_id === intent.receiver
      && r.receipt.Action?.actions.some(a => a.Transfer?.deposit === beneficiary.amount)) ?? [];
    const callbacks = tx.receipts?.filter(r => r.receiver_id === intent.receiver && r.predecessor_id === intent.receiver
      && r.receipt.Action?.actions.some(a => a.FunctionCall?.method_name === 'on_transfer')) ?? [];
    const succeeded = (id: string, executor: string) => outcomes.some(o => o.id === id
      && o.outcome.executor_id === executor && typeof o.outcome.status.SuccessValue === 'string');
    requireCondition(matches.length === 1 && callbacks.length === 1
      && succeeded(matches[0].receipt_id, beneficiary.account_id) && succeeded(callbacks[0].receipt_id, intent.receiver)
      && Buffer.from(tx.status.SuccessValue ?? '', 'base64').toString() === 'true', 'Transfer and successful callback could not be reconciled');
    return { status: 'finalized' as const, fee_yocto, transfer_receipt: matches[0].receipt_id, callback_receipt: callbacks[0].receipt_id };
  }
  let job_id: string | undefined;
  if (intent.method === 'create_job') {
    const value = JSON.parse(Buffer.from(tx.status.SuccessValue ?? '', 'base64').toString());
    requireCondition(isJobId(value), 'Final creation did not return a valid job ID');
    job_id = value;
  }
  let challenge_id: number | undefined;
  if (intent.method === 'open_challenge') {
    const value = JSON.parse(Buffer.from(tx.status.SuccessValue ?? '', 'base64').toString());
    requireCondition(Number.isInteger(value) && value >= 0 && value <= 255, 'Final challenge did not return a valid ID');
    challenge_id = value;
  }
  return { status: 'finalized' as const, fee_yocto, job_id, challenge_id };
}

export function reconcileJob(intent: Intent, job: ChainJob, result: { job_id?: string; challenge_id?: number }) {
  requireCondition(job.id === (result.job_id ?? intent.args.job_id), 'Finalized job ID differs');
  const submission = job.submissions.at(-1);
  switch (intent.method) {
    case 'create_job':
      requireCondition(job.state === 'Open' && job.customer === intent.signer && job.escrow === intent.args.escrow
        && job.specification_hash === intent.args.specification_hash && job.work_deadline === intent.args.work_deadline
        && job.challenge_duration === intent.args.challenge_duration, 'Final job does not match the creation intent');
      break;
    case 'accept_job':
      requireCondition(job.state === 'Accepted' && job.worker === intent.signer, 'Final worker acceptance differs');
      break;
    case 'submit_work':
      requireCondition(job.state === 'Submitted' && submission?.artifact_hash === intent.args.artifact_hash, 'Final submission differs');
      break;
    case 'attest_verification':
      requireCondition(job.state === 'Verified' && submission?.verification?.passed
        && submission.verification.evidence_hash === intent.args.evidence_hash && submission.challenge_end, 'Final verification differs');
      break;
    case 'open_challenge':
      requireCondition(job.state === 'Verified' && job.challenges.some(c => c.state === 'Pending'
        && c.id === result.challenge_id && c.challenger === intent.signer && c.evidence_hash === intent.args.evidence_hash), 'Final challenge differs');
      break;
    case 'resolve_challenge':
      requireCondition(job.state === 'Refundable' && job.refund_reason === 'challenge_upheld'
        && job.challenges.some(c => c.state === 'Upheld' && c.id === intent.args.challenge_id), 'Final adjudication differs');
      break;
    case 'expire_job':
      requireCondition(job.state === 'Refundable' && job.refund_reason === 'work_timeout', 'Final timeout state differs');
      break;
    case 'settle_job':
    case 'refund_job':
      requireCondition(job.state === (intent.method === 'settle_job' ? 'Paid' : 'Refunded')
        && job.transfer_attempt === '1' && job.transfer_completed_at, 'Final payout or refund state could not be reconciled');
      break;
  }
}
