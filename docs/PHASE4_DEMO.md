# Phase 4 local dashboard and NEAR testnet demo

The React dashboard keeps local worker results separate from finalized chain reads. Express uses the deployed contract, a serialized read-only RPC client and a SQLite intent journal. It records each prepared action, its first external transaction hash and its reconciled result. A local job becomes mapped only after a matching finalized creation receipt and contract state return the actual job ID. No application component loads signing keys.

## Run the dashboard

Start local Ollama with `qwen2.5:3b` as described in the [Phase 3 setup](PHASE3_WORKER.md). From the repository root:

```powershell
npm run build
$env:WRITBOUND_NEAR_RPC = 'https://archival-rpc.testnet.fastnear.com/'
$env:DATABASE_PATH = Join-Path (Get-Location) 'data/phase4/writbound.sqlite'
$env:WRITBOUND_WORKSPACE = Join-Path (Get-Location) 'data/phase4/worker'
node services/api/dist/server.js
```

In another terminal:

```powershell
npm run dev:web
```

Open [Writbound locally](http://127.0.0.1:5173). The Vite proxy targets the loopback API at port 3001. The API accepts the dashboard's two local hostnames on port 5173. Configure one unauthenticated HTTPS testnet RPC per API process using `WRITBOUND_NEAR_RPC`. The read client checks the network, spaces calls by at least two seconds and applies bounded backoff. If the endpoint is unavailable, the UI labels live state unavailable and keeps any recorded transaction references identifiable as such. [NEAR transaction status documentation](https://docs.near.org/api/rpc/transactions)

## Rehearse locally

1. In Jobs, create a job from the published demo CSV or upload your own CSV and choose rules.
2. In Worker, run Ollama, download the artifact and independently verify it.
3. In Challenges, verify the published defective fixture and inspect the reproducible row mismatch.
4. In Jobs or Treasury, select the workflow and refresh finalized state. To inspect the existing expired job, select job 0 cleanup.
5. Prepare an unsigned intent. Its status stays Prepared until an external hash is recorded. Reconcile checks the action and finalized receipts against the saved intent.

Run `node scripts/smoke-phase4.mjs` with both local services and Ollama running. It uses the dashboard proxy, checks live NEAR configuration and job 0, runs a local CSV job, checks both verifier outcomes and records unsigned creation and expiry intents. Use a fresh local job for actual demo creation, since a rehearsal creation intent has a time-limited deadline. The job 0 expiry intent can be reviewed for the optional cleanup. Run `node scripts/phase4-preflight.mjs` after the API build to refresh the approval snapshot.

## Live execution after owner approval

Use two new local jobs from the published demo CSV. Keep both local IDs. For A, select **Successful settlement**, prepare creation, and sign externally using the exact reviewed intent. After the creation hash reconciles, repeat for acceptance. Run Ollama only after acceptance. Verify the generated artifact locally, then prepare submission. The API recomputes the file hash and compares it to the accepted Phase 3 commitment. Attest and record A's finalized challenge end.

For B, select **Seeded challenge refund**. The fixture and independent report are supplied by the published Phase 3 bundle. Prepare and reconcile each call through refund in the approved order while A's challenge window runs. Refresh A and settle once finalized time reaches its challenge end. Treasury displays the verified transfer beneficiary, amount and callback receipt after each final payment. [Exact sequence and approval conditions](PHASE4_APPROVAL.md)

The owner or authorized operator signs through the existing official NEAR CLI and Windows Credential Manager outside Writbound. The intent contains network, receiver, method, JSON arguments, signer, gas and deposit. Archive the exact `evidence` bytes whenever provided. Copy the returned transaction hash into the matching prepared intent and reconcile it. Do not issue a replacement transaction for an unresolved hash. A repeated preparation returns the same journal entry. A pending or failed entry blocks dependent preparation. An operator working outside the app can still submit a duplicate, so the one-send rule and nonce reconciliation remain operational controls.

## API additions

| Route | Purpose |
|---|---|
| `GET /near/config` | Finalized deployment code hash, version, verifier, storage quote and public role IDs |
| `GET /near/jobs/:id` | Finalized onchain job details and job 0 cleanup references |
| `GET /near/links/:localId` | Local mapping, finalized job view and recorded intents/receipts |
| `GET /near/demo` | Published CSV task and labelled defective fixture |
| `POST /near/prepare` | Accepts only `{scope, mode, method, signer}` and derives the unsigned action server-side |
| `POST /near/intents/:id/reconcile` | Accepts only a public `{hash}`; returns HTTP 202 while pending or not visible, and records verified final or failed outcomes |

Each workflow has a fixed sequence. The job 0 scope accepts only expiry and refund. Gas and deposit are derived server-side. A transaction hash is immutable after registration, including when an RPC error interrupts reconciliation. If a prepared creation becomes stale or a transaction fails, preserve the journal and obtain operator review rather than resetting the workflow. Phase 4 uses manual refresh and a local single-instance database. It does not include wallet integration or automatic chain indexing.
