import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const base = 'http://127.0.0.1:5173';
const dashboard = await fetch(base);
assert.equal(dashboard.status, 200);
const html = await dashboard.text();
assert.match(html, /id="root"/);

async function request(path, expected, body) {
  const response = await fetch(base + '/api' + path, {
    ...(body === undefined ? {} : {
      method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify(body),
    }),
    signal: AbortSignal.timeout(165_000),
  });
  const json = await response.json();
  assert.ok([expected].flat().includes(response.status), JSON.stringify(json));
  return json;
}

const cfg = await request('/near/config', 200);
assert.equal(cfg.network, 'testnet');
const finalized = {};
for (const [id, state, method] of [['1', 'Paid', 'settle_job'], ['2', 'Refunded', 'refund_job']]) {
  const { job, block, transactions, receipt_source } = await request('/near/jobs/' + id, 200);
  assert.equal(job.id, id);
  assert.equal(job.state, state);
  assert.equal(receipt_source, 'published_finalized_record');
  const payment = transactions.find(tx => tx.intent.method === method);
  assert.ok(payment?.result.transfer_receipt && payment.result.callback_receipt);
  assert.equal(payment.intent.beneficiary.amount, '10000000000000000000000');
  assert.equal(payment.explorer, 'https://testnet.nearblocks.io/txns/' + payment.hash);
  finalized[id] = { state, block: block.height, transaction: payment.hash };
}

const { spec, input_base64, defective_base64 } = await request('/near/demo', 200);
const local = await request('/jobs', 201, { spec, input_base64 });
const run = await request(`/jobs/${local.id}/run`, 200, {});
assert.equal(run.artifact_sha256, '41db277a79fb2579196eb99425c7e0de408665097e38c42c5d04459941704c2d');
const download = await fetch(base + '/api/jobs/' + local.id + '/artifact');
assert.equal(download.status, 200);
assert.match(download.headers.get('content-disposition') ?? '', /attachment/);
assert.equal(createHash('sha256').update(Buffer.from(await download.arrayBuffer())).digest('hex'), run.artifact_sha256);
assert.equal((await request(`/jobs/${local.id}/verify`, 200, {})).passed, true);
assert.equal((await request(`/jobs/${local.id}/verify`, 200, { artifact_base64: defective_base64 })).passed, false);
const evidence = await request(`/jobs/${local.id}/challenge`, 200);
assert.deepEqual(evidence.mismatch.expected.cells, ['002', 'Bob', 'Unassigned']);
console.log(JSON.stringify({
  dashboard: base, local_job: local.id, inference: run.inference, artifact_sha256: run.artifact_sha256,
  finalized_demo_jobs: finalized, onchain_writes: 0,
}, null, 2));
