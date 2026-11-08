import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const base = 'http://127.0.0.1:3001';
const destination = process.argv[2] ?? 'data/phase3-demo';
const sha256 = data => createHash('sha256').update(data).digest('hex');
const source = Buffer.from(' User ID , Name ,Team\n001, Alice ,Red\n001,Alice,Red\n\n002, Bob ,\n003,Chidi, Blue \n');
const defective = Buffer.from('"user_id","name","team"\n"001","Alice","Red"\n"003","Chidi","Blue"\n');
const expected = Buffer.from('"user_id","name","team"\n"001","Alice","Red"\n"002","Bob","Unassigned"\n"003","Chidi","Blue"\n');
const spec = {
  fill_missing: { team: 'Unassigned' },
  input_sha256: sha256(source),
  normalize_column_names: true,
  remove_duplicates: true,
  remove_empty_rows: true,
  schema_version: 1,
  trim_whitespace: true,
};
const specBytes = JSON.stringify(spec) + '\n';
const post = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

async function request(path, status, options) {
  const response = await fetch(base + path, { ...options, signal: AbortSignal.timeout(165_000) });
  assert.equal(response.status, status, `${path}: HTTP ${response.status}${response.status === status ? '' : ' ' + await response.text()}`);
  return response;
}

const job = await (await request('/jobs', 201, post({ spec, input_base64: source.toString('base64') }))).json();
assert.equal(job.specification_sha256, sha256(specBytes));
const path = '/jobs/' + job.id;
const report = await (await request(path + '/run', 200, { method: 'POST' })).json();
assert.equal(report.status, 'succeeded');
assert.ok(report.inference.generated_tokens > 0);
assert.equal(report.input_rows, 5);
assert.equal(report.output_rows, 3);
const artifact = Buffer.from(await (await request(path + '/artifact', 200)).arrayBuffer());
assert.deepEqual(artifact, expected);
assert.equal(report.artifact_sha256, sha256(artifact));

const verification = await (await request(path + '/verify', 200, { method: 'POST' })).text();
assert.equal(JSON.parse(verification).passed, true);
const challenge = await (await request(path + '/verify', 200, post({ artifact_base64: defective.toString('base64') }))).text();
const failure = JSON.parse(challenge);
assert.equal(failure.passed, false);
assert.equal(failure.artifact_sha256, sha256(defective));
assert.deepEqual(failure.mismatch.expected.cells, ['002', 'Bob', 'Unassigned']);
assert.equal(challenge, await (await request(path + '/challenge', 200)).text());
assert.equal(challenge, await (await request(path + '/verify', 200, post({ artifact_base64: defective.toString('base64') }))).text());
const status = await (await request(path, 200)).json();
assert.equal(status.status, 'succeeded');
assert.equal(status.verification.passed, true);
assert.equal(status.challenge_available, true);
assert.deepEqual(report, await (await request(path + '/run', 200, { method: 'POST' })).json());

const malformed = Buffer.from('a,b\none\n');
await request('/jobs', 422, post({ spec: { ...spec, input_sha256: sha256(malformed) }, input_base64: malformed.toString('base64') }));
await request('/jobs/..%2f..%2fartifact.csv/artifact', 404);
await request('/jobs', 403, { ...post({}), headers: { ...post({}).headers, Origin: 'https://example.invalid' } });

const manifest = {
  job_id: job.id,
  inference: report.inference,
  specification_sha256: sha256(specBytes),
  input_sha256: sha256(source),
  artifact_sha256: sha256(artifact),
  verification_sha256: sha256(verification),
  defective_artifact_sha256: sha256(defective),
  challenge_evidence_sha256: sha256(challenge),
  challenge_fixture: 'Intentionally defective test fixture: removed row 002,Bob,Unassigned.',
  verification_passed: true,
  defective_verification_passed: false,
};
await mkdir(destination, { recursive: true });
for (const [file, bytes] of Object.entries({
  'input.csv': source, 'task-spec.json': specBytes, 'cleaned.csv': artifact,
  'execution.json': JSON.stringify(report, null, 2) + '\n',
  'verification.json': verification, 'defective-fixture.csv': defective,
  'challenge-evidence.json': challenge, 'manifest.json': JSON.stringify(manifest, null, 2) + '\n',
})) {
  await writeFile(join(destination, file), bytes);
}
console.log(JSON.stringify(manifest, null, 2));
