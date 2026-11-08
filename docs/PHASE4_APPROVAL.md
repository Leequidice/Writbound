# Phase 4 testnet approval packet

**Owner authorization requested for 12 demo transactions and, if included in the approval, two job 0 cleanup transactions.** Existing funding, deployment and initialization remain historical. This packet proposes only calls to the deployed `writbound-escrow-20261105.testnet` contract on NEAR testnet.

## Finalized snapshot and readiness

Finalized block **276730720** at **2026-11-08 05:04:38.453 UTC**, hash `aMSZHf7wKHnX8Jbgwh3CT4KVGNAg86B3HR1s5boJuvZ`. The unauthenticated [FastNEAR archival testnet RPC](https://archival-rpc.testnet.fastnear.com/) returned network, finalized block, accounts, gas, storage, contract views and the full historical [job 0 creation receipt](https://testnet.nearblocks.io/txns/9Y9PLxdGEm64BXQ2FcoBMGbPYeuP326F1j2Py9EBM43W). Its reported code hash matched the approved deployment, `CuTHP5d4SUnkkVjUGn3b8UzBXkS2i8KABabNDrpZhKS8`, and the local WASM SHA-256 matched `b0e079d44375cda2baf0f242f5aa405d2c0cf158782b4817b9b0ce2284e30019`. The configured verifier and version `writbound-escrow-0.2.0` matched. [Machine-readable snapshot](phase4-preflight.json)

| Role | Public account | Finalized testnet NEAR |
|---|---|---:|
| Contract | `writbound-escrow-20261105.testnet` | 6.1439899666160534 |
| Customer | `7ac384032504d793e733f0210f5ee39518adb0db92dbc95ed9001b7af08cebf9` | 0.825977552083909 |
| Worker | `75b826f8ba2f37eb9431805f7a19659f0ecd81e7458eeefd42663b9365a67f55` | 1 |
| Verifier | `fcdcd131110d9310c74e6c340e114e92bd79044bbe049d275fadd7d6b3867831` | 1 |
| Challenger | `7b1828f1acfc0003b06abf0744f9dea35f53ad105f4e14a24b0901de5a99465f` | 1 |

The original allocation counts 4 NEAR for role funding, the full 2 NEAR deployment/storage allowance and **0.0300324813000376 NEAR** in historical fees. That leaves **0.9699675186999624 NEAR** under the 7 NEAR cap. Each new job attaches **0.17384 NEAR** at this quote, including 0.01 escrow and 0.16384 storage. The two deposits draw from the existing customer allocation. They need **0.34768 NEAR** and fit even without the optional refund. The 14-call gas allowance is 1,550 Tgas, or **0.155 NEAR** at the snapshot gas price before other fees. Reusing the larger prior all-fee envelope gives a conservative maximum of **6.6412907947272643 NEAR** allocated. Recheck the live quote, all signer balances and fee cap before execution. A changed deposit or other approved parameter requires review.

## Exact transaction sequence

All calls use the role accounts above as signer, the deployed contract as receiver, **100 Tgas** and **zero deposit**, except creation and the noted 150 Tgas payment calls. Values below use the contract's JSON types. `A` and `B` are the decimal-string IDs actually returned by the two finalized creations. `C` is the numeric ID of the finalized challenge on B.

Both creation calls use

```json
{"escrow":"10000000000000000000000","specification_hash":"6112127c82bc59c4d16b730bc0aaa4138f2969a02320cfecf0712333e8772200","work_deadline":"<latest finalized block timestamp in ns + 7200000000000>","challenge_duration":"3600000000000"}
```

Each attaches exactly `173840000000000000000000` yoctoNEAR at the checked quote. For illustration only, the snapshot would have produced work deadline `1794121478453757694` (07:04:38.453 UTC on November 8). Use a fresh finalized block for each actual creation. Accept and submit before that job's work deadline. Attest before the 24-hour verification deadline, challenge B before its one-hour window closes, and adjudicate B before the returned resolution deadline. Settle A only at or after its actual finalized `challenge_end`.

| # | Signer | Call and JSON arguments | Expected finalized outcome |
|---|---|---|---|
| 1 | Customer | `create_job` with creation arguments above | A becomes Open |
| 2 | Worker | `accept_job {"job_id":"A"}` | A becomes Accepted |
| 3 | Worker | `submit_work {"job_id":"A","artifact_hash":"41db277a79fb2579196eb99425c7e0de408665097e38c42c5d04459941704c2d","metadata":null}` | A becomes Submitted after the fresh Ollama run and byte hash check |
| 4 | Verifier | `attest_verification {"job_id":"A","passed":true,"evidence_hash":"PASS"}` | A becomes Verified and its real one-hour challenge window starts |
| 5 | Customer | `create_job` with creation arguments above | B becomes Open |
| 6 | Worker | `accept_job {"job_id":"B"}` | B becomes Accepted |
| 7 | Worker | `submit_work {"job_id":"B","artifact_hash":"132f5e6720257a9dbed84902cb8e0845adf4db2d9aa04f9799ba0f748b2a08da","metadata":null}` | B becomes Submitted with the labelled defective fixture |
| 8 | Verifier | `attest_verification {"job_id":"B","passed":true,"evidence_hash":"SEED"}` | B becomes Verified through an explicitly seeded positive attestation. The independent check fails. |
| 9 | Challenger | `open_challenge {"job_id":"B","evidence_hash":"FAIL"}` | Returns C with Pending status |
| 10 | Verifier | `resolve_challenge {"job_id":"B","challenge_id":C,"upheld":true,"allow_correction":false,"resolution_hash":"UPHELD"}` | C becomes Upheld and B becomes Refundable |
| 11 | Customer | `refund_job {"job_id":"B"}` · 150 Tgas | One 0.01 NEAR transfer to customer and successful callback. B becomes Refunded. |
| 12 | Customer | `settle_job {"job_id":"A"}` · 150 Tgas | After A's challenge window, one 0.01 NEAR transfer to worker and successful callback. A becomes Paid. |

Optional cleanup before step 1 uses Customer to call `expire_job {"job_id":"0"}` at 100 Tgas, then `refund_job {"job_id":"0"}` at 150 Tgas, both with zero deposit. Job 0 is Open past its November 5 deadline. The expected timeout reason is `work_timeout`, followed by a single 0.01 NEAR customer refund and successful callback. Its storage reserve remains held.

### Evidence commitments

For PASS, SEED, FAIL and UPHELD, use SHA-256 of the compact UTF-8 JSON envelope emitted in the unsigned intent, including its final LF. The envelope starts with these ordered keys: `schema_version` (1), `kind`, `network` (`testnet`), `contract`, `job_id`, `specification_hash`, `artifact_hash`, `source_report_sha256`. These bindings depend on returned onchain IDs. Preserve exact bytes when archiving an intent.

| Placeholder | Kind | Source report SHA-256 | Additional ordered fields |
|---|---|---|---|
| PASS | `deterministic_verification_pass` | `580570d6c797f57704a30d1cc9e7c7dc8aa1b3bb86d2649b4cfcaaba6c6d1b8e` | `deterministic_verification_passed:true` |
| SEED | `seeded_positive_demo_fixture` | `9b587d3dd48c72feef7cb2e18b183ea035de4e2a201948299568a7fefeea0d5b` | `deterministic_verification_passed:false` |
| FAIL | `deterministic_fixture_failure` | Same failing report | None |
| UPHELD | `upheld_fixture_challenge` | Same failing report | `challenge_id:C, challenge_evidence_hash:FAIL, upheld:true, allow_correction:false` |

The API rehashes A's generated file bytes and compares its independent report to the published pass after normalizing the local job ID. It rehashes the defective fixture and evidence for B. The fixture removes `002,Bob,Unassigned` and has a reproducible failure. [Phase 3 artifacts](phase3-demo/manifest.json)

Before signing, confirm owner approval, fresh role signing access, live testnet identity, budget and approved parameters. Register each external hash and verify its final receipt and resulting job state before preparing the next dependent call. Stop on an ambiguous hash, unexpected failure, parameter drift, unreliable verification or a paid requirement. Resume an ambiguous result through read-only hash, nonce and finalized-state reconciliation. No rejection tests are included in this 12-call packet.
