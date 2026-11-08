import assert from 'node:assert/strict';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { inspectTransaction, reconcileJob } from '../services/api/dist/near-intents.js';
import { NearJournal } from '../services/api/dist/near-journal.js';
import { defaultRpc, loadApprovedRoles, NearReader } from '../services/api/dist/near-rpc.js';

const directory = 'data/phase4-execution';
const path = directory + '/state.json';
const read = file => JSON.parse(readFileSync(file, 'utf8'));
const state = read(path);
assert.equal(state.status, 'stopped');
assert.equal(state.stop_reason, 'RPC returned HTTP 429');
assert.equal(state.rows.length, 4);
assert.ok(state.rows.slice(0, 3).every(row => row.status === 'verified'));
const row = state.rows[3];
assert.equal(row.method, 'attest_verification');
assert.equal(row.status, 'finalized');

const archived = read(directory + '/step-04-rpc.json');
const result = inspectTransaction(row.intent, row.hash, archived);
assert.equal(result.status, 'finalized');
assert.equal(result.fee_yocto, row.fee_yocto);
assert.equal(String(archived.transaction.nonce), row.nonce);
const roles = loadApprovedRoles(process.cwd());
const chain = new NearReader(defaultRpc, roles, fetch, 5000);
const block = await chain.block();
const job = await chain.job(block, state.jobs.A);
assert.ok(job);
reconcileJob(row.intent, job, result);
const key = await chain.accessKey(block, roles.verifier, archived.transaction.public_key);
assert.equal(String(key.nonce), row.nonce);
const accounting = await chain.view(block, 'get_accounting');
const job0 = await chain.job(block, '0');
const count = await chain.view(block, 'get_job_count');
assert.equal(count, '2');
assert.equal(job0.state, 'Open');
const accounts = {};
for (const role of Object.keys(roles)) accounts[role] = await chain.account(block, roles[role]);

const database = new DatabaseSync('data/phase4/writbound.sqlite');
try {
  const journal = new NearJournal(database);
  const entry = journal.entry(row.intent_id);
  assert.deepEqual(entry.intent, row.intent);
  const registered = journal.register(row.intent_id, row.hash);
  if (registered.status === 'pending') journal.complete(row.intent_id, result);
  else assert.equal(registered.status, 'finalized');
} finally { database.close(); }

row.job = job;
row.finalized_block = block;
row.status = 'verified';
state.challengeEnd = job.submissions.at(-1).challenge_end;
state.stop_reconciliation = { block, accounts, accounting, job0, job_count: count, verifier_nonce: String(key.nonce) };
state.next_unexecuted_step = 5;
writeFileSync(path + '.tmp', JSON.stringify(state, null, 2) + '\n');
renameSync(path + '.tmp', path);
console.log(JSON.stringify({
  verified: 4, status: state.status, job: job.id, job_state: job.state,
  challenge_end_utc: new Date(Number(BigInt(state.challengeEnd) / 1_000_000n)).toISOString(),
  block: block.height, next_unexecuted_step: 5,
}, null, 2));
