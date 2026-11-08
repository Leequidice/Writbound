import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { NearReader, defaultRpc, loadApprovedRoles } from '../services/api/dist/near-rpc.js';
import { demoArtifact, digest, hour, prepareIntent } from '../services/api/dist/near-intents.js';

const read = path => JSON.parse(readFileSync(path, 'utf8'));
const roles = loadApprovedRoles(process.cwd());
const reader = new NearReader(process.env.WRITBOUND_NEAR_RPC ?? defaultRpc, roles);
const record = read('docs/testnet-execution/state.json');
const manifest = read('docs/phase3-demo/manifest.json');
const files = {
  'cleaned.csv': manifest.artifact_sha256,
  'input.csv': manifest.input_sha256,
  'task-spec.json': manifest.specification_sha256,
  'verification.json': manifest.verification_sha256,
  'defective-fixture.csv': manifest.defective_artifact_sha256,
  'challenge-evidence.json': manifest.challenge_evidence_sha256,
};
assert.equal(files['cleaned.csv'], demoArtifact);
for (const [file, hash] of Object.entries(files)) {
  assert.equal(digest(readFileSync('docs/phase3-demo/' + file)), hash, file);
}
assert.equal(digest(readFileSync('contracts/writbound-escrow/target/near/writbound_escrow.wasm')),
  'b0e079d44375cda2baf0f242f5aa405d2c0cf158782b4817b9b0ce2284e30019');

const block = await reader.block();
const config = await reader.configuration(block);
const job = await reader.job(block, '0');
const accounting = await reader.view(block, 'get_accounting');
const accounts = {};
for (const [role, id] of Object.entries(roles)) accounts[role] = await reader.account(block, id);
const gas = await reader.gasPrice(block);
const protocol = await reader.protocol(block);
const tx = await reader.transaction(record.transactions[5].hash, roles.customer);
assert.equal(tx.final_execution_status, 'FINAL');
assert.equal(tx.transaction.hash, record.transactions[5].hash);
assert.ok(tx.receipts_outcome.length && tx.receipts.length);
const existingFees = BigInt(record.fee_spent_yocto);
const plannedGas = 1550n * 10n ** 12n; // 12 demo calls + 2 cleanup, with three 150 Tgas transfers.
const priorConservativeEnvelope = 5832583134272267n * BigInt(gas.gas_price) + 28n * 10n ** 21n;
const budgetCap = 7n * 10n ** 24n;
const heldAllocation = 6n * 10n ** 24n + existingFees;
assert.ok(heldAllocation + priorConservativeEnvelope <= budgetCap, 'Fee envelope exceeds original allocation cap');
const preparation = { roles, signer: roles.customer, now: BigInt(block.timestamp_nanosec),
  quote: config.storage_quote, spec: manifest.specification_sha256 };
const create = prepareIntent({ ...preparation, method: 'create_job', mode: 'success', job: null });
const expire = prepareIntent({ ...preparation, method: 'expire_job', mode: 'cleanup', job });
const customerDeposit = BigInt(create.deposit) * 2n;
const customerStorage = BigInt(accounts.customer.storage_usage) * BigInt(protocol.runtime_config.storage_amount_per_byte);
const customerFeeEnvelope = 1932583134272267n * BigInt(gas.gas_price) + 28n * 10n ** 21n;
assert.ok(BigInt(accounts.customer.amount) - customerStorage >= customerDeposit + customerFeeEnvelope,
  'Customer liquidity does not cover both deposits and its conservative fee envelope');
const report = {
  network: 'testnet', rpc: reader.endpoint, block, config, roles, accounts, job0: job, accounting,
  gas_price: gas.gas_price, storage_byte_cost: protocol.runtime_config.storage_amount_per_byte,
  historical_receipt_query: { hash: tx.transaction.hash, finality: tx.final_execution_status, receipts: tx.receipts.length },
  commitments: files, creation_sample: create, cleanup_expire: expire, challenge_duration_ns: String(hour),
  budget: {
    cap_yocto: String(budgetCap), allocated_including_fees_yocto: String(heldAllocation),
    existing_fees_yocto: String(existingFees), remaining_yocto: String(budgetCap - heldAllocation),
    two_new_deposits_yocto: String(customerDeposit),
    customer_fee_envelope_yocto: String(customerFeeEnvelope),
    gas_at_snapshot_price_yocto: String(plannedGas * BigInt(gas.gas_price)),
    conservative_remaining_fee_envelope_yocto: String(priorConservativeEnvelope),
    projected_max_allocation_yocto: String(heldAllocation + priorConservativeEnvelope),
  },
};
writeFileSync('docs/phase4-preflight.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ block: block.height, contract: config.contract, job0: job.state, budget: report.budget }, null, 2));
