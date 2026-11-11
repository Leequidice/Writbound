// Runs real local inference and verification. Start the API and Ollama first.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const base = 'http://127.0.0.1:3001';
const output = resolve('data/task-smoke');
mkdirSync(output, { recursive: true });
const tasks = [
  { type: 'csv', fixture: '/near/demo', format: 'csv',
    hash: '41db277a79fb2579196eb99425c7e0de408665097e38c42c5d04459941704c2d' },
  { type: 'json_transform', fixture: '/jobs/demo/json_transform', format: 'json',
    hash: '4b7875f03d6ab02d2e974d2bd988fc08f42db21e0d3258cff691744b7b3f719c' },
  { type: 'data_quality_audit', fixture: '/jobs/demo/data_quality_audit', format: 'json',
    hash: 'da4ce5826dfe77832876b84192982100ba0e08e3f7b55e1f5632e8aa39145ad1' },
];
async function request(path, body, status = 200) {
  const response = await fetch(base + path, {
    ...(body === undefined ? {} : {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }),
    signal: AbortSignal.timeout(165_000),
  });
  const result = await response.json();
  assert.equal(response.status, status, JSON.stringify(result));
  return result;
}

const results = {};
for (const task of tasks) {
  const fixture = await request(task.fixture);
  const job = await request('/jobs', { spec: fixture.spec, input_base64: fixture.input_base64 }, 201);
  const path = '/jobs/' + job.id;
  const run = await request(path + '/run', {});
  assert.ok(run.inference.generated_tokens > 0);
  const enabled = task.type === 'csv'
    ? ['normalize_column_names', 'trim_whitespace', 'remove_empty_rows', 'fill_missing', 'remove_duplicates']
    : Object.keys(fixture.spec.rules);
  assert.deepEqual(run.operations, enabled);
  const response = await fetch(base + path + '/artifact', { signal: AbortSignal.timeout(30_000) });
  assert.equal(response.status, 200);
  assert.ok(response.headers.get('content-disposition')?.includes('artifact.' + task.format));
  const artifact = Buffer.from(await response.arrayBuffer());
  assert.equal(createHash('sha256').update(artifact).digest('hex'), task.hash);
  assert.equal(run.artifact_sha256, task.hash);
  const verified = await request(path + '/verify', {});
  assert.equal(verified.passed, true);
  const rejected = await request(path + '/verify', { artifact_base64: fixture.defective_base64 });
  assert.equal(rejected.passed, false);
  assert.deepEqual(await request(path + '/challenge'), rejected);
  assert.equal((await request(path)).verification.passed, true);
  writeFileSync(resolve(output, task.type + '-artifact.' + task.format), artifact);
  results[task.type] = { job: job.id, spec: fixture.spec, run, verified, rejected };
  console.log(task.type + ' passed real inference, downloaded-byte integrity, verification, and defect rejection');
}
writeFileSync(resolve(output, 'results.json'), JSON.stringify(results, null, 2) + '\n');
console.log('Evidence saved to data/task-smoke/results.json');
