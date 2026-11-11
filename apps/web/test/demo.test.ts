import assert from 'node:assert/strict';
import { test } from 'node:test';
import { finalizedOutcome, historicalOutcomes, type HistoricalJobId } from '../src/demo.ts';
import type { ChainView, Transaction } from '../src/workflow.ts';

function outcomeView(id: HistoricalJobId): ChainView {
  const outcome = historicalOutcomes[id];
  return {
    block: { height: 42, timestamp_nanosec: '100' },
    job: { id, state: outcome.state, work_deadline: '100', submissions: [] },
    transactions: [{
      id: 'receipt', status: 'finalized', hash: 'test-hash', explorer: 'https://example.test/tx',
      intent: { method: outcome.method, mode: 'success', signer: 'test', beneficiary: { account_id: 'test', amount: '10000000000000000000000' } },
      result: { transfer_receipt: 'transfer', callback_receipt: 'callback' },
    }],
  };
}

test('Treasury confirms each historical outcome with its own finalized state and receipt', () => {
  const paid = outcomeView('1');
  const refunded = outcomeView('2');
  assert.equal(finalizedOutcome('1', paid), paid.transactions[0]);
  assert.equal(finalizedOutcome('2', refunded), refunded.transactions[0]);
  assert.equal(finalizedOutcome('1', refunded), null);
  assert.equal(finalizedOutcome('2', paid), null);
});

test('Treasury withholds live confirmation when the RPC or chain state is unavailable', () => {
  const view = outcomeView('1');
  assert.equal(finalizedOutcome('1'), null);
  assert.equal(finalizedOutcome('1', { ...view, error: 'RPC unavailable' }), null);
  assert.equal(finalizedOutcome('1', { ...view, block: undefined }), null);
  assert.equal(finalizedOutcome('1', { ...view, job: { ...view.job!, state: 'Verified' } }), null);
});

test('Treasury requires finalized transfer and callback evidence for the stated amount', () => {
  const view = outcomeView('2');
  const receipt = view.transactions[0];
  const variants: Transaction[] = [
    { ...receipt, status: 'pending' },
    { ...receipt, result: { transfer_receipt: 'transfer' } },
    { ...receipt, intent: { ...receipt.intent, beneficiary: { account_id: 'test', amount: '1' } } },
  ];
  for (const transaction of variants) {
    assert.equal(finalizedOutcome('2', { ...view, transactions: [transaction] }), null);
  }
});
