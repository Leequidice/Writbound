import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chainLabel, nextMethod, type ChainView, type Transaction } from '../src/workflow.ts';

const view: ChainView = {
  block: { height: 20, timestamp_nanosec: '100' },
  job: { id: '0', state: 'Open', work_deadline: '100', submissions: [] }, transactions: [],
};
const transaction = (method: Transaction['intent']['method'], status: Transaction['status']): Transaction => ({
  id: method, status, hash: null, explorer: null, result: null, intent: { method, mode: 'success', signer: 'operator' },
});

test('local or unavailable views never show finalized escrow', () => {
  assert.match(chainLabel({ job: null, transactions: [] }), /Local job/);
  const unavailable = { ...view, error: 'RPC failed' };
  assert.match(chainLabel(unavailable), /unavailable/);
  assert.equal(nextMethod('cleanup', unavailable), null);
  assert.equal(nextMethod('cleanup', view), 'expire_job');
});

test('pending and failed references stop progression and live deadlines gate settlement', () => {
  assert.equal(nextMethod('cleanup', { ...view, transactions: [transaction('expire_job', 'pending')] }), null);
  assert.equal(nextMethod('cleanup', { ...view, transactions: [transaction('expire_job', 'failed')] }), null);
  const verified: ChainView = {
    ...view,
    job: { ...view.job!, state: 'Verified', submissions: [{ challenge_end: '101' }] },
    transactions: (['create_job', 'accept_job', 'submit_work', 'attest_verification'] as const).map(method => transaction(method, 'finalized')),
  };
  assert.equal(nextMethod('success', verified), null);
  assert.equal(nextMethod('success', { ...verified, block: { height: 21, timestamp_nanosec: '101' } }), 'settle_job');
});
