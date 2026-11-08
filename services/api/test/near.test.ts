import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, unlinkSync, rmdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';
import { digest, hour, inspectTransaction, prepareIntent } from '../src/near-intents.js';
import { expectedCodeHash, NearReader, type ChainJob, type Roles, type TxResult } from '../src/near-rpc.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const roles: Roles = JSON.parse(readFileSync(join(root, 'docs/testnet-accounts.json'), 'utf8'));
const demo = (name: string) => readFileSync(join(root, 'docs', 'phase3-demo', name));
const spec = digest(demo('task-spec.json'));
const artifact = digest(demo('cleaned.csv'));
const hash = '9Y9PLxdGEm64BXQ2FcoBMGbPYeuP326F1j2Py9EBM43W';
const other = '4aUfJ4ATEnqi4UMZi7H3r1CBV1WRu8Xhv73FeRgjYemY';
const now = BigInt(Date.now()) * 1_000_000n;
const quote = '163840000000000000000000';
const chainJob: ChainJob = {
  id: '8', customer: roles.customer, worker: null, specification_hash: spec, state: 'Open',
  escrow: '10000000000000000000000', work_deadline: String(now + hour * 2n),
  challenge_duration: String(hour), correction_deadline: null, transfer_attempt: '0',
  transfer_completed_at: null, refund_reason: null, submissions: [], challenges: [],
};

test('read client retries throttling, rejects payment/mainnet, and sends only reads', async () => {
  const methods: string[] = [];
  let failures = 2;
  const reader = new NearReader('https://testnet.example/', roles, async (_url, init) => {
    const method = JSON.parse(String(init?.body)).method;
    methods.push(method);
    if (method === 'status') return Response.json({ result: { chain_id: 'testnet' } });
    if (failures-- > 0) return Response.json({ error: 'limited' }, { status: 429 });
    return Response.json({ result: { header: { height: 10, hash, timestamp_nanosec: String(now) } } });
  }, 0);
  assert.equal((await reader.block()).height, 10);
  assert.deepEqual(methods, ['status', 'block', 'block', 'block']);
  const paid = new NearReader('https://testnet.example/', roles, async () => new Response('', { status: 402 }), 0);
  await assert.rejects(paid.block(), /payment/);
  const mainnet = new NearReader('https://testnet.example/', roles, async () => Response.json({ result: { chain_id: 'mainnet' } }), 0);
  await assert.rejects(mainnet.block(), /did not identify/);
});

test('wrong roles, deadlines, exact gas/deposit, and callback receipts', () => {
  const base = { roles, mode: 'success' as const, now, quote, spec };
  assert.throws(() => prepareIntent({ ...base, method: 'accept_job', signer: roles.customer, job: chainJob }), /Wrong signer/);
  assert.throws(() => prepareIntent({ ...base, method: 'accept_job', signer: roles.worker, job: { ...chainJob, work_deadline: String(now) } }), /acceptance/);
  const created = prepareIntent({ ...base, method: 'create_job', signer: roles.customer, job: null });
  assert.equal(created.deposit, '173840000000000000000000');
  assert.equal(created.args.work_deadline, String(now + 2n * hour));
  assert.equal(created.gas, '100000000000000');
  const job = { ...chainJob, state: 'Verified', worker: roles.worker, submissions: [{
    artifact_hash: artifact, verification_deadline: String(now + hour), challenge_end: String(now + 1n),
    verification: { passed: true, evidence_hash: spec },
  }] };
  const args = { ...base, method: 'settle_job' as const, signer: roles.customer, job };
  assert.throws(() => prepareIntent(args), /elapsed/);
  const intent = prepareIntent({ ...args, now: now + 1n });
  const outcome = { executor_id: roles.contract, status: { SuccessValue: '' }, tokens_burnt: '1' };
  const tx: TxResult = {
    final_execution_status: 'FINAL', status: { SuccessValue: Buffer.from('true').toString('base64') },
    transaction: { hash, signer_id: roles.customer, receiver_id: roles.contract, actions: [{ FunctionCall: {
      method_name: 'settle_job', args: Buffer.from('{"job_id":"8"}').toString('base64'), gas: 150e12, deposit: '0',
    } }] },
    transaction_outcome: { id: hash, outcome },
    receipts_outcome: [{ id: 'pay', outcome: { ...outcome, executor_id: roles.worker } }, { id: 'callback', outcome }],
    receipts: [
      { receipt_id: 'pay', receiver_id: roles.worker, predecessor_id: roles.contract, receipt: { Action: { actions: [{ Transfer: { deposit: job.escrow } }] } } },
      { receipt_id: 'callback', receiver_id: roles.contract, predecessor_id: roles.contract, receipt: { Action: { actions: [{ FunctionCall: { method_name: 'on_transfer' } }] } } },
    ],
  };
  assert.equal(inspectTransaction(intent, hash, tx).status, 'finalized');
  assert.throws(() => inspectTransaction(intent, hash, { ...tx, receipts: [] }), /callback/);
  assert.equal(inspectTransaction(intent, hash, { ...tx, status: { Failure: { ActionError: 'expected in test' } } }).status, 'failed');
});

test('HTTP intent journal reconciles final creation, blocks duplicate hashes, and checks actual artifact bytes', async () => {
  const id = '0123456789abcdef0123456789abcdef';
  const parent = resolve(root, 'data');
  mkdirSync(parent, { recursive: true });
  const workspace = mkdtempSync(join(parent, 'phase4-test-'));
  const directory = join(workspace, id);
  mkdirSync(directory);
  const path = join(directory, 'artifact.csv');
  writeFileSync(path, demo('cleaned.csv'));
  const check = { ...JSON.parse(demo('verification.json').toString()), job_id: id };
  const db = openDatabase(':memory:');
  db.prepare("INSERT INTO jobs (id, customer_account_id, criteria_json, input_hash, local_run_json) VALUES (?, 'local', '{}', ?, ?)")
    .run(id, check.input_sha256, JSON.stringify({ status: 'succeeded', specification_sha256: spec, report: { artifact_sha256: artifact }, verification: JSON.stringify(check) }));
  let tx: TxResult = { final_execution_status: 'INCLUDED_FINAL' };
  let current = chainJob;
  const reader = new NearReader('https://testnet.example/', roles, async (_url, init) => {
    const { method, params } = JSON.parse(String(init?.body));
    if (method === 'status') return Response.json({ result: { chain_id: 'testnet' } });
    if (method === 'block') return Response.json({ result: { header: { height: 10, hash, timestamp_nanosec: String(now) } } });
    if (method === 'EXPERIMENTAL_tx_status') return Response.json({ result: tx });
    if (method === 'gas_price') return Response.json({ result: { gas_price: '100000000' } });
    if (method === 'EXPERIMENTAL_protocol_config') return Response.json({ result: { runtime_config: { storage_amount_per_byte: '10000000000000000000' } } });
    if (params.request_type === 'view_account') return Response.json({ result: { code_hash: expectedCodeHash, amount: '1000000000000000000000000', storage_usage: 182 } });
    const views: Record<string, unknown> = { get_verifier: roles.verifier, version: 'writbound-escrow-0.2.0', storage_quote: quote, get_job: current };
    return Response.json({ result: { result: [...Buffer.from(JSON.stringify(views[params.method_name]))] } });
  }, 0);
  const server = createApp(db, undefined, { reader, workspace, projectRoot: root }).listen(0, '127.0.0.1');
  try {
    await new Promise<void>(done => server.once('listening', done));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const get = (url: string, body?: object) => fetch(`http://127.0.0.1:${address.port}/near${url}`, body ? {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    } : undefined);
    const prep = { scope: id, mode: 'success', method: 'create_job', signer: roles.customer };
    assert.equal((await get('/prepare', { ...prep, signer: roles.worker })).status, 403);
    assert.equal((await get('/prepare', { ...prep, deposit: '1' })).status, 400);
    const response = await get('/prepare', prep);
    assert.equal(response.status, 201);
    const entry = await response.json();
    assert.equal((await (await get('/prepare', prep)).json()).id, entry.id);
    const reconcile = '/intents/' + entry.id + '/reconcile';
    assert.equal((await get(reconcile, { hash })).status, 202);
    assert.equal((await get(reconcile, { hash: other })).status, 409);
    assert.equal((await (await get('/links/' + id)).json()).link, null);
    const args = Object.fromEntries(Object.entries(entry.intent.args).reverse());
    const outcome = { executor_id: roles.contract, status: { SuccessValue: '' }, tokens_burnt: '1' };
    tx = {
      final_execution_status: 'FINAL', status: { SuccessValue: Buffer.from('"8"').toString('base64') },
      transaction: { hash, signer_id: roles.customer, receiver_id: roles.contract, actions: [{ FunctionCall: {
        method_name: 'create_job', args: Buffer.from(JSON.stringify(args)).toString('base64'), gas: 100e12, deposit: entry.intent.deposit,
      } }] },
      transaction_outcome: { id: hash, outcome }, receipts_outcome: [{ id: other, outcome }],
    };
    const original = tx.transaction!.actions[0].FunctionCall!;
    tx.transaction!.actions[0].FunctionCall = { ...original, deposit: '0' };
    assert.equal((await get(reconcile, { hash })).status, 409);
    assert.equal((await (await get('/links/' + id)).json()).link, null);
    tx.transaction!.actions[0].FunctionCall = original;
    assert.equal((await (await get(reconcile, { hash })).json()).status, 'finalized');
    assert.equal((await (await get(reconcile, { hash })).json()).status, 'finalized');
    assert.equal((await (await get('/links/' + id)).json()).link.chain_id, '8');
    const acceptance = await (await get('/prepare', { ...prep, method: 'accept_job', signer: roles.worker })).json();
    current = { ...chainJob, state: 'Accepted', worker: roles.worker };
    tx = {
      ...tx, status: { SuccessValue: '' },
      transaction: { hash: other, signer_id: roles.worker, receiver_id: roles.contract, actions: [{ FunctionCall: {
        method_name: 'accept_job', args: Buffer.from('{"job_id":"8"}').toString('base64'), gas: 100e12, deposit: '0',
      } }] },
    };
    assert.equal((await get('/intents/' + acceptance.id + '/reconcile', { hash })).status, 409);
    assert.equal((await (await get('/intents/' + acceptance.id + '/reconcile', { hash: other })).json()).status, 'finalized');
    const submission = { ...prep, method: 'submit_work', signer: roles.worker };
    writeFileSync(path, 'changed bytes');
    assert.equal((await get('/prepare', submission)).status, 409);
    writeFileSync(path, demo('cleaned.csv'));
    const submit = await get('/prepare', submission);
    assert.equal(submit.status, 201);
    assert.equal((await submit.json()).intent.args.artifact_hash, artifact);
  } finally {
    await new Promise<void>(done => server.close(() => done()));
    db.close();
    unlinkSync(path);
    rmdirSync(directory);
    rmdirSync(workspace);
  }
});
