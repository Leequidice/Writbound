import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { isDeepStrictEqual, promisify } from 'node:util';
import { defaultRpc, expectedCodeHash, loadApprovedRoles, NearReader, RpcError } from '../services/api/dist/near-rpc.js';
import { demoArtifact, digest, inspectTransaction, prepareIntent, reconcileJob, signerRole } from '../services/api/dist/near-intents.js';
import { NearJournal } from '../services/api/dist/near-journal.js';

if (['start', 'resume-before-broadcast', 'resume-004c', 'settle'].includes(process.argv[2])) {
  console.error('Broadcasting is disabled for the Writbound release freeze.');
  process.exit(1);
}

const cli = resolve('.tools/near-cli/near-cli-rs-x86_64-pc-windows-msvc/near.exe');
const dir = 'data/phase4-execution';
const journalPath = dir + '/state.json';
const packetHash = 'fa4915c188914eb9242a9aca0acc600d76ffd19c4f369f28a1528002fffd1baa';
const wasmHash = 'b0e079d44375cda2baf0f242f5aa405d2c0cf158782b4817b9b0ce2284e30019';
const deposit = '173840000000000000000000';
const spec = '6112127c82bc59c4d16b730bc0aaa4138f2969a02320cfecf0712333e8772200';
const hour = 3_600_000_000_000n;
const one = 10n ** 24n;
const read = path => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
const write = (path, value) => {
  writeFileSync(path + '.tmp', JSON.stringify(value, null, 2) + '\n');
  renameSync(path + '.tmp', path);
};
const sleep = ms => new Promise(done => setTimeout(done, ms));
const roles = loadApprovedRoles(process.cwd());
const resumed = ['resume-004c', 'check-004c'].includes(process.argv[2]);
const pace = resumed ? 7000 : 2000;
const reader = new NearReader(defaultRpc, roles, fetch, pace, resumed ? 120_000 : 30_000);
const proof = read('docs/final-testnet-signing-readiness.json');
const staged = read('data/phase4/controlled-demo-local-jobs.json');
const historical = read('docs/testnet-execution/state.json');
const approved = [
  ['A', 'create_job'], ['A', 'accept_job'], ['A', 'submit_work'], ['A', 'attest_verification'],
  ['B', 'create_job'], ['B', 'accept_job'], ['B', 'submit_work'], ['B', 'attest_verification'],
  ['B', 'open_challenge'], ['B', 'resolve_challenge'], ['B', 'refund_job'], ['A', 'settle_job'],
];
const calls = resumed ? [...approved.slice(0, 4), approved[11], ...approved.slice(4, 11)] : approved;
const labels = { A: staged.success_local_id, B: staged.challenge_local_id };
const modes = { A: 'success', B: 'challenge' };
const fixture = read('docs/phase3-demo/manifest.json');
const base58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function encode58(bytes) {
  let value = BigInt('0x' + bytes.toString('hex'));
  let result = '';
  while (value) { result = base58[Number(value % 58n)] + result; value /= 58n; }
  for (const byte of bytes) { if (byte !== 0) break; result = '1' + result; }
  return result;
}

function checkLocal() {
  assert.equal(digest(readFileSync('docs/PHASE4_APPROVAL.md')), packetHash);
  assert.equal(digest(readFileSync('contracts/writbound-escrow/target/near/writbound_escrow.wasm')), wasmHash);
  const cfg = read('docs/execution-cli-config.json');
  assert.equal(cfg.network_name, 'testnet');
  assert.equal(cfg.rpc_url, defaultRpc);
  assert.equal(digest(readFileSync(cfg.config_path)), cfg.config_sha256);
  assert.equal(proof.all_five_verified, true);
  assert.equal(proof.network, 'testnet');
  assert.ok(Date.now() - statSync('docs/final-testnet-signing-readiness.json').mtimeMs < 86_400_000, 'Signing proof is stale');
  for (const role of Object.keys(roles)) assert.equal(proof.results[role].account_id, roles[role]);
  assert.equal(fixture.artifact_sha256, demoArtifact);
  assert.equal(fixture.specification_sha256, spec);
  for (const [file, hash] of Object.entries({
    'cleaned.csv': demoArtifact, 'task-spec.json': spec, 'input.csv': fixture.input_sha256,
    'defective-fixture.csv': fixture.defective_artifact_sha256,
    'verification.json': fixture.verification_sha256, 'challenge-evidence.json': fixture.challenge_evidence_sha256,
  })) assert.equal(digest(readFileSync('docs/phase3-demo/' + file)), hash, file);
  assert.equal(historical.transactions.length, 6);
  assert.ok(historical.transactions.every(tx => tx.verified && tx.outcome === 'success'));
}

async function api(path, body) {
  const response = await fetch('http://127.0.0.1:3001' + path, {
    redirect: 'error', signal: AbortSignal.timeout(175_000),
    ...(body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`Local API ${path} HTTP ${response.status}: ${result.error ?? result.errors?.join('; ') ?? 'request failed'}`);
  return result;
}

function checkBudget(gasPrice, fees) {
  const envelope = 5832583134272267n * BigInt(gasPrice) + 28n * 10n ** 21n;
  assert.ok(6n * one + fees + envelope <= 7n * one, 'Budget envelope exceeds cap');
  return envelope;
}

async function key(block, role) {
  const credential = proof.results[role];
  assert.equal(credential.verified, true);
  const result = await reader.accessKey(block, roles[role], credential.public_key);
  assert.equal(result.permission, 'FullAccess');
  assert.ok(typeof result.nonce === 'string' || Number.isSafeInteger(result.nonce), 'Invalid access key nonce');
  return { publicKey: credential.public_key, nonce: BigInt(result.nonce) };
}

async function preflight(existingPreparation = false) {
  const block = await reader.block();
  const cfg = await reader.configuration(block);
  assert.equal(cfg.storage_quote, '163840000000000000000000');
  const code = await reader.code(block);
  assert.equal(code.hash, expectedCodeHash);
  assert.equal(digest(Buffer.from(code.code_base64, 'base64')), wasmHash);
  const accounting = await reader.view(block, 'get_accounting');
  const accounts = {};
  for (const role of Object.keys(roles)) {
    accounts[role] = await reader.account(block, roles[role]);
    assert.equal(accounts[role].amount, historical.latest_balances.accounts[role].amount, `Unexpected pre-existing balance change: ${role}`);
  }
  for (const role of ['customer', 'worker', 'verifier', 'challenger']) await key(block, role);
  const { gas_price } = await reader.gasPrice(block);
  const protocol = await reader.protocol(block);
  const cost = BigInt(protocol.runtime_config.storage_amount_per_byte);
  const fees = BigInt(historical.fee_spent_yocto);
  checkBudget(gas_price, fees);
  const customerEnvelope = 1932583134272267n * BigInt(gas_price) + 28n * 10n ** 21n;
  assert.ok(BigInt(accounts.customer.amount) - BigInt(accounts.customer.storage_usage) * cost >= 2n * BigInt(deposit) + customerEnvelope);
  const history = await reader.transaction(historical.transactions[5].hash, roles.customer);
  assert.equal(history.final_execution_status, 'FINAL');
  assert.ok(history.receipts?.length, 'RPC did not provide archival receipts');
  await sleep(2000);
  const app = await api('/near/config');
  assert.equal(app.source, defaultRpc);
  assert.equal(app.code_hash, expectedCodeHash);
  assert.deepEqual(app.roles, roles);
  for (const id of Object.values(labels)) {
    const job = await api('/jobs/' + id);
    assert.equal(job.status, 'ready');
    assert.equal(job.specification_sha256, spec);
    const mapping = await api('/near/links/' + id);
    assert.equal(mapping.link, null);
    if (existingPreparation && id === labels.A) {
      assert.equal(mapping.transactions.length, 1);
      const [entry] = mapping.transactions;
      assert.equal(entry.status, 'prepared');
      assert.equal(entry.hash, null);
      exactIntent(entry.intent, 'A', 'create_job', { jobs: {} });
    } else assert.deepEqual(mapping.transactions, []);
  }
  return { block, accounts, gas_price, accounting, storage_byte_cost: cost.toString() };
}

function signedDetails(base64, intent, publicKey, nonce, blockHash) {
  const data = Buffer.from(base64, 'base64');
  let offset = 0;
  const bytes = length => {
    assert.ok(length >= 0 && offset + length <= data.length);
    const value = data.subarray(offset, offset + length); offset += length; return value;
  };
  const n32 = () => bytes(4).readUInt32LE();
  const n64 = () => bytes(8).readBigUInt64LE();
  const string = () => bytes(n32()).toString('utf8');
  assert.equal(string(), intent.signer);
  assert.equal(bytes(1)[0], 0);
  const keyBytes = bytes(32);
  assert.equal('ed25519:' + encode58(keyBytes), publicKey);
  assert.equal(n64(), nonce);
  assert.equal(string(), intent.receiver);
  assert.equal(encode58(bytes(32)), blockHash);
  assert.equal(n32(), 1);
  assert.equal(bytes(1)[0], 2);
  assert.equal(string(), intent.method);
  assert.ok(isDeepStrictEqual(JSON.parse(string()), intent.args), 'Signed args differ');
  assert.equal(n64().toString(), intent.gas);
  assert.equal((n64() + (n64() << 64n)).toString(), intent.deposit);
  const hash = createHash('sha256').update(data.subarray(0, offset)).digest();
  assert.equal(bytes(1)[0], 0);
  const signature = bytes(64);
  assert.equal(offset, data.length);
  const key = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), keyBytes]), format: 'der', type: 'spki' });
  assert.ok(verify(null, hash, key, signature), 'Signed transaction signature did not verify');
  return encode58(hash);
}

async function sign(intent, credential, block) {
  const nonce = credential.nonce + 1n;
  const args = [
    '--offline', 'contract', 'call-function', 'as-transaction', intent.receiver, intent.method, 'json-args', JSON.stringify(intent.args),
    'prepaid-gas', `${BigInt(intent.gas) / 10n ** 12n} Tgas`, 'attached-deposit', intent.deposit + ' yoctonear',
    'sign-as', intent.signer, 'network-config', 'testnet', 'sign-with-keychain', '--signer-public-key', credential.publicKey,
    '--nonce', nonce.toString(), '--block-hash', block.hash, '--block-height', String(block.height), 'display',
  ];
  let output;
  try { output = await promisify(execFile)(cli, args, { timeout: 25_000, windowsHide: true, maxBuffer: 128 * 1024 }); }
  catch { throw new Error('Official CLI sign-only operation failed. No broadcast attempted.'); }
  const candidates = [...new Set((output.stdout + '\n' + output.stderr).match(/[A-Za-z0-9+/]{120,}={0,2}/g) ?? [])];
  const matches = [];
  const rejected = [];
  for (const candidate of candidates) {
    try { matches.push({ payload: candidate, hash: signedDetails(candidate, intent, credential.publicKey, nonce, block.hash) }); }
    catch (error) {
      rejected.push({
        bytes: Buffer.from(candidate, 'base64').length,
        stage: error.stack?.split('\n').find(line => line.includes('signedDetails'))?.trim(),
        type: error.name,
      });
    }
  }
  if (matches.length !== 1 && process.argv[2] === 'diagnose-sign') {
    console.log(JSON.stringify({ candidates: candidates.length, rejected, output_line_lengths: (output.stdout + '\n' + output.stderr).split(/\r?\n/).map(line => line.length) }));
  }
  assert.equal(matches.length, 1, 'Could not validate a unique signed transaction. No broadcast attempted.');
  return { ...matches[0], nonce: nonce.toString() };
}

async function sendOnce(payload) {
  const response = await fetch(defaultRpc, {
    method: 'POST', redirect: 'error', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'phase4-send-once', method: 'send_tx',
      params: { signed_tx_base64: payload, wait_until: 'NONE' } }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Broadcast HTTP ${response.status}; reconcile before any further action`);
  const result = await response.json();
  if (result.error || !result.result) throw new Error('Broadcast RPC response was ambiguous or rejected');
}

async function finalized(hash, signer) {
  for (const delay of [2000, 4000, 8000, 8000, 8000, 8000]) {
    await sleep(Math.max(pace, delay) + (resumed ? Math.floor(Math.random() * 1500) : 0));
    try {
      const result = await reader.transaction(hash, signer);
      if (result.final_execution_status === 'FINAL') return result;
    } catch (error) {
      if (!(error instanceof RpcError && error.unknownTx)) throw error;
    }
  }
  throw new Error('Could not finalize the recorded hash within the verification window');
}

function exactIntent(intent, lane, method, state) {
  assert.equal(intent.network, 'testnet');
  assert.equal(intent.receiver, roles.contract);
  assert.equal(intent.method, method);
  assert.equal(intent.mode, modes[lane]);
  assert.equal(intent.signer, roles[signerRole[method]]);
  assert.equal(intent.gas, ['settle_job', 'refund_job'].includes(method) ? '150000000000000' : '100000000000000');
  assert.equal(intent.deposit, method === 'create_job' ? deposit : '0');
  const id = state.jobs[lane];
  if (method === 'create_job') {
    assert.equal(intent.args.escrow, '10000000000000000000000');
    assert.equal(intent.args.specification_hash, spec);
    assert.equal(intent.args.challenge_duration, hour.toString());
    assert.deepEqual(Object.keys(intent.args).sort(), ['challenge_duration', 'escrow', 'specification_hash', 'work_deadline']);
    return;
  }
  assert.ok(id && id !== '0');
  const args = { job_id: id };
  const hash = lane === 'A' ? demoArtifact : fixture.defective_artifact_sha256;
  if (method === 'submit_work') Object.assign(args, { artifact_hash: hash, metadata: null });
  if (['attest_verification', 'open_challenge', 'resolve_challenge'].includes(method)) {
    const source = lane === 'A' ? fixture.verification_sha256 : fixture.challenge_evidence_sha256;
    const kind = method === 'attest_verification'
      ? lane === 'A' ? 'deterministic_verification_pass' : 'seeded_positive_demo_fixture'
      : method === 'open_challenge' ? 'deterministic_fixture_failure' : 'upheld_fixture_challenge';
    const evidence = { schema_version: 1, kind, network: 'testnet', contract: roles.contract,
      job_id: id, specification_hash: spec, artifact_hash: hash, source_report_sha256: source };
    if (method === 'attest_verification') Object.assign(evidence, { deterministic_verification_passed: lane === 'A' });
    if (method === 'resolve_challenge') Object.assign(evidence, {
      challenge_id: state.challengeId, challenge_evidence_hash: state.challengeEvidenceHash, upheld: true, allow_correction: false,
    });
    assert.equal(intent.evidence, JSON.stringify(evidence) + '\n');
    const evidenceHash = digest(intent.evidence);
    if (method === 'attest_verification') Object.assign(args, { passed: true, evidence_hash: evidenceHash });
    if (method === 'open_challenge') Object.assign(args, { evidence_hash: evidenceHash });
    if (method === 'resolve_challenge') Object.assign(args, { challenge_id: state.challengeId, upheld: true, allow_correction: false, resolution_hash: evidenceHash });
  }
  assert.ok(isDeepStrictEqual(intent.args, args), 'Intent arguments differ from approved parameters');
  if (method === 'settle_job' || method === 'refund_job') {
    assert.deepEqual(intent.beneficiary, { account_id: method === 'settle_job' ? roles.worker : roles.customer, amount: '10000000000000000000000' });
  }
}

async function worker(state) {
  const run = await api('/jobs/' + labels.A + '/run', {});
  assert.ok(run.inference?.generated_tokens > 0 && run.status === 'succeeded');
  const check = await api('/jobs/' + labels.A + '/verify', {});
  assert.equal(check.passed, true);
  const file = readFileSync(`data/phase4/worker/${labels.A}/artifact.csv`);
  assert.equal(digest(file), demoArtifact);
  assert.equal(run.artifact_sha256, demoArtifact);
  assert.equal(check.artifact_sha256, demoArtifact);
  state.worker = { run, verification: check, artifact_sha256: digest(file) };
  write(journalPath, state);
}

function checkSettlementJob(state, job) {
  const attestation = state.rows[3];
  const submission = job?.submissions.at(-1);
  assert.equal(job?.id, '1');
  assert.equal(job.state, 'Verified');
  assert.equal(job.worker, roles.worker);
  assert.equal(job.customer, roles.customer);
  assert.equal(job.specification_hash, spec);
  assert.equal(job.escrow, '10000000000000000000000');
  assert.equal(job.submissions.length, 1);
  assert.equal(submission.artifact_hash, demoArtifact);
  assert.equal(submission.verification?.passed, true);
  assert.equal(submission.verification.evidence_hash, attestation.intent.args.evidence_hash);
  assert.equal(submission.challenge_end, state.challengeEnd);
  assert.equal(BigInt(submission.challenge_end) - BigInt(submission.verification.timestamp), hour);
  assert.equal(job.challenges.length, 0, 'Job 1 has a challenge');
  assert.equal(job.transfer_attempt, '0');
  assert.equal(job.transfer_completed_at, null);
}

async function execute(state, index, journal) {
  const [lane, method] = calls[index];
  const role = signerRole[method];
  if (index === 2 && !state.worker) await worker(state);
  let entry;
  if (!journal) {
    entry = await api('/near/prepare', { scope: labels[lane], mode: modes[lane], method, signer: roles[role] });
    await sleep(2000);
  }
  const block = await reader.block();
  const now = BigInt(block.timestamp_nanosec);
  assert.ok(BigInt(Date.now()) * 1_000_000n - now < 120_000_000_000n, 'Finalized block is stale');
  const account = await reader.account(block, roles.contract);
  assert.equal(account.code_hash, expectedCodeHash);
  const { gas_price } = await reader.gasPrice(block);
  checkBudget(gas_price, BigInt(state.fees_yocto));
  let quote;
  let job;
  if (method === 'create_job') {
    quote = await reader.view(block, 'storage_quote');
    assert.equal(quote, '163840000000000000000000');
  } else {
    job = await reader.job(block, state.jobs[lane]);
    assert.ok(job && job.specification_hash === spec && job.customer === roles.customer);
    const submission = job.submissions.at(-1);
    if (['accept_job', 'submit_work'].includes(method)) assert.ok(now + 60n * 10n ** 9n < BigInt(job.work_deadline), 'Too close to work deadline');
    if (method === 'attest_verification') assert.ok(now + 60n * 10n ** 9n < BigInt(submission.verification_deadline));
    if (method === 'open_challenge') assert.ok(now + 60n * 10n ** 9n < BigInt(submission.challenge_end));
    if (method === 'resolve_challenge') assert.ok(now + 60n * 10n ** 9n < BigInt(job.challenges.find(c => c.id === state.challengeId).resolution_deadline));
    if (method === 'settle_job') {
      if (journal) checkSettlementJob(state, job);
      assert.ok(now >= BigInt(submission.challenge_end), 'Challenge window is still open');
    }
  }
  if (journal) {
    const signedIntent = prepareIntent({
      method, signer: roles[role], roles, mode: modes[lane], now, quote: quote ?? '', spec, job: job ?? null,
      artifact: lane === 'B' ? digest(readFileSync('docs/phase3-demo/defective-fixture.csv')) : undefined,
      reportHash: lane === 'B' ? digest(readFileSync('docs/phase3-demo/challenge-evidence.json')) : undefined,
    });
    exactIntent(signedIntent, lane, method, state);
    const signerAccount = await reader.account(block, roles[role]);
    const liquid = BigInt(signerAccount.amount) - BigInt(signerAccount.storage_usage) * BigInt(state.resume_004c.storage_byte_cost);
    assert.ok(liquid >= BigInt(signedIntent.deposit) + BigInt(signedIntent.gas) * BigInt(gas_price) + 10n ** 21n, 'Signer liquidity no longer covers the approved call');
    entry = journal.prepare(labels[lane], signedIntent);
    assert.ok(isDeepStrictEqual(entry.intent, signedIntent), 'Existing journal intent differs from freshly verified parameters');
  }
  assert.equal(entry.status, 'prepared');
  assert.equal(entry.hash, null);
  const intent = entry.intent;
  exactIntent(intent, lane, method, state);
  if (method === 'create_job') {
    const remaining = BigInt(intent.args.work_deadline) - now;
    assert.ok(remaining > hour + 10n * 60n * 10n ** 9n && remaining <= 2n * hour, 'Work deadline is outside the approved fresh window');
  }
  const credential = await key(block, role);
  const signed = await sign(intent, credential, block);
  const row = { step: index + 1, lane, method, intent, intent_id: entry.id, hash: signed.hash,
    explorer: 'https://testnet.nearblocks.io/txns/' + signed.hash, nonce: signed.nonce,
    nonce_before: credential.nonce.toString(), signing_block: block.hash, status: 'broadcast_attempted' };
  state.rows.push(row);
  write(journalPath, state);
  if (journal) journal.register(entry.id, row.hash);
  let broadcastError;
  try { await sleep(pace); await sendOnce(signed.payload); }
  catch (error) { broadcastError = error.message; row.broadcast_note = broadcastError; write(journalPath, state); }
  let result;
  try { result = await finalized(row.hash, intent.signer); }
  catch (error) {
    try {
      const head = await reader.block();
      const current = await key(head, role);
      row.uncertain_reconciliation = { block: head.hash, nonce: current.nonce.toString(),
        job: state.jobs[lane] ? await reader.job(head, state.jobs[lane]) : null,
        job_count: await reader.view(head, 'get_job_count') };
    } catch { row.uncertain_reconciliation = 'Finalized nonce/state unavailable'; }
    write(journalPath, state);
    throw error;
  }
  write(dir + `/step-${String(row.step).padStart(2, '0')}-rpc.json`, result);
  assert.equal(String(result.transaction?.nonce), row.nonce, 'Finalized nonce differs from the signed nonce');
  const receipt = inspectTransaction(intent, row.hash, result);
  Object.assign(row, receipt);
  if (receipt.fee_yocto) state.fees_yocto = (BigInt(state.fees_yocto) + BigInt(receipt.fee_yocto)).toString();
  write(journalPath, state);
  assert.equal(receipt.status, 'finalized', 'Unexpected onchain failure');
  assert.ok(6n * one + BigInt(state.fees_yocto) <= 7n * one, 'Budget cap exceeded');
  const after = await reader.block();
  const finalizedJob = await reader.job(after, receipt.job_id ?? state.jobs[lane]);
  assert.ok(finalizedJob, 'Finalized job state unavailable');
  reconcileJob(intent, finalizedJob, receipt);
  let mapped;
  if (journal) mapped = journal.complete(entry.id, receipt);
  else {
    await sleep(2000);
    mapped = await api('/near/intents/' + entry.id + '/reconcile', { hash: row.hash });
  }
  assert.equal(mapped.status, 'finalized', 'Application did not reconcile finalized receipt');
  if (receipt.job_id) state.jobs[lane] = receipt.job_id;
  if (method === 'open_challenge') {
    state.challengeId = receipt.challenge_id;
    state.challengeEvidenceHash = intent.args.evidence_hash;
  }
  if (lane === 'A' && method === 'attest_verification') state.challengeEnd = finalizedJob.submissions.at(-1).challenge_end;
  row.job = finalizedJob;
  row.finalized_block = after;
  row.status = 'verified';
  write(journalPath, state);
  console.log(JSON.stringify({ step: row.step, lane, method, job_id: finalizedJob.id, state: finalizedJob.state, hash: row.hash, fee_yocto: row.fee_yocto }));
}

function check004cHistory(state) {
  assert.equal(state.status, 'stopped');
  assert.equal(state.stop_reason, 'RPC returned HTTP 429');
  assert.equal(state.next_unexecuted_step, 5);
  assert.equal(state.approved_packet_sha256, packetHash);
  assert.deepEqual(state.jobs, { A: '1' });
  assert.equal(state.rows.length, 4);
  assert.equal(state.rows[3].hash, '8gytJVimymvcQea3SVDfKmyik1VjretTjXTKLZkGv4zH');
  let fees = BigInt(historical.fee_spent_yocto);
  for (const [index, row] of state.rows.entries()) {
    assert.equal(row.step, index + 1);
    assert.equal(row.status, 'verified');
    assert.equal(row.method, approved[index][1]);
    const receipt = read(dir + `/step-0${row.step}-rpc.json`);
    const result = inspectTransaction(row.intent, row.hash, receipt);
    assert.equal(result.status, 'finalized');
    assert.equal(result.fee_yocto, row.fee_yocto);
    assert.equal(String(receipt.transaction.nonce), row.nonce);
    fees += BigInt(result.fee_yocto);
  }
  assert.equal(state.fees_yocto, fees.toString());
  assert.equal(digest(readFileSync(`data/phase4/worker/${labels.A}/artifact.csv`)), demoArtifact);
  assert.equal(state.worker.verification.passed, true);
  assert.equal(state.worker.artifact_sha256, demoArtifact);
}

async function resumePreflight(state, block, job, journal) {
  checkSettlementJob(state, job);
  assert.ok(BigInt(block.timestamp_nanosec) >= BigInt(state.challengeEnd), 'Finalized challenge window remains open');
  const deployed = await reader.code(block);
  assert.equal(deployed.hash, expectedCodeHash);
  assert.equal(digest(Buffer.from(deployed.code_base64, 'base64')), wasmHash);
  assert.equal(await reader.view(block, 'get_verifier'), roles.verifier);
  assert.equal(await reader.view(block, 'storage_quote'), '163840000000000000000000');
  assert.equal(await reader.view(block, 'get_job_count'), '2');
  assert.deepEqual(journal.list(labels.A).map(row => [row.hash, row.status]), state.rows.map(row => [row.hash, 'finalized']));
  assert.equal(journal.link(labels.A)?.chain_id, '1');
  assert.deepEqual(journal.list(labels.B), []);
  assert.equal(journal.link(labels.B), undefined);
  const accounts = {};
  for (const role of Object.keys(roles)) {
    accounts[role] = await reader.account(block, roles[role]);
    assert.equal(accounts[role].amount, state.stop_reconciliation.accounts[role].amount, `Unexpected balance change: ${role}`);
  }
  const customer = await key(block, 'customer');
  assert.equal(customer.nonce.toString(), state.rows[0].nonce, 'Settlement signer nonce changed outside the journal');
  const { gas_price } = await reader.gasPrice(block);
  const envelope = checkBudget(gas_price, BigInt(state.fees_yocto));
  const protocol = await reader.protocol(block);
  const cost = BigInt(protocol.runtime_config.storage_amount_per_byte);
  assert.equal(cost.toString(), state.baseline.storage_byte_cost);
  const liquidity = BigInt(accounts.customer.amount) - BigInt(accounts.customer.storage_usage) * cost;
  const customerEnvelope = 932583134272267n * BigInt(gas_price) + 28n * 10n ** 21n;
  assert.ok(liquidity >= BigInt(deposit) + customerEnvelope, 'Remaining customer deposit and gas not covered');
  return {
    block, job, accounts, gas_price, storage_byte_cost: cost.toString(), customer_nonce_before: customer.nonce.toString(),
    allocation_before_yocto: (6n * one + BigInt(state.fees_yocto)).toString(),
    remaining_fee_envelope_yocto: envelope.toString(), prior_stop: state.stop_reason,
    order: calls.slice(4).map(([lane, method], index) => ({ step: index + 5, lane, method })),
  };
}

async function finish(state) {
  const block = await reader.block();
  const accounts = {};
  for (const role of Object.keys(roles)) accounts[role] = await reader.account(block, roles[role]);
  state.final = { block, accounts, accounting: await reader.view(block, 'get_accounting'), job0: await reader.job(block, '0') };
  assert.equal(state.final.job0?.state, 'Open');
  if (state.resume_004c) assert.deepEqual(state.final.job0, state.stop_reconciliation.job0);
  for (const [field, delta] of Object.entries({ total_paid: 10n ** 22n, total_refunded: 10n ** 22n, storage_reserves: 327680000000000000000000n, unpaid_escrow: 0n, pending_transfers: 0n })) {
    assert.equal(BigInt(state.final.accounting[field]) - BigInt(state.baseline.accounting[field]), delta, field);
  }
  state.status = 'completed';
  write(journalPath, state);
  console.log(JSON.stringify({ status: state.status, jobs: state.jobs, total_fees_yocto: state.fees_yocto, block: block.height }));
}

async function main() {
  checkLocal();
  assert.equal(process.argv[3], '--owner-authorized-12-demo-only', 'Explicit authorized execution mode required');
  const mode = process.argv[2];
  assert.ok(['start', 'resume-before-broadcast', 'settle', 'diagnose-sign', 'resume-004c', 'check-004c'].includes(mode), 'Unknown execution mode');
  mkdirSync(dir, { recursive: true });
  const lock = dir + '/lock';
  closeSync(openSync(lock, 'wx'));
  let state;
  try {
    if (resumed) {
      const stopped = read(journalPath);
      check004cHistory(stopped);
      const block = await reader.block();
      const job = await reader.job(block, '1');
      checkSettlementJob(stopped, job);
      const remaining = BigInt(stopped.challengeEnd) - BigInt(block.timestamp_nanosec);
      if (mode === 'check-004c' || remaining > 0n) {
        console.log(JSON.stringify({ job_id: '1', state: job.state, finalized_block: block.height, challenge_end_ns: stopped.challengeEnd,
          finalized_time_ns: block.timestamp_nanosec, remaining_ns: String(remaining > 0n ? remaining : 0n), broadcasts: 0 }));
        return;
      }
      const db = new DatabaseSync('data/phase4/writbound.sqlite');
      try {
        const journal = new NearJournal(db);
        const resumedPreflight = await resumePreflight(stopped, block, job, journal);
        state = stopped;
        state.resume_004c = resumedPreflight;
        state.status = 'running';
        delete state.stop_reason;
        delete state.next_unexecuted_step;
        write(journalPath, state);
        console.log(JSON.stringify({ preflight: 'passed', block: block.height, challenge_elapsed: true, next_step: 5 }));
        for (let index = 4; index < calls.length; index++) await execute(state, index, journal);
        await finish(state);
      } finally { db.close(); }
      return;
    }
    if (mode === 'diagnose-sign') {
      const stopped = read(journalPath);
      assert.equal(stopped.rows.length, 0);
      assert.equal(stopped.status, 'stopped');
      const [entry] = (await api('/near/links/' + labels.A)).transactions;
      assert.equal(entry.status, 'prepared');
      exactIntent(entry.intent, 'A', 'create_job', stopped);
      const block = await reader.block();
      const result = await sign(entry.intent, await key(block, 'customer'), block);
      console.log(JSON.stringify({ sign_only: 'verified', hash: result.hash, nonce: result.nonce }));
      return;
    }
    if (mode === 'start' || mode === 'resume-before-broadcast') {
      const resume = mode === 'resume-before-broadcast';
      if (resume) {
        const stopped = read(journalPath);
        assert.equal(stopped.status, 'stopped');
        assert.equal(stopped.rows.length, 0);
        assert.match(stopped.stop_reason, /No broadcast attempted/);
        write(dir + '/initial-local-stop.json', stopped);
      } else assert.ok(!existsSync(journalPath), 'Execution journal already exists');
      const baseline = await preflight(resume);
      state = { status: 'running', approved_packet_sha256: packetHash, historical_fees_yocto: historical.fee_spent_yocto,
        fees_yocto: historical.fee_spent_yocto, baseline, jobs: {}, rows: [] };
      if (resume) state.local_incident = 'Online CLI sign-only mode selected a different block hash. Offline sign-only mode validated the exact pinned block. No broadcast occurred before recovery.';
      write(journalPath, state);
      console.log(JSON.stringify({ preflight: 'passed', block: baseline.block.height, testnet: true }));
      for (let index = 0; index < 11; index++) await execute(state, index);
      state.status = 'waiting_for_challenge_end';
      write(journalPath, state);
      console.log(JSON.stringify({ status: state.status, challenge_end_ns: state.challengeEnd, jobs: state.jobs }));
      return;
    }
    state = read(journalPath);
    assert.equal(state.status, 'waiting_for_challenge_end');
    assert.equal(state.rows.length, 11);
    assert.ok(state.rows.every(row => row.status === 'verified'));
    const head = await reader.block();
    if (BigInt(head.timestamp_nanosec) < BigInt(state.challengeEnd)) {
      console.log(JSON.stringify({ status: state.status, challenge_end_ns: state.challengeEnd, chain_time_ns: head.timestamp_nanosec }));
      return;
    }
    await execute(state, 11);
    await finish(state);
  } catch (error) {
    if (state) {
      state.status = 'stopped';
      state.stop_reason = error.message;
      write(journalPath, state);
    }
    throw error;
  } finally { unlinkSync(lock); }
}

main().catch(error => { console.error('STOP:', error.message); process.exitCode = 1; });
