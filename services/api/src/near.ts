import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import type { DatabaseSync } from 'node:sqlite';
import express, { type RequestHandler } from 'express';
import { localOnly } from './worker.js';
import { NearReader, RpcError } from './near-rpc.js';
import { NearJournal, type Entry } from './near-journal.js';
import {
  demoArtifact, digest, inspectTransaction, IntentError, isJobId, prepareIntent, reconcileJob,
  sequences, signerRole, type Method, type Mode,
} from './near-intents.js';

const demoSpec = '6112127c82bc59c4d16b730bc0aaa4138f2969a02320cfecf0712333e8772200';
const demoBad = '132f5e6720257a9dbed84902cb8e0845adf4db2d9aa04f9799ba0f748b2a08da';
const demoFailure = '9b587d3dd48c72feef7cb2e18b183ea035de4e2a201948299568a7fefeea0d5b';
const demoPass = '580570d6c797f57704a30d1cc9e7c7dc8aa1b3bb86d2649b4cfcaaba6c6d1b8e';
const localIdPattern = /^[a-f0-9]{32}$/;
const explorer = (hash: string) => `https://testnet.nearblocks.io/txns/${hash}`;
const expose = (entry: Entry) => ({ ...entry, explorer: entry.hash ? explorer(entry.hash) : null });

function publishedTransactions(root: string) {
  const report = JSON.parse(readFileSync(join(root, 'docs', 'phase4-onchain-results.json'), 'utf8'));
  if (report.status !== 'completed' || report.jobs?.A !== '1' || report.jobs?.B !== '2') {
    throw new Error('Published demo evidence is incomplete');
  }
  return (report.rows as Array<{
    status: string; hash: string; job?: { id: string }; intent: Entry['intent'];
    transfer_receipt?: string; callback_receipt?: string;
  }>).filter(row => row.status === 'verified').map(row => ({
    id: row.hash, status: 'finalized' as const, hash: row.hash, explorer: explorer(row.hash),
    jobId: row.job?.id, intent: row.intent,
    result: { transfer_receipt: row.transfer_receipt, callback_receipt: row.callback_receipt },
  }));
}

export interface NearConfig { reader: NearReader; projectRoot: string; workspace: string }

export function nearRoutes(db: DatabaseSync, config: NearConfig) {
  const router = express.Router();
  router.use(localOnly, express.json({ limit: '16kb' }));
  const chain = config.reader;
  const journal = new NearJournal(db);
  const getLocal = db.prepare('SELECT local_run_json, input_hash FROM jobs WHERE id = ? AND local_run_json IS NOT NULL');
  const handle = (handler: RequestHandler): RequestHandler => async (req, res, next) => {
    try { await handler(req, res, next); }
    catch (error) {
      if (error instanceof RpcError) res.status(503).json({ error: error.message });
      else if (error instanceof IntentError) res.status(error.status).json({ error: error.message });
      else next(error);
    }
  };
  function local(id: string) {
    const row = localIdPattern.test(id) ? getLocal.get(id) : null;
    if (!row) throw new IntentError('Local job not found', 404);
    return { run: JSON.parse(String(row.local_run_json)), inputHash: String(row.input_hash) };
  }

  router.get('/demo', handle((_req, res) => {
    const directory = join(config.projectRoot, 'docs', 'phase3-demo');
    const spec = readFileSync(join(directory, 'task-spec.json'));
    const input = readFileSync(join(directory, 'input.csv'));
    const defective = readFileSync(join(directory, 'defective-fixture.csv'));
    const criteria = JSON.parse(spec.toString());
    if (digest(spec) !== demoSpec || digest(input) !== criteria.input_sha256 || digest(defective) !== demoBad) {
      throw new IntentError('Published demo files changed');
    }
    res.json({ spec: criteria, input_base64: input.toString('base64'), defective_base64: defective.toString('base64') });
  }));

  router.get('/config', handle(async (_req, res) => {
    const block = await chain.block();
    res.json({ network: 'testnet', source: chain.endpoint, block,
      ...await chain.configuration(block), roles: chain.roles });
  }));
  router.get('/jobs/:id', handle(async (req, res) => {
    const id = req.params.id;
    if (!isJobId(id)) throw new IntentError('Invalid onchain job ID', 400);
    const block = await chain.block();
    const job = await chain.job(block, id);
    if (!job) throw new IntentError('Onchain job not found', 404);
    const published = id === '1' || id === '2';
    const transactions = published ? publishedTransactions(config.projectRoot).filter(row => row.jobId === id)
      : id === '0' ? journal.list('cleanup:0').map(expose) : [];
    res.json({ network: 'testnet', block, job, transactions, receipt_source: published ? 'published_finalized_record' : 'local_journal' });
  }));
  router.get('/links/:id', handle(async (req, res) => {
    const id = String(req.params.id);
    local(id);
    const link = journal.link(id);
    const transactions = journal.list(id).map(expose);
    if (!link) { res.json({ link: null, job: null, transactions }); return; }
    try {
      const block = await chain.block();
      const job = await chain.job(block, link.chain_id);
      if (!job) throw new RpcError('Mapped job unavailable at finalized block');
      res.json({ link, block, job, transactions });
    } catch (error) {
      if (!(error instanceof RpcError)) throw error;
      res.status(503).json({ link, job: null, transactions, error: error.message });
    }
  }));

  router.post('/prepare', handle(async (req, res) => {
    const body = req.body;
    if (!body || Object.keys(body).sort().join(',') !== 'method,mode,scope,signer'
      || typeof body.scope !== 'string' || typeof body.signer !== 'string'
      || typeof body.method !== 'string' || !Object.hasOwn(signerRole, body.method)
      || !['success', 'challenge', 'cleanup'].includes(body.mode)) {
      throw new IntentError('Expected scope, method, mode and signer only', 400);
    }
    const { scope, method, mode, signer } = body as { scope: string; method: Method; mode: Mode; signer: string };
    if (signer !== chain.roles[signerRole[method]]) throw new IntentError('Wrong signer for this action', 403);
    if ((scope === 'cleanup:0') !== (mode === 'cleanup')) throw new IntentError('Cleanup is scoped to job 0 only');
    const source = mode === 'cleanup' ? null : local(scope);
    const link = journal.link(scope);
    if (link && link.mode !== mode) throw new IntentError('Workflow mode cannot change after creation');
    const entries = journal.list(scope);
    const existing = entries.find(entry => entry.intent.method === method);
    if (existing) {
      if (existing.intent.mode !== mode) throw new IntentError('An incompatible intent already exists');
      res.json(expose(existing));
      return;
    }
    if (entries.some(entry => entry.status !== 'finalized')) throw new IntentError('Reconcile the previous intent first');
    if (sequences[mode][entries.length] !== method) throw new IntentError('Prepare only the next action in the workflow');
    if (mode === 'challenge' && source?.run.specification_sha256 !== demoSpec) throw new IntentError('Seeded challenge requires the published demo task');
    const block = await chain.block();
    const now = BigInt(block.timestamp_nanosec);
    if (BigInt(Date.now()) * 1_000_000n - now > 300_000_000_000n) throw new RpcError('Finalized RPC block is too old to prepare a transaction');
    const cfg = await chain.configuration(block);
    const chainId = mode === 'cleanup' ? '0' : link?.chain_id;
    const job = chainId ? await chain.job(block, chainId) : null;
    if (chainId && !job) throw new RpcError('Mapped job unavailable at finalized block');

    let artifact: string | undefined;
    let reportHash: string | undefined;
    if (['submit_work', 'attest_verification', 'open_challenge', 'resolve_challenge'].includes(method)) {
      if (mode === 'challenge') {
        const directory = join(config.projectRoot, 'docs', 'phase3-demo');
        artifact = digest(readFileSync(join(directory, 'defective-fixture.csv')));
        reportHash = digest(readFileSync(join(directory, 'challenge-evidence.json')));
        if (artifact !== demoBad || reportHash !== demoFailure) throw new IntentError('Published fixture or evidence bytes changed');
      } else if (source) {
        if (source.run.status !== 'succeeded' || !source.run.verification) throw new IntentError('Run and independently verify the saved artifact first');
        const directory = resolve(config.workspace, scope);
        if (relative(directory, realpathSync(directory))) throw new IntentError('Invalid artifact workspace');
        const path = join(directory, 'artifact.csv');
        const stat = lstatSync(path);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 5 * 1024 * 1024) throw new IntentError('Invalid artifact file');
        artifact = digest(readFileSync(path));
        const verification = source.run.verification;
        const check = verification ? JSON.parse(verification) : null;
        if (source.run.status !== 'succeeded' || artifact !== source.run.report?.artifact_sha256
          || check?.passed !== true || check.job_id !== scope || check.input_sha256 !== source.inputHash
          || check.artifact_sha256 !== artifact || check.specification_sha256 !== source.run.specification_sha256) {
          throw new IntentError('Run and independently verify the saved artifact first');
        }
        reportHash = digest(verification);
        if (source.run.specification_sha256 === demoSpec) {
          if (artifact !== demoArtifact) throw new IntentError('Actual cleaned artifact differs from the approved demo hash');
          const published = readFileSync(join(config.projectRoot, 'docs', 'phase3-demo', 'verification.json'));
          const publishedCheck = JSON.parse(published.toString());
          if (digest(published) !== demoPass || !isDeepStrictEqual({ ...check, job_id: publishedCheck.job_id }, publishedCheck)) {
            throw new IntentError('The new verification differs from the published demo evidence');
          }
          reportHash = digest(published);
        }
      }
    }
    const intent = prepareIntent({
      method, signer, roles: chain.roles, mode, now, quote: cfg.storage_quote,
      spec: source?.run.specification_sha256 ?? '', job, artifact, reportHash,
    });
    const account = await chain.account(block, signer);
    const gas = await chain.gasPrice(block);
    const storage = await chain.protocol(block);
    const liquid = BigInt(account.amount) - BigInt(account.storage_usage) * BigInt(storage.runtime_config.storage_amount_per_byte);
    if (liquid < BigInt(intent.deposit) + BigInt(intent.gas) * BigInt(gas.gas_price) + 10n ** 21n) {
      throw new IntentError('Signer has insufficient testnet liquidity for deposit and gas headroom');
    }
    res.status(201).json(expose(journal.prepare(scope, intent)));
  }));

  router.post('/intents/:id/reconcile', handle(async (req, res) => {
    if (!req.body || Object.keys(req.body).join(',') !== 'hash' || typeof req.body.hash !== 'string') {
      throw new IntentError('Expected a public transaction hash', 400);
    }
    const entry = journal.register(String(req.params.id), req.body.hash);
    if (entry.status !== 'pending') { res.json(expose(entry)); return; }
    const hash = entry.hash!;
    let tx;
    try { tx = await chain.transaction(hash, entry.intent.signer); }
    catch (error) {
      if (error instanceof RpcError && error.unknownTx) {
        res.status(202).json({ ...expose(entry), detail: error.message });
        return;
      }
      throw error;
    }
    const result = inspectTransaction(entry.intent, hash, tx);
    if (result.status === 'pending') { res.status(202).json(expose(entry)); return; }
    if (result.status === 'finalized') {
      const block = await chain.block();
      const job = await chain.job(block, result.job_id ?? String(entry.intent.args.job_id));
      if (!job) throw new RpcError('Final receipt is visible, but job state is unavailable');
      reconcileJob(entry.intent, job, result);
    }
    const current = journal.entry(entry.id);
    res.json(expose(current.status === 'pending' ? journal.complete(entry.id, result) : current));
  }));
  return router;
}
