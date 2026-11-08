import React, { useState, type FormEvent, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { chainLabel, nextMethod, nsDate, signerRoles, type ChainView, type Mode, type Transaction } from './workflow';
import './style.css';

const pages = ['Jobs', 'Worker', 'Challenges', 'Treasury'] as const;
const flags = ['normalize_column_names', 'trim_whitespace', 'remove_empty_rows', 'remove_duplicates'];
type LocalJob = {
  id: string; status: string; input_sha256: string; specification_sha256: string;
  report?: { artifact_sha256?: string; input_rows?: number; output_rows?: number; operations?: string[]; errors?: string[]; inference?: { model: string; wall_ms: number } };
  verification?: Verification;
  challenge_available?: boolean;
};
type ChainConfig = { contract: string; roles: Record<string, string>; storage_quote: string; version: string };
type Verification = {
  passed: boolean; artifact_sha256: string;
  mismatch?: { kind: string; data_row?: number; expected?: { cells?: string[] }; actual?: { cells?: string[] } } | null;
};

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
  if (file.size > 5 * 1024 * 1024) throw new Error('CSV exceeds 5 MiB');
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
    {report.passed && <p>The artifact matches the output reproduced from the original CSV and task spec.</p>}
    {mismatch && <p>
      {mismatch.data_row ? `First mismatch at data row ${mismatch.data_row}.` : mismatch.kind.replaceAll('_', ' ')}
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
  const [page, setPage] = useState<(typeof pages)[number]>('Jobs');
  const [job, setJob] = useState<LocalJob | null>(null);
  const [jobInput, setJobInput] = useState(localStorage.getItem('writbound-local-job') ?? '');
  const [chain, setChain] = useState<ChainView | null>(null);
  const [config, setConfig] = useState<ChainConfig | null>(null);
  const [mode, setMode] = useState<Mode>('success');
  const [txHash, setTxHash] = useState('');
  const [evidence, setEvidence] = useState<Verification | null>(null);
  const [published, setPublished] = useState<ChainView | null>(null);
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
    void task('Validating CSV', async () => {
      const file = form.get('csv');
      if (!(file instanceof File) || !file.name.toLowerCase().endsWith('.csv')) throw new Error('Choose a .csv file');
      const input_base64 = await base64(file);
      const bytes = await file.arrayBuffer();
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
      const spec = { schema_version: 1, input_sha256: hash, fill_missing: JSON.parse(String(form.get('fill'))),
        ...Object.fromEntries(flags.map(flag => [flag, form.has(flag)])) };
      const result = await api<LocalJob>('/jobs', { spec, input_base64 });
      await select(result.id);
    });
  }
  async function demo() {
    const { spec, input_base64 } = await api<{ spec: object; input_base64: string }>('/near/demo');
    await select((await api<LocalJob>('/jobs', { spec, input_base64 })).id);
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
    if (!result.passed) setEvidence(result);
  }

  const next = nextMethod(mode, chain);
  const outstanding = chain?.transactions.find(tx => tx.status === 'prepared' || tx.status === 'pending');
  const actionsLocked = Boolean(busy);
  const escrowPanel = <Panel title="NEAR testnet escrow">
    <p className="text-sm text-slate-400">Prepare unsigned calls for review. Account owners sign separately after approval. Paste the resulting transaction hash to reconcile receipts.</p>
    <div className="flex flex-wrap gap-2">
      <select aria-label="Workflow" value={mode} disabled={actionsLocked || Boolean(chain?.link || outstanding)} onChange={e => {
        setMode(e.target.value as Mode); setChain(null); setConfig(null); setTxHash('');
      }}>
        <option value="success">Successful settlement</option><option value="challenge">Seeded challenge refund</option><option value="cleanup">Expired job 0 cleanup</option>
      </select>
      <button disabled={actionsLocked || (!job && mode !== 'cleanup')} onClick={() => void task('Reading finalized NEAR state', () => refreshChain())}>Refresh finalized state</button>
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
    <aside className="border-r border-white/10 p-8 md:w-64">
      <a href="#" className="text-2xl font-bold tracking-tight">writbound<span className="text-lime-300">.</span></a>
      <p className="mt-3 text-xs text-slate-400">Autonomous work.<br />Binding accountability.</p>
      <nav aria-label="Main navigation" className="mt-8 flex flex-wrap gap-2 md:flex-col">
        {pages.map(name => <button key={name} aria-current={page === name ? 'page' : undefined} onClick={() => setPage(name)}>{name}</button>)}
      </nav>
      <p className="mt-8 text-xs text-slate-500">PHASE 04 / INTEGRATION</p>
    </aside>
    <main className="min-w-0 flex-1 space-y-5 p-6 md:p-10">
      <header><h1 className="text-3xl font-semibold">{page}</h1><p className="mt-2 text-sm text-slate-400">{chainLabel(chain)}</p></header>
      {busy && <p role="status" className="text-lime-300">{busy}…</p>}
      {error && <p role="alert" className="rounded border border-red-500/40 p-3 text-red-200">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <input aria-label="Local job ID" value={jobInput} placeholder="Local job ID" onChange={e => setJobInput(e.target.value)} />
        <button disabled={actionsLocked || !jobInput.trim()} onClick={() => void task('Loading local job', () => select(jobInput.trim()))}>Open local job</button>
      </div>
      {job && <p className="break-all text-sm text-slate-400">Local execution · <strong>{job.status}</strong> · {job.id}</p>}
      {page === 'Jobs' && <>
        <Panel title="Create local CSV job">
          <form onSubmit={create} className="space-y-3">
            <label className="block">Input CSV <input type="file" name="csv" accept=".csv,text/csv" required /></label>
            <div className="flex flex-wrap gap-3">{flags.map(flag => <label key={flag}>
              <input type="checkbox" name={flag} defaultChecked /> {flag.replaceAll('_', ' ')}
            </label>)}</div>
            <label className="block">Fill rules (JSON) <input className="w-56" name="fill" defaultValue="{}" /></label>
            <button disabled={actionsLocked}>Create local job</button>
          </form>
          <button disabled={actionsLocked} onClick={() => void task('Creating local demo job', demo)}>Create job from published demo CSV</button>
        </Panel>
        {escrowPanel}
      </>}
      {page === 'Worker' && <Panel title="Local Ollama execution">
        <div className="flex flex-wrap gap-2">
          <button disabled={actionsLocked || !job || job.status === 'succeeded'} onClick={() => void task('Running local Ollama', run)}>Run local worker</button>
          <button disabled={actionsLocked || job?.status !== 'succeeded'} onClick={() => void task('Verifying local artifact', () => verify())}>Verify saved artifact</button>
          {job?.status === 'succeeded' && <a className="self-center text-lime-300" href={'/api/jobs/' + job.id + '/artifact'}>Download cleaned CSV</a>}
        </div>
        {job?.report?.inference && <p>
          {job.report.inference.model} · {job.report.inference.wall_ms} ms · {job.report.input_rows} input rows → {job.report.output_rows} output rows
        </p>}
        {job?.report?.operations?.length ? <p className="text-sm text-slate-300">{job.report.operations.map(op => op.replaceAll('_', ' ')).join(' → ')}</p> : null}
        {job?.report && <details><summary>Full worker report</summary><Data value={job.report} /></details>}
        {job?.verification && <VerificationSummary report={job.verification} />}
      </Panel>}
      {page === 'Challenges' && <Panel title="Local challenge evidence">
        <p className="text-sm text-amber-200">Seeded false-positive demonstration. The published fixture intentionally omits a distinct row. Its onchain positive attestation was deliberately seeded. The independent verifier rejects it.</p>
        <form onSubmit={e => {
          e.preventDefault();
          const file = new FormData(e.currentTarget).get('candidate');
          if (file instanceof File) void task('Verifying candidate', async () => verify({ artifact_base64: await base64(file) }));
        }} className="flex flex-wrap gap-2">
          <input aria-label="Candidate CSV" type="file" name="candidate" accept=".csv,text/csv" required />
          <button disabled={actionsLocked || job?.status !== 'succeeded'}>Verify candidate CSV</button>
        </form>
        <button disabled={actionsLocked || job?.status !== 'succeeded'} onClick={() => void task('Verifying seeded fixture', async () => {
          const fixture = await api<{ defective_base64: string }>('/near/demo');
          await verify({ artifact_base64: fixture.defective_base64 });
        })}>Check published defective fixture</button>
        <button disabled={actionsLocked || !job?.challenge_available} onClick={() => void task('Loading evidence', async () => setEvidence(await api<Verification>('/jobs/' + job?.id + '/challenge')))}>Load saved challenge evidence</button>
        {evidence && <VerificationSummary report={evidence} />}
      </Panel>}
      {page === 'Treasury' && <>
        <Panel title="Finalized testnet demonstration">
          <p className="text-sm text-slate-400">Read the two existing onchain jobs and their published finalized receipts. This view is separate from local execution.</p>
          <div className="flex flex-wrap gap-2">{[['1', 'Worker payout'], ['2', 'Challenged refund']].map(([id, label]) =>
            <button key={id} disabled={actionsLocked} onClick={() => void task('Reading finalized job ' + id, async () => {
              setPublished(null);
              setPublished(await api<ChainView>('/near/jobs/' + id));
            })}>Job {id} · {label}</button>)}</div>
          {published?.job && <>
            <p className="text-lime-300 font-medium">Job #{published.job.id} · {published.job.state} · finalized block {published.block?.height}</p>
            {published.job.id === '2' && <p className="text-amber-200 text-sm">Seeded false-positive fixture. Challenge 0 was upheld.</p>}
            <Receipts transactions={published.transactions.filter(tx => tx.result?.transfer_receipt || tx.intent.method === 'open_challenge' || tx.intent.method === 'resolve_challenge')} />
            <details><summary>All finalized workflow transactions</summary><Receipts transactions={published.transactions} /></details>
          </>}
        </Panel>
        {escrowPanel}<Panel title="Selected job journal"><Receipts transactions={chain?.transactions ?? []} /></Panel>
      </>}
    </main>
  </div>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
