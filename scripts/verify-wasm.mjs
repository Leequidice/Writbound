import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const path = resolve(process.argv[2] ?? 'contracts/writbound-escrow/target/near/writbound_escrow.wasm');
const bytes = readFileSync(path);
if (!WebAssembly.validate(bytes)) throw new Error('Invalid WASM module');
const module = new WebAssembly.Module(bytes);
const exports = WebAssembly.Module.exports(module);
const expected = ['new','version','get_verifier','storage_quote','get_accounting','get_job','get_job_count','list_jobs',
  'create_job','accept_job','submit_work','attest_verification','open_challenge','resolve_challenge',
  'cancel_job','expire_job','settle_job','refund_job','on_transfer'];
for (const name of expected) {
  if (!exports.some(entry => entry.name === name && entry.kind === 'function')) throw new Error(`Missing escrow entrypoint: ${name}`);
}
const imports = WebAssembly.Module.imports(module);
if (imports.some(entry => entry.module !== 'env')) throw new Error('Unexpected non-NEAR import namespace');
console.log(JSON.stringify({path, bytes:bytes.length, sha256:createHash('sha256').update(bytes).digest('hex'), valid:true, verifiedEntrypoints:expected.length, exports, imports}, null, 2));
