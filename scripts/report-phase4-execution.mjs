import { readFileSync, writeFileSync } from 'node:fs';

const state = JSON.parse(readFileSync('data/phase4-execution/state.json', 'utf8'));
const one = 10n ** 24n;
function amount(value) {
  const n = BigInt(value);
  return (String(n / one) + '.' + (n % one).toString().padStart(24, '0')).replace(/\.?0+$/, '');
}
const verified = state.rows.filter(row => row.status === 'verified');
const balanceSnapshot = state.final ?? state.stop_reconciliation;
const report = [
  '# Phase 4 controlled NEAR testnet execution',
  '',
  'Execution status **' + state.status + '**. ' + verified.length + ' of 12 calls verified. Contract writbound-escrow-20261105.testnet. Job 0 cleanup was excluded.',
  '',
  'Preflight used finalized block ' + state.baseline.block.height + ' (' + state.baseline.block.hash + '). The free archival RPC returned the approved deployed WASM, account balances, and matching access keys.',
  ...(state.resume_004c ? [
    '',
    'Directive 004-C resumed after the original HTTP 429 stop. Finalized block ' + state.resume_004c.block.height
      + ' confirmed the full one-hour window had elapsed. The revised order places job 1 settlement at call 5, then the challenged workflow at calls 6–12.',
    'Verification used one free archival reader with seven-second spacing, bounded jittered retries, and Retry-After handling. The runner reused each verified receipt to update the local application journal.',
  ] : []),
  '',
  'The defective fixture intentionally omitted 002,Bob,Unassigned. Independent verification rejected those bytes. '
    + (state.rows.some(row => row.step === 8 && row.status === 'verified')
      ? 'The positive attestation on B was a seeded demonstration.'
      : 'The seeded positive attestation on B has not been submitted.'),
  '',
  state.worker ? 'The real Ollama run used ' + state.worker.run.inference.model + ' in ' + state.worker.run.inference.wall_ms + ' ms. The independent verifier accepted SHA-256 ' + state.worker.artifact_sha256 + '.' : 'The live worker run is outstanding.',
  '',
  '| Step | Job | Method | Transaction hash and explorer | Verification | Job state | Fee (testnet NEAR) |',
  '|---:|---|---|---|---|---|---:|',
  ...state.rows.map(row => '| ' + [
    row.step, row.lane, row.method, '[' + row.hash + '](' + row.explorer + ')',
    row.status, row.job?.state ?? '—', row.fee_yocto ? amount(row.fee_yocto) : '—',
  ].join(' | ') + ' |'),
  '',
];
for (const row of verified.filter(item => item.transfer_receipt)) {
  const target = row.intent.beneficiary;
  report.push('- **' + row.method + '** transferred ' + amount(target.amount) + ' testnet NEAR to ' + target.account_id
    + '. Transfer receipt ' + row.transfer_receipt + ', callback receipt ' + row.callback_receipt
    + ', job ' + row.job.id + ' in ' + row.job.state + ' with attempt ' + row.job.transfer_attempt + '.');
}
report.push(
  '',
  'Finalized new job deposits total ' + amount(verified.filter(row => row.method === 'create_job')
    .reduce((sum, row) => sum + BigInt(row.intent.deposit), 0n)) + ' testnet NEAR.',
  '',
  'Job A ID ' + (state.jobs.A ?? 'not mapped') + '. Job B ID ' + (state.jobs.B ?? 'not mapped')
    + '. Challenge ID ' + (state.challengeId ?? 'not recorded') + '.',
  '',
  'Historical fees **' + amount(state.historical_fees_yocto) + ' NEAR**. New recorded outcome fees **'
    + amount(BigInt(state.fees_yocto) - BigInt(state.historical_fees_yocto)) + ' NEAR**. Total recorded fees **'
    + amount(state.fees_yocto) + ' NEAR**. Allocation under the approved convention (4 NEAR funding and 2 NEAR storage allowance) is **'
    + amount(6n * one + BigInt(state.fees_yocto)) + ' of 7 NEAR**. Job deposits draw from existing customer funds.',
);
if (state.challengeEnd) report.push('', 'Finalized A challenge deadline ' + new Date(Number(BigInt(state.challengeEnd) / 1_000_000n)).toISOString() + '.');
if (state.resume_004c) {
  const fees = state.rows.filter(row => row.step >= 5 && row.fee_yocto)
    .reduce((sum, row) => sum + BigInt(row.fee_yocto), 0n);
  report.push('', 'Calls 5–12 recorded **' + amount(fees) + ' testnet NEAR** in fees.');
}
if (balanceSnapshot) {
  report.push('', 'Finalized balance snapshot at block **' + balanceSnapshot.block.height + '**. Amounts include storage backing.',
    '', '| Role | Testnet NEAR |', '|---|---:|',
    ...Object.entries(balanceSnapshot.accounts).map(([role, account]) => '| ' + role + ' | ' + amount(account.amount) + ' |'),
    '', 'Accounting in yoctoNEAR: ' + JSON.stringify(balanceSnapshot.accounting) + '. Job 0 remained ' + balanceSnapshot.job0.state + '.');
}
if (state.stop_reason) report.push('', 'Stop reason: ' + state.stop_reason);
if (state.next_unexecuted_step) {
  report.push('', 'Read-only reconciliation verified the saved final receipt against job state and verifier nonce. The API journal now records that result. Step '
    + state.next_unexecuted_step + ' remains the next unexecuted call and needs renewed owner authorization. Steps 1–4 must never be replayed.');
}
if (state.local_incident) report.push('', 'Local signing incident: ' + state.local_incident);
for (const row of state.rows.filter(item => item.broadcast_note)) {
  report.push('', 'Step ' + row.step + ' broadcast response: ' + row.broadcast_note + '. No replay was attempted.');
}
report.push('');
writeFileSync('docs/PHASE4_ONCHAIN_REPORT.md', report.join('\n'));
writeFileSync('docs/phase4-onchain-results.json', JSON.stringify(state, null, 2) + '\n');
console.log('Recorded ' + verified.length + '/12 verified calls in docs/PHASE4_ONCHAIN_REPORT.md');
