import React, { useState, type FormEvent, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { chainLabel, nextMethod, nsDate, signerRoles, type ChainView, type Mode, type Transaction } from './workflow';
import { finalizedOutcome, historicalOutcomes, taskTypes, workflowSteps, type HistoricalJobId, type TaskType } from './demo';
import './style.css';

const pages = ['Overview', 'Jobs', 'Worker', 'Challenges', 'Treasury'] as const;
const requirements = {
  normalize_column_names: 'Normalize column names',
  trim_whitespace: 'Trim cell whitespace',
  remove_empty_rows: 'Remove empty rows',
  remove_duplicates: 'Remove duplicate rows',
};
type LocalJob = {
  id: string; status: string; input_sha256: string; specification_sha256: string;
  task_type?: Exclude<TaskType, 'csv'>;
  spec?: object;
  report?: {
    artifact_sha256?: string; input_rows?: number; output_rows?: number; operations?: string[]; errors?: string[];
    records_audited?: number; finding_count?: number; rules_passed?: boolean;
    inference?: { model: string; wall_ms: number };
  };
  verification?: Verification;
  challenge_available?: boolean;
};
type ChainConfig = { contract: string; roles: Record<string, string>; storage_quote: string; version: string };
type Verification = {
  passed: boolean; artifact_sha256: string; task_type?: Exclude<TaskType, 'csv'>;
  mismatch?: {
    kind: string; data_row?: number; expected?: { cells?: string[] }; actual?: { cells?: string[] };
    path?: string; expected_text?: string; actual_text?: string;
  } | null;
};
type Demo = { spec: object; input_base64: string; defective_base64: string };
const demoPath = (task: TaskType) => task === 'csv' ? '/near/demo' : '/jobs/demo/' + task;

class ApiError extends Error {
  constructor(readonly body: { error?: string; errors?: string[] }) {
    super(body.error ?? body.errors?.join('; ') ?? 'API request failed');
  }
}
async function api<T>(path: string, body?: object): Promise<T> {
  const response = await fetch('/api' + path, body === undefined ? undefined : {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new ApiError(data);
  return data;
}
function base64(file: File): Promise<string> {
  if (file.size > 5 * 1024 * 1024) throw new Error('Upload exceeds 5 MiB');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.readAsDataURL(file);
  });
}
const card = 'rounded-2xl border border-white/10 bg-white/[0.02] p-5 md:p-7 space-y-4';
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section className={card}><h2 className="text-lg font-semibold">{title}</h2>{children}</section>;
}
function Data({ value }: { value: unknown }) {
  return <pre className="max-h-96 overflow-auto rounded bg-black/30 p-3 text-xs">{JSON.stringify(value, null, 2)}</pre>;
}
function VerificationSummary({ report }: { report: Verification }) {
  const mismatch = report.mismatch;
  return <div className="space-y-2">
    <p className={report.passed ? 'text-lime-300 font-medium' : 'text-amber-300 font-medium'}>
      Independent verification · {report.passed ? 'Passed' : 'Failed'}
    </p>
    {report.passed && <p>{report.task_type === 'data_quality_audit' ? 'The audit report matches the independently reproduced findings.' :
      report.task_type === 'json_transform' ? 'The transformed JSON matches the independently reproduced records.' :
      'The artifact matches the output reproduced from the original CSV and task spec.'}</p>}
    {mismatch && <p className="break-words">
      {mismatch.path ? <>First mismatch at <code>{mismatch.path}</code>. Expected <code>{mismatch.expected_text}</code>. Found <code>{mismatch.actual_text}</code>.</> :
        mismatch.data_row ? `First mismatch at data row ${mismatch.data_row}.` : mismatch.kind.replaceAll('_', ' ')}
      {mismatch.expected?.cells && <> Expected <code>{mismatch.expected.cells.join(', ')}</code>.</>}
      {mismatch.actual?.cells && <> Found <code>{mismatch.actual.cells.join(', ')}</code>.</>}
    </p>}
    <p className="break-all text-xs text-slate-400">Artifact SHA-256 {report.artifact_sha256}</p>
    <details><summary>Full verification report</summary><Data value={report} /></details>
  </div>;
}
function Receipts({ transactions }: { transactions: Transaction[] }) {
  if (!transactions.length) return <p className="text-slate-400">No transaction references for this selection.</p>;
  return <ul className="space-y-3">{transactions.map(tx => <li key={tx.id} className="rounded border border-white/10 p-3">
    <p className="font-medium">{tx.intent.method} · {tx.status}</p>
    {tx.explorer && <a href={tx.explorer} target="_blank" rel="noreferrer" className="break-all text-lime-300">{tx.hash}</a>}
    {tx.result?.transfer_receipt && <dl className="mt-2 break-all text-xs text-slate-300">
      <dt>Beneficiary</dt><dd>{tx.intent.beneficiary?.account_id}</dd>
      <dt>Amount (yoctoNEAR)</dt><dd>{tx.intent.beneficiary?.amount}</dd>
      <dt>Final transfer receipt</dt><dd>{tx.result.transfer_receipt}</dd>
      <dt>Final callback receipt</dt><dd>{tx.result.callback_receipt}</dd>
    </dl>}
    {tx.status === 'failed' && <Data value={tx.result?.failure} />}
  </li>)}</ul>;
}

function App() {
  const [page, setPage] = useState<(typeof pages)[number]>('Overview');
  const [formTask, setFormTask] = useState<TaskType>('csv');
  const [job, setJob] = useState<LocalJob | null>(null);
  const [jobInput, setJobInput] = useState(localStorage.getItem('writbound-local-job') ?? '');
  const [chain, setChain] = useState<ChainView | null>(null);
  const [config, setConfig] = useState<ChainConfig | null>(null);
  const [mode, setMode] = useState<Mode>('success');
  const [txHash, setTxHash] = useState('');
  const [evidence, setEvidence] = useState<Verification | null>(null);
  const [published, setPublished] = useState<Partial<Record<HistoricalJobId, ChainView>>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function task(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError('');
    try { await action(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Request failed'); }
    finally { setBusy(''); }
  }
  async function select(id: string) {
    setJob(null);
    setChain(null);
    setConfig(null);
    setEvidence(null);
    setTxHash('');
    setMode('success');
    const current = await api<LocalJob>('/jobs/' + encodeURIComponent(id));
    setJob(current);
    setJobInput(current.id);
    localStorage.setItem('writbound-local-job', current.id);
  }
  async function refreshChain(selectedMode = mode) {
    const path = selectedMode === 'cleanup' ? '/near/jobs/0' : job ? '/near/links/' + job.id : null;
    if (!path) throw new Error('Open a local job or select job 0 cleanup');
    setChain(null);
    let observed: ChainView | null = null;
    try {
      const state = await api<ChainView>(path);
      observed = state;
      setChain(state);
      const savedMode = state.link?.mode ?? state.transactions[0]?.intent.mode;
      if (savedMode) setMode(savedMode);
      setConfig(await api<ChainConfig>('/near/config'));
    } catch (err) {
      setConfig(null);
      const data = err instanceof ApiError ? err.body as ChainView : null;
      setChain({ job: null, transactions: data?.transactions ?? observed?.transactions ?? [], error: err instanceof Error ? err.message : 'RPC unavailable' });
      throw err;
    }
  }
  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void task('Validating input and rules', async () => {
      const file = form.get('dataset');
      const suffix = '.' + taskTypes[formTask].format;
      if (!(file instanceof File) || !file.name.toLowerCase().endsWith(suffix)) throw new Error('Choose a ' + suffix + ' file');
      const input_base64 = await base64(file);
      const bytes = await file.arrayBuffer();
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
      const spec = formTask === 'csv' ? { schema_version: 1, input_sha256: hash, fill_missing: JSON.parse(String(form.get('fill'))),
        ...Object.fromEntries(Object.keys(requirements).map(flag => [flag, form.has(flag)])) }
        : { schema_version: 1, input_sha256: hash, task_type: formTask, rules: JSON.parse(String(form.get('rules'))) };
      const result = await api<LocalJob>('/jobs', { spec, input_base64 });
      await select(result.id);
    });
  }
  async function demo(type: TaskType) {
    const { spec, input_base64 } = await api<Demo>(demoPath(type));
    await select((await api<LocalJob>('/jobs', { spec, input_base64 })).id);
  }
  function startDemo(type: TaskType) {
    setFormTask(type);
    setPage('Jobs');
    void task('Creating local demo work order', () => demo(type));
  }
  async function readHistorical(id: HistoricalJobId) {
    setPublished(current => ({ ...current, [id]: undefined }));
    const view = await api<ChainView>('/near/jobs/' + id);
    if (!finalizedOutcome(id, view)) throw new Error('Could not confirm the expected finalized outcome and receipts for job #' + id);
    setPublished(current => ({ ...current, [id]: view }));
  }
  async function run() {
    if (!job) return;
    try { await api('/jobs/' + job.id + '/run', {}); }
    finally { setJob(await api<LocalJob>('/jobs/' + job.id)); }
  }
  async function verify(body: object = {}) {
    if (!job) return;
    const result = await api<Verification>('/jobs/' + job.id + '/verify', body);
    setJob(await api<LocalJob>('/jobs/' + job.id));
    if (Object.hasOwn(body, 'artifact_base64') || !result.passed) setEvidence(result);
  }

  const next = nextMethod(mode, chain);
  const currentType = job?.task_type ?? 'csv';
  const currentTask = taskTypes[currentType];
  const selectedTask = taskTypes[formTask];
  const outstanding = chain?.transactions.find(tx => tx.status === 'prepared' || tx.status === 'pending');
  const actionsLocked = Boolean(busy);
  const escrowPanel = <Panel title="NEAR testnet escrow">
    <p className="text-sm text-slate-400">Prepare unsigned calls for review. Account owners sign separately after approval. Paste the resulting transaction hash to reconcile receipts.</p>
    <div className="flex flex-wrap gap-2">
      <select aria-label="Workflow" value={mode} disabled={actionsLocked || Boolean(chain?.link || outstanding)} onChange={e => {
        setMode(e.target.value as Mode); setChain(null); setConfig(null); setTxHash('');
      }}>
        <option value="success" disabled={Boolean(job?.task_type)}>Successful settlement</option><option value="challenge" disabled={Boolean(job?.task_type)}>Seeded challenge refund</option><option value="cleanup">Expired job 0 cleanup</option>
      </select>
      <button disabled={actionsLocked || ((!job || job.task_type) && mode !== 'cleanup')} onClick={() => void task('Reading finalized NEAR state', () => refreshChain())}>Refresh finalized state</button>
      {(chain?.link || outstanding) && <button disabled={actionsLocked} onClick={() => {
        setChain(null); setConfig(null); setTxHash(''); setMode(mode === 'cleanup' ? 'success' : 'cleanup');
      }}>{mode === 'cleanup' ? 'Switch to local job' : 'Switch to job 0'}</button>}
    </div>
    <p className="text-sm" role="status">{chainLabel(chain)}</p>
    {config && <p className="break-all text-xs text-slate-400">{config.contract} · {config.version} · storage quote {config.storage_quote} yoctoNEAR</p>}
    {chain?.job && <dl className="text-sm">
      <dt>Onchain job</dt><dd>#{chain.job.id} · {chain.job.state}</dd>
      <dt>Work deadline (UTC)</dt><dd>{nsDate(chain.job.work_deadline)}</dd>
      <dt>Challenge window ends (UTC)</dt><dd>{nsDate(chain.job.submissions.at(-1)?.challenge_end)}</dd>
    </dl>}
    {chain?.job?.state === 'Verified' && mode === 'success' && !next && !outstanding &&
      <p className="text-sm text-slate-400">Refresh after the finalized challenge window ends to prepare settlement.</p>}
    {next && config && <button disabled={actionsLocked} onClick={() => void task('Preparing unsigned intent', async () => {
      await api('/near/prepare', { scope: mode === 'cleanup' ? 'cleanup:0' : job?.id, mode, method: next, signer: config.roles[signerRoles[next]] });
      await refreshChain();
    })}>Prepare {next}</button>}
    {outstanding && <>
      <details open><summary>Unsigned intent · {outstanding.status}</summary><Data value={outstanding.intent} /></details>
      <div className="flex flex-wrap gap-2">
        <input aria-label="Transaction hash" placeholder="External transaction hash" value={outstanding.hash ?? txHash} readOnly={Boolean(outstanding.hash)} onChange={e => setTxHash(e.target.value)} />
        <button disabled={actionsLocked || !(outstanding.hash ?? txHash).trim()} onClick={() => void task('Reconciling transaction', async () => {
          try {
            await api('/near/intents/' + outstanding.id + '/reconcile', { hash: (outstanding.hash ?? txHash).trim() });
            setTxHash('');
          } finally {
            await refreshChain();
          }
        })}>Reconcile hash</button>
      </div>
    </>}
  </Panel>;

  return <div className="min-h-screen md:flex">
    <aside className="border-r border-white/10 p-8 md:w-64 md:shrink-0">
      <a href="#" onClick={() => setPage('Overview')} className="text-2xl font-bold tracking-tight">writbound<span className="text-lime-300">.</span></a>
      <p className="mt-3 text-xs text-slate-400">Autonomous work.<br />Binding accountability.</p>
      <nav aria-label="Main navigation" className="mt-8 flex flex-wrap gap-2 md:flex-col">
        {pages.map(name => <button key={name} aria-current={page === name ? 'page' : undefined} onClick={() => setPage(name)}>{name}</button>)}
      </nav>
      <p className="mt-8 text-xs text-slate-400">LOCAL WORKSPACE<br />NEAR TESTNET EVIDENCE</p>
    </aside>
    <main className="min-w-0 max-w-[100rem] flex-1 space-y-6 p-6 md:p-10 xl:p-14">
      {page !== 'Overview' && <header>
        <p className="eyebrow">{page === 'Treasury' ? 'Historical · NEAR testnet' : page === 'Challenges' ? 'Verification and adjudication' : 'Local workspace'}</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">{page === 'Jobs' ? 'Work orders' : page}</h1>
      </header>}
      {busy && <p role="status" className="text-lime-300">{busy}…</p>}
      {error && <p role="alert" className="rounded border border-red-500/40 p-3 text-red-200">{error}</p>}
      {page === 'Overview' && <>
        <section className="hero rounded-3xl border border-white/10 p-7 md:p-12">
          <p className="eyebrow">Writbound / Autonomous work accountability</p>
          <h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight md:text-6xl">Autonomous work.<br /><span className="text-lime-300">Binding accountability.</span></h1>
          <p className="mt-5 max-w-3xl text-lg leading-relaxed text-slate-300">Define work, let an AI worker produce the deliverable, and verify the result independently. Explore evidence from challenged work and historical CSV escrow settlement on NEAR testnet.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <button className="primary" disabled={actionsLocked} onClick={() => startDemo('csv')}>Try the Data Cleaning Demo</button>
            <button onClick={() => setPage('Treasury')}>Explore Finalized NEAR Testnet Outcomes</button>
          </div>
        </section>
        <Panel title="From work order to settlement">
          <p className="text-slate-300">Local work orders run separately from the historical NEAR testnet demonstration.</p>
          <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">{workflowSteps.map(([title, description], index) =>
            <li key={title} className="rounded-xl border border-white/10 bg-black/15 p-4">
              <span className="eyebrow">0{index + 1}</span>
              <h3 className="my-2 font-semibold">{title}</h3><p className="text-sm leading-relaxed text-slate-300">{description}</p>
            </li>)}</ol>
        </Panel>
        <Panel title="Supported local work types">
          <div className="grid gap-4 md:grid-cols-3">{(Object.keys(taskTypes) as TaskType[]).map(type =>
            <div key={type} className="space-y-3 rounded-xl border border-white/10 p-4">
              <h3 className="font-semibold text-lime-300">{taskTypes[type].title}</h3>
              <p className="text-sm text-slate-300">{taskTypes[type].description}</p>
              <button disabled={actionsLocked} onClick={() => startDemo(type)}>Try {taskTypes[type].title}</button>
            </div>)}</div>
        </Panel>
      </>}
      {(page === 'Jobs' || page === 'Worker' || page === 'Challenges') && <section aria-label="Current local work order" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 px-5 py-4">
        <div className="min-w-0">
          <p className="eyebrow">Current local work order</p>
          <p className="mt-1 break-words text-sm text-slate-300">{job ? <><strong className="capitalize text-slate-100">{job.status}</strong> · {currentTask.title} · {job.id}</> : 'No work order open'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input className="w-full sm:w-80" aria-label="Local job ID" value={jobInput} placeholder="Local work order ID" onChange={e => setJobInput(e.target.value)} />
          <button disabled={actionsLocked || !jobInput.trim()} onClick={() => void task('Loading local work order', () => select(jobInput.trim()))}>Open local work order</button>
        </div>
      </section>}
      {page === 'Jobs' && <>
        <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
        <Panel title="Create work order">
          <label className="flex flex-wrap items-center gap-3 font-medium">Task type
            <select value={formTask} disabled={actionsLocked} onChange={event => setFormTask(event.target.value as TaskType)}>
              {Object.entries(taskTypes).map(([type, config]) => <option key={type} value={type}>{config.title}</option>)}
            </select>
          </label>
          <form key={formTask} onSubmit={create} className="space-y-5">
            <label className="block"><span className="mb-2 block font-medium">Input dataset</span><input type="file" name="dataset" accept={'.' + selectedTask.format} required /></label>
            <fieldset className="space-y-3">
              <legend className="font-medium">Task requirements and acceptance criteria</legend>
              <p className="text-sm text-slate-300">{selectedTask.verification}</p>
              {'rulesExample' in selectedTask ? <>
                <p className="text-sm text-slate-300">Upload a JSON array of flat records. {selectedTask.rulesHelp}</p>
                <label className="block">Rules (JSON)<textarea className="mt-2 block w-full font-mono text-sm" name="rules" rows={3}
                  defaultValue={JSON.stringify(JSON.parse(selectedTask.rulesExample), null, 2)} required /></label>
              </> : <>
              <div className="grid gap-3 sm:grid-cols-2">{Object.entries(requirements).map(([flag, label]) => <label key={flag}>
                <input type="checkbox" name={flag} defaultChecked /> {label}
              </label>)}</div>
              <label className="block">Fill rules (JSON) <input className="ml-2 w-56" name="fill" defaultValue="{}" /></label>
              </>}
            </fieldset>
            <button className="primary" disabled={actionsLocked}>Create local work order</button>
          </form>
        </Panel>
        <Panel title="Bundled demo dataset">
          <p className="leading-relaxed text-slate-300">Try {selectedTask.title} with a bundled dataset and matching rules. Work orders created here run locally. Testnet escrow is a separate workflow.</p>
          <button disabled={actionsLocked} onClick={() => startDemo(formTask)}>Create work order from demo {selectedTask.format.toUpperCase()}</button>
          {formTask === 'csv' && <a href="https://github.com/Leequidice/Writbound/blob/31b19ebf9172420454e03d2b630bf67ce0cf9e1d/docs/phase3-demo/input.csv" target="_blank" rel="noreferrer" className="block text-sm text-lime-300">View published input CSV ↗</a>}
          {job && <button onClick={() => setPage('Worker')}>Open Worker →</button>}
          {job?.spec && <details><summary>Current work order specification</summary><Data value={job.spec} /></details>}
        </Panel>
        </div>
        <details><summary>Advanced · unsigned testnet controls</summary><div className="mt-3">{escrowPanel}</div></details>
      </>}
      {page === 'Worker' && <div className="grid items-start gap-5 xl:grid-cols-2"><Panel title="AI worker">
        <p className="text-xl font-semibold text-lime-300">Ollama / {job?.report?.inference?.model ?? 'qwen2.5:3b'}</p>
        <p className="text-slate-300">{job ? `Run the local ${currentTask.title} work order to generate its deliverable.` : 'Create or open a local work order to begin.'}</p>
        <div className="flex flex-wrap gap-2">
          <button className="primary" disabled={actionsLocked || !job || job.status === 'succeeded'} onClick={() => void task('Running local Ollama', run)}>Run local worker</button>
          {job?.status === 'succeeded' && <a className="self-center text-lime-300" href={'/api/jobs/' + job.id + '/artifact'}>Download {currentTask.artifact}</a>}
        </div>
        {job?.report?.input_rows != null && job.report.output_rows != null && <p className="text-lg font-semibold">{job.report.input_rows} input rows → {job.report.output_rows} output rows</p>}
        {job?.report?.records_audited != null && <div>
          <p className="text-lg font-semibold">{job.report.records_audited} records audited · {job.report.finding_count} findings</p>
          <p className={job.report.rules_passed ? 'text-lime-300' : 'text-amber-200'}>{job.report.rules_passed ? 'Dataset passed the configured rules' : 'Dataset has rule violations'}</p>
        </div>}
        {!!job?.report?.operations?.length && <div><h3 className="font-medium">Operations performed</h3><ul className="mt-2 flex flex-wrap gap-2">{job.report.operations.map(op => <li key={op} className="rounded-md bg-white/5 px-2 py-1 text-sm text-slate-300">{op.replaceAll('_', ' ')}</li>)}</ul></div>}
        {!!job?.report?.errors?.length && <p className="text-red-200">{job.report.errors.join(' · ')}</p>}
        {job?.report && <details><summary>Full worker report</summary><Data value={job.report} /></details>}
      </Panel><Panel title="Independent verification">
        <p className="text-slate-300">{currentTask.verification}</p>
        <button disabled={actionsLocked || job?.status !== 'succeeded'} onClick={() => void task('Verifying local artifact', () => verify())}>Verify saved artifact</button>
        {job?.verification ? <VerificationSummary report={job.verification} /> : <p className="text-sm text-slate-400">Awaiting local verification.</p>}
      </Panel></div>}
      {page === 'Challenges' && <div className="grid items-start gap-5 xl:grid-cols-2"><Panel title="Local defective-artifact check">
        <p className="text-slate-300">Run the bundled {currentTask.title} work order first, then check its deliberately defective artifact to reproduce the mismatch locally. You can also upload a candidate for the open work order.</p>
        <form onSubmit={e => {
          e.preventDefault();
          const file = new FormData(e.currentTarget).get('candidate');
          if (file instanceof File) void task('Verifying candidate', async () => verify({ artifact_base64: await base64(file) }));
        }} className="flex flex-wrap gap-2">
          <input key={currentType} aria-label={'Candidate ' + currentTask.format.toUpperCase()} type="file" name="candidate" accept={'.' + currentTask.format} required />
          <button disabled={actionsLocked || job?.status !== 'succeeded'}>Verify candidate {currentTask.format.toUpperCase()}</button>
        </form>
        <div className="flex flex-wrap gap-2"><button disabled={actionsLocked || job?.status !== 'succeeded'} onClick={() => void task('Verifying defective fixture', async () => {
          const fixture = await api<Demo>(demoPath(currentType));
          await verify({ artifact_base64: fixture.defective_base64 });
        })}>Check published defective fixture</button>
        <button disabled={actionsLocked || !job?.challenge_available} onClick={() => void task('Loading evidence', async () => setEvidence(await api<Verification>('/jobs/' + job?.id + '/challenge')))}>Load saved challenge evidence</button></div>
        {evidence && <VerificationSummary report={evidence} />}
      </Panel><Panel title="Historical NEAR testnet challenge">
        <p className="rounded-lg border border-amber-300/30 bg-amber-300/5 p-4 leading-relaxed text-amber-200"><strong>Deliberately seeded positive attestation.</strong> The testnet demonstration intentionally attested to a defective deliverable. The designated verifier is trusted and operates offchain.</p>
        <p className="text-slate-300">On Job #2, Challenge #0 was upheld and the customer received the escrow refund.</p>
        <button disabled={actionsLocked} onClick={() => void task('Reading finalized challenge', () => readHistorical('2'))}>Check finalized challenge receipts</button>
        {published['2'] && <Receipts transactions={published['2'].transactions.filter(tx => tx.intent.method === 'open_challenge' || tx.intent.method === 'resolve_challenge')} />}
      </Panel></div>}
      {page === 'Treasury' && <>
        <p className="max-w-3xl text-slate-300">Two historical, finalized NEAR testnet outcomes. Check the current finalized chain state and inspect the published receipts. Fresh local work orders run separately from testnet escrow.</p>
        <div className="grid items-start gap-5 xl:grid-cols-2">{(['1', '2'] as const).map(id => {
          const outcome = historicalOutcomes[id];
          const view = published[id];
          const receipt = finalizedOutcome(id, view);
          return <Panel key={id} title={`Job #${id} · ${outcome.title}`}>
            <p className="text-3xl font-semibold text-lime-300">0.01 <span className="text-lg">testnet NEAR</span></p>
            <p className="text-slate-300">{outcome.description}</p>
            {id === '2' && <p className="text-sm text-amber-200">Challenge #0 was upheld after a deliberately seeded positive attestation.</p>}
            <button disabled={actionsLocked} onClick={() => void task('Reading finalized job #' + id, () => readHistorical(id))}>Check finalized Job #{id}</button>
            {receipt && view && <>
              <p className="font-medium text-lime-300">{view.job?.state} · finalized block {view.block?.height}</p>
              <Receipts transactions={[receipt]} />
              <details><summary>Other finalized workflow transactions</summary><Receipts transactions={view.transactions.filter(tx => tx.id !== receipt.id)} /></details>
            </>}
          </Panel>;
        })}</div>
        <details><summary>Advanced · unsigned testnet controls and selected job journal</summary><div className="mt-3 space-y-4">{escrowPanel}<Panel title="Selected job journal"><Receipts transactions={chain?.transactions ?? []} /></Panel></div></details>
      </>}
    </main>
  </div>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
