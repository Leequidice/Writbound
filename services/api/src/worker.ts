import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, realpathSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import express, { type RequestHandler } from 'express';

const maxInputBytes = 5 * 1024 * 1024;
const maxSpecBytes = 16 * 1024;
const jsonTasks = ['json_transform', 'data_quality_audit'] as const;
type JsonTask = (typeof jsonTasks)[number];
const extension = (run: Run) => run.task_type ? 'json' : 'csv';
export const localOnly: RequestHandler = (req, res, next) => {
  const origin = req.get('Origin');
  if (!['127.0.0.1', 'localhost'].includes(req.hostname)
    || (origin && !['http://127.0.0.1:5173', 'http://localhost:5173'].includes(origin))) {
    res.status(403).json({ error: 'Use the local dashboard or a same-machine client' });
    return;
  }
  next();
};

export interface WorkerConfig {
  workspace: string;
  projectRoot: string;
  python: string;
  model: string;
}

interface Run {
  status: 'ready' | 'running' | 'failed' | 'succeeded';
  task_type?: JsonTask;
  specification_sha256: string;
  report?: Record<string, unknown>;
  verification?: string;
  challenge?: string;
}

interface LocalJob {
  id: string;
  criteria_json: string;
  input_hash: string;
  local_run_json: string;
}

class RequestError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

function decodeUpload(value: unknown): Buffer {
  if (typeof value !== 'string' || value.length > 4 * Math.ceil(maxInputBytes / 3)) {
    throw new RequestError(400, 'Provide base64 file bytes up to 5 MiB');
  }
  const data = Buffer.from(value, 'base64');
  if (data.length > maxInputBytes || data.toString('base64') !== value) {
    throw new RequestError(400, 'Invalid or oversized base64 upload');
  }
  return data;
}

function runPython(config: WorkerConfig, command: string, directory: string, id: string, spec: string) {
  // The child needs OS runtime variables only. Never pass app, wallet, or proxy environment variables.
  const env = Object.fromEntries(
    ['SystemRoot', 'WINDIR', 'PATH', 'TEMP', 'TMP'].map(key => [key, process.env[key]]),
  );
  return new Promise<{ ok: boolean; raw: string; data: Record<string, unknown> }>(resolveResult => {
    const child = execFile(config.python, [
      '-E', '-s', '-m', 'writbound_worker', command, directory, id, '--model', config.model,
    ], {
      cwd: join(config.projectRoot, 'services', 'worker', 'src'),
      env, windowsHide: true, timeout: command === 'run' ? 150_000 : 30_000, maxBuffer: 64 * 1024,
    }, (error, stdout) => {
      try {
        const data = JSON.parse(stdout);
        if (data.job_id === id || (command === 'validate' && typeof data.specification_sha256 === 'string')) {
          resolveResult({ ok: !error, raw: stdout, data });
          return;
        }
      } catch {
        // Keep subprocess paths, environment and diagnostic output out of HTTP responses.
      }
      resolveResult({
        ok: false,
        raw: '',
        data: {
          job_id: id, status: 'failed', operations: [], input_sha256: null,
          artifact_sha256: null, input_rows: null, output_rows: null,
          errors: [error?.killed ? 'Worker exceeded execution limit' : 'Worker could not run; check Python and dependencies'],
        },
      });
    });
    child.stdin?.on('error', () => {});
    child.stdin?.end(spec);
  });
}

export function workerRoutes(db: DatabaseSync, config: WorkerConfig) {
  const router = express.Router();
  const root = resolve(config.workspace);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  if (relative(root, realpathSync(root))) throw new Error('Worker workspace must not redirect');

  const getJob = db.prepare('SELECT id, criteria_json, input_hash, local_run_json FROM jobs WHERE id = ? AND local_run_json IS NOT NULL');
  const saveRun = db.prepare('UPDATE jobs SET local_run_json = ? WHERE id = ?');
  let busy = false;

  function workspace(id: string) {
    const path = join(root, id);
    if (relative(path, realpathSync(path)) || !lstatSync(path).isDirectory()) {
      throw new RequestError(409, 'Invalid job workspace');
    }
    return path;
  }

  const exclusive = (handler: RequestHandler): RequestHandler => async (req, res, next) => {
    if (busy) { res.status(409).json({ error: 'Local worker is busy' }); return; }
    busy = true;
    try {
      // Upload parsing can yield after router.param. Reload before changing state.
      if (req.params.id) {
        const job = getJob.get(String(req.params.id)) as unknown as LocalJob | undefined;
        if (!job) throw new RequestError(404, 'Local job not found');
        res.locals.job = job;
        res.locals.run = JSON.parse(job.local_run_json) as Run;
      }
      await handler(req, res, next);
    }
    catch (error) {
      if (error instanceof RequestError) res.status(error.status).json({ error: error.message });
      else next(error);
    } finally { busy = false; }
  };

  router.use(localOnly);
  const upload = express.json({ limit: '7mb', strict: true, inflate: false });

  router.param('id', (_req, res, next, id: string) => {
    const job = /^[a-f0-9]{32}$/.test(id) ? getJob.get(id) as unknown as LocalJob | undefined : undefined;
    if (!job) { res.status(404).json({ error: 'Local job not found' }); return; }
    res.locals.job = job;
    res.locals.run = JSON.parse(job.local_run_json) as Run;
    next();
  });

  router.post('/', upload, exclusive(async (req, res) => {
    const body = req.body;
    if (!body || Object.keys(body).length !== 2 || !Object.hasOwn(body, 'spec') || !Object.hasOwn(body, 'input_base64')) {
      throw new RequestError(400, 'Expected spec and input_base64');
    }
    const spec = JSON.stringify(body.spec);
    if (Buffer.byteLength(spec) > maxSpecBytes) throw new RequestError(413, 'Specification exceeds 16 KiB');
    const taskType = body.spec?.task_type as JsonTask | undefined;
    if (taskType !== undefined && !jsonTasks.includes(taskType)) throw new RequestError(422, 'Unsupported task type');
    const input = decodeUpload(body.input_base64);
    const id = randomUUID().replaceAll('-', '');
    const directory = join(root, id);
    mkdirSync(directory, { mode: 0o700 });
    const inputPath = join(directory, taskType ? 'input.json' : 'input.csv');
    let created = false;
    try {
      writeFileSync(inputPath, input, { flag: 'wx', mode: 0o600 });
      const result = await runPython(config, 'validate', workspace(id), id, spec);
      if (!result.ok) { res.status(422).json(result.data); return; }
      const run: Run = { status: 'ready', specification_sha256: String(result.data.specification_sha256) };
      if (taskType) run.task_type = taskType;
      const hash = createHash('sha256').update(input).digest('hex');
      db.prepare(`INSERT INTO jobs (id, customer_account_id, criteria_json, input_hash, local_run_json)
        VALUES (?, 'local', ?, ?, ?)`).run(id, spec, hash, JSON.stringify(run));
      created = true;
      res.status(201).json({ id, input_sha256: hash, ...run });
    } finally {
      if (!created) {
        try { unlinkSync(inputPath); } catch {}
        rmdirSync(directory);
      }
    }
  }));

  router.get('/demo/:task', (req, res, next) => {
    const task = req.params.task as JsonTask;
    if (!jsonTasks.includes(task)) { res.status(404).json({ error: 'Unknown demo task' }); return; }
    try {
      const directory = join(config.projectRoot, 'docs', 'task-demos', task);
      const input = readFileSync(join(directory, 'input.json'));
      const defective = readFileSync(join(directory, 'defective.json'));
      const spec = JSON.parse(readFileSync(join(directory, 'spec.json'), 'utf8'));
      if (spec.task_type !== task || spec.input_sha256 !== createHash('sha256').update(input).digest('hex')) {
        throw new Error('Demo input and specification do not match');
      }
      res.json({ spec, input_base64: input.toString('base64'), defective_base64: defective.toString('base64') });
    } catch (error) { next(error); }
  });

  router.get('/:id', (_req, res) => {
    const job: LocalJob = res.locals.job;
    const run: Run = res.locals.run;
    res.json({
      id: job.id, spec: JSON.parse(job.criteria_json), input_sha256: job.input_hash,
      task_type: run.task_type,
      specification_sha256: run.specification_sha256, status: run.status, report: run.report ?? null,
      verification: run.verification ? JSON.parse(run.verification) : null,
      challenge_available: Boolean(run.challenge),
    });
  });

  router.post('/:id/run', exclusive(async (_req, res) => {
    const job: LocalJob = res.locals.job;
    const run: Run = res.locals.run;
    if (run.status === 'succeeded') { res.json(run.report); return; }
    const directory = workspace(job.id);
    // A stopped API may leave an uncommitted temporary file. One API owns this workspace.
    try { unlinkSync(join(directory, 'artifact.tmp')); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    run.status = 'running';
    saveRun.run(JSON.stringify(run), job.id);
    const result = await runPython(config, 'run', directory, job.id, job.criteria_json);
    run.status = result.ok ? 'succeeded' : 'failed';
    run.report = { ...result.data, input_sha256: job.input_hash };
    saveRun.run(JSON.stringify(run), job.id);
    res.status(result.ok ? 200 : 422).json(run.report);
  }));

  router.get('/:id/artifact', (_req, res, next) => {
    const job: LocalJob = res.locals.job;
    const run: Run = res.locals.run;
    if (run.status !== 'succeeded') { res.status(404).json({ error: 'Artifact unavailable' }); return; }
    try {
      const format = extension(run);
      const path = join(workspace(job.id), 'artifact.' + format);
      const stat = lstatSync(path);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxInputBytes) throw new Error('Invalid artifact file');
      const artifact = readFileSync(path);
      if (createHash('sha256').update(artifact).digest('hex') !== run.report?.artifact_sha256) throw new Error('Artifact integrity failure');
      res.attachment('artifact.' + format).type(format === 'csv' ? 'text/csv' : 'application/json').send(artifact);
    } catch (error) { next(error); }
  });

  router.post('/:id/verify', upload, exclusive(async (req, res) => {
    const job: LocalJob = res.locals.job;
    const run: Run = res.locals.run;
    if (run.status !== 'succeeded') throw new RequestError(409, 'Complete worker execution first');
    const directory = workspace(job.id);
    const body = req.body ?? {};
    const fields = Object.keys(body);
    if (fields.length && (fields.length !== 1 || fields[0] !== 'artifact_base64')) {
      throw new RequestError(400, 'Expected no body or artifact_base64');
    }
    const candidate = fields.length ? decodeUpload(body.artifact_base64) : null;
    const path = join(directory, 'candidate.' + extension(run));
    if (candidate) {
      try { unlinkSync(path); } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      writeFileSync(path, candidate, { flag: 'wx', mode: 0o600 });
    }
    try {
      const result = await runPython(config, candidate ? 'verify-candidate' : 'verify', directory, job.id, job.criteria_json);
      if (!result.ok) { res.status(422).json(result.data); return; }
      if (!candidate) run.verification = result.raw;
      if (result.data.passed === false) run.challenge = result.raw;
      saveRun.run(JSON.stringify(run), job.id);
      res.type('json').send(result.raw);
    } finally {
      if (candidate) unlinkSync(path);
    }
  }));

  router.get('/:id/challenge', (_req, res) => {
    const run: Run = res.locals.run;
    if (!run.challenge) { res.status(404).json({ error: 'No failed verification evidence' }); return; }
    res.type('json').send(run.challenge);
  });

  return router;
}
