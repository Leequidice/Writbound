# Writbound delivery plan · November 8–14, 2026

Submission closes **November 14 at 23:59 UTC**. Aim to submit by 18:00 UTC. Scope is one CSV deduplication workflow on the existing NEAR testnet deployment with a local Ollama worker, deterministic evidence and a small dashboard.

The foundation and deployed contract are available. The local Ollama worker, deterministic verifier, dashboard and NEAR integration passed rehearsal. All 12 approved calls finalized. Job 1 paid the worker, and job 2 refunded the customer after an upheld challenge. Remaining P0 work is publication and the demo video. [Dashboard demo](docs/PHASE4_DEMO.md) · [Onchain execution report](docs/PHASE4_ONCHAIN_REPORT.md)

## Priorities

| Priority | Scope and acceptance |
|---|---|
| **P0 — submission** | One autonomous local Ollama worker picks up an eligible CSV job, chooses the allowlisted dedupe operation and produces a hashed output. Deterministic checks prove exact first-occurrence dedupe, header and string preservation. The existing testnet contract records one real settlement and one upheld challenge with a customer refund. The dashboard displays job state, worker output, verification/challenge evidence and finalized explorer links. The public repository includes setup and reproduction instructions plus a demo video. |
| **P1 — optional before submission** | Extra rejection transactions after both lifecycles finish, dashboard convenience filters and richer error presentation. Cut these first if P0 slips. |
| **P2 — post-hackathon** | Additional agent types, multiple task categories, complex treasury analytics, advanced UI animations, nonessential contract features and extra blockchain integrations. |

## Job 0 and minimum onchain recovery

Read-only `get_job` at finalized block **276727237**, hash `93txbYjYADGZrdb8mkM2Q8oNay6NvFeTDQG67rKCXPuS`, returned `Open` with no worker, submissions or challenges. The block time was **November 8, 04:29:53.042 UTC**. The work deadline was **November 5, 07:38:05.767 UTC**. No work time remains. The contract checks the deadline on acceptance and requires an assigned worker on submission. The timeout does not automatically change the stored state. [Contract implementation](contracts/writbound-escrow/src/lib.rs)

The previous sequence cannot continue from job 0. The proposed revision uses the existing contract and role accounts. Fresh authorization must cover the revised call list, commitments, funding and deadlines. Use actual returned job and challenge IDs and verify each finalized result before the next dependent call.

| Track | Ordered calls | Count |
|---|---|---:|
| Job 0 cleanup | Customer calls `expire_job(0)` to record `work_timeout`, then `refund_job(0)`. Verify the 0.01 NEAR customer transfer, successful callback and `Refunded`. The 0.16384 NEAR storage reserve remains held. | 2 |
| Successful work | Customer creates a fresh job → worker accepts → worker submits the actual Ollama worker output hash → verifier attests the deterministic pass → after the onchain challenge window ends, customer settles. Verify the 0.01 NEAR worker transfer, callback and `Paid`. | 5 |
| Challenged work | Customer creates a second fresh job → worker accepts → worker submits the defective fixture hash → verifier records an explicitly seeded positive attestation → independent challenger opens a challenge before its window ends → verifier upholds it with correction disabled before the resolution deadline → customer refunds. Verify the 0.01 NEAR customer transfer, callback and `Refunded`. | 7 |

The two demos need **12 contract calls**, or **14 including cleanup**, with one call per submitted transaction. Receipt and callback verification adds no submitted transaction. Start the good job's one-hour challenge window first and run the bad-job path during it. The upheld challenge makes the bad job refundable immediately. Its seeded attestation is a demonstration fixture. The full verifier independently rejects the dropped distinct row `002,Bob`. [Fixture generator](scripts/prepare-demo-evidence.py)

At the same finalized block, `storage_quote` returned **0.16384 NEAR** and the customer held **0.825977552083909 NEAR**. Two fresh jobs at 0.01 NEAR escrow each require **0.34768 NEAR** in deposits at that quote, before fees. The balance covers those deposits without relying on job 0's refund. Recheck live quote, usable balances, fees and the prior 7 NEAR allocation ceiling when preparing the revised approval packet. Record finalized hashes, transfer beneficiaries, callback outcomes and the accounting delta for each demo. Use real block times for work deadlines and challenge windows. [Prior approval packet](docs/FINAL_TESTNET_APPROVAL_PACKET.md)

## November 8–14 schedule

| Date (UTC) | P0 deliverable |
|---|---|
| **Nov 8** | Confirm chain recovery plan and share the worker/API/dashboard interface. Smoke-check Ollama and one local model on the demo machine. Begin the revised approval packet. |
| **Nov 9** | Run fixture CSV through Ollama and the bounded Python tools. Extract reusable deterministic checks and prove the good output passes and the dropped-row output fails. Start the dashboard with labelled development fixtures. |
| **Nov 10** | Connect worker handoff, job/evidence API and dashboard. Read finalized testnet state into the same API shape. Generate demo commitments from exact local artifact bytes and finalize the revised approval packet. |
| **Nov 11** | Target first live run after fresh approval. Complete job 0 cleanup and both fresh demos, observing the good job's actual challenge end. Capture receipts, final states and ledger deltas. |
| **Nov 12** | Use as a recovery buffer for RPC or integration failures. Rehearse from a clean checkout and verify artifact and evidence reproduction. |
| **Nov 13** | Freeze scope, publish the reviewed public repository and documentation, record the demo and check all links. Show the local agent run and finalized testnet evidence. |
| **Nov 14** | Check the public repo, video permissions and submission fields. Submit by 18:00 UTC with buffer before 23:59 UTC. |

## Phase 3 implementation breakdown

| Workstream | Changes and acceptance | Dependency on live writes |
|---|---|---|
| **Local agent** | Extend `services/worker` around existing `load_csv` and `remove_duplicate_rows`. Run a single local worker polling eligible jobs with a per-job claim. Validate spec/input hashes, ask local Ollama `/api/chat` for a schema-constrained operation, and execute only the allowlisted dedupe on the operator-selected input. Write output atomically, hash exact bytes and report run status. Bound the prompt, time and retries. Keep CSV contents, paths and signer authority outside model control. [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs) | Develop and rehearse end to end on a local fixture queue. |
| **Verifier and evidence** | Extract the independent checks in `scripts/prepare-demo-evidence.py` into a reusable bounded verifier. Compare parsed header and ordered distinct rows, preserve values such as `001`, and verify the input/spec/artifact hashes. Produce a versioned report with checks, missing-row evidence, artifact hash and job binding. Keep the seeded positive attestation in the approved demo runner. | Both good and defective fixtures work locally. Live binding needs the real returned job ID. |
| **API and index** | Extend Express from `/health` with job list/detail and loopback worker claim/result handoff. Reuse the SQLite jobs, submissions, verification, challenge and transaction-reference tables with only the schema changes needed for chain IDs and run state. Use an idempotent contract/job key and submission hash. Read finalized `get_job`/accounting and verify known transaction hashes before indexing them. Keep local run status distinct from chain state. | Implement the API contract and integration against fixtures, then use read-only testnet calls and the six existing receipts. |
| **Dashboard** | Replace placeholders in the existing React shell. Jobs shows state and deadlines, Worker shows run status and artifact hash, Challenges shows the failed check and evidence, and Treasury shows a simple settlement/refund transaction list. Label fixtures, loading and RPC errors. | Build against the shared JSON response and fixtures, then switch to the finalized read API. |
| **Chain handoff** | Produce typed call intents from verified artifacts. Reuse official NEAR CLI signing via Windows Credential Manager and a separate operator-approved runner for role-scoped calls. Reconcile finalized receipts, nonce and chain state if a broadcast result is ambiguous. Exercise intent preparation and receipt parsing offline. | Live signing and broadcast wait for explicit approval of the revised sequence. |

Worker and frontend can proceed in parallel once they agree on job ID, spec/input hash, run status, artifact hash, check result and chain receipt fields. The critical path is **working local agent → real artifact and verification commitments → approved testnet demo → receipt-backed dashboard and video → submission**.

## Remaining risks

- **Approval and timing.** The prior plan references an expired job. Aim for revised approval by November 10. Start live work only after the fixture rehearsal and allow the full onchain challenge window.
- **RPC and signing.** The free archival endpoint has previously rate-limited reads. Serialize verification and use bounded backoff. Recheck all role keys and reconcile ambiguous broadcasts before any further dependent write.
- **Local model reliability.** Confirm the chosen model fits the demo machine on November 8. Fail visibly on invalid model output or timeouts. Require a real Ollama run and deterministic pass in the submission rehearsal.
- **Evidence and publication.** Keep exact artifact bytes and receipt hashes. Review public files for secrets and local data, verify the public links, and reserve November 14 for submission.
- **Contract trust.** The designated verifier is trusted, account upgrade keys remain sensitive, and transfers rely on finalized receipts and callbacks. The recovery plan uses the deployed contract. [Security model](docs/SECURITY_MODEL.md)
