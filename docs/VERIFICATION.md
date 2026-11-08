## Release freeze verification · November 8, 2026

The clean Windows clone installed, built and ran the credential-free demo. The API, dashboard, Python and Rust suites passed. The demo reproduced the cleaned artifact hash and read the finalized payout/refund through the dashboard proxy. The authored source scan returned zero findings. [Release audit](RELEASE_AUDIT.md)

## Phase 4 verification · November 8, 2026

All 12 authorized calls finalized. Following the initial HTTP 429 stop and read-only reconciliation of call 4, Directive 004-C authorized settlement at call 5 after the real challenge deadline and the challenged workflow at calls 6–12. Job 1 reached Paid with a 0.01 NEAR worker transfer. Challenge 0 on job 2 was upheld, and job 2 reached Refunded with a 0.01 NEAR customer transfer. Both callbacks finalized successfully. [Onchain execution report](PHASE4_ONCHAIN_REPORT.md)

- **Tests:** 5 API, 2 dashboard state, 15 Python (including live Ollama) and 48 Rust tests passed. Frontend/API builds and the existing HTTP smoke check passed.
- **Integration coverage:** Wrong roles and extra arguments, exact gas/deposit and argument comparison, artifact tampering, finalized local-to-chain mapping, pending and duplicate hash handling, callback and beneficiary reconciliation, RPC failures and UI deadline gating. Transaction lifecycle tests use isolated RPC fixtures.
- **Live read and local execution:** The free archival RPC returned finalized job 0, contract configuration, balances and the full historical creation receipt. The final dashboard proxy smoke check observed job 0 at block 276731737, ran `qwen2.5:3b` in 4,160 ms, reproduced the approved CSV hash and verified the passing and defective artifacts. It saved unsigned creation and expiry intents with null transaction hashes, and rejected refund preparation before expiry reconciliation. [Reproduction](PHASE4_DEMO.md) · [Approval snapshot](PHASE4_APPROVAL.md)
- **Onchain receipts:** All 12 hashes were distinct and their exact actions, nonces, fees and resulting states matched the execution journal. No job 0 cleanup was submitted.

## Phase 3 verification · November 8, 2026

- **Python:** 15 passed, 0 failed, including a real local inference test with `WRITBOUND_TEST_LIVE=1`. Coverage includes all CSV operations, model response rejection and unavailability, deterministic verification and evidence, stable hashing, and workspace path restrictions.
- **API and frontend:** 2 existing API tests passed. Both builds and the HTTP smoke check passed. The real API demo exercised job creation, execution, artifact retrieval, good and defective verification, repeated evidence, execution idempotency, malformed input, path traversal rejection and browser-origin rejection.
- **Contract regression:** 48 passed, 0 failed with `cargo test --offline --locked` after loading the MSVC environment. The Phase 3 run was local. Six testnet transactions remain the historical total. [Testnet execution record](TESTNET_EXECUTION_REPORT.md)
- **Real inference evidence:** Ollama 0.40.15, `qwen2.5:3b`, 8,553 ms and 37 generated tokens on CPU. The independent verifier accepted the cleaned artifact and reproduced the dropped-row challenge evidence. [Commands and hashes](PHASE3_WORKER.md)

The initial sandboxed API regression run was blocked by loopback socket access. The final run with loopback access passed. Python tests used a workspace-local temporary directory to avoid the sandbox's temp directory permission errors.

The Phase 2 entries below are historical.

# Verification — Phase 2, November 5, 2026
**Current status: execution stopped after 1/23 transactions; fresh authorization required.** Contract is not deployed and Phase 2 is incomplete. See TESTNET_EXECUTION_REPORT.md for current actual evidence; earlier no-transaction entries below are historical.

## Executed local checks
- `cargo test --locked`: **48 passed, 0 failed**, 0 doctests. SDK mocked NEAR context, receipts and promise outcomes; no unexecuted test is counted.
- `cargo clippy --locked --all-targets -- -D warnings`: passed without warnings.
- `cargo fmt --check`: passed after formatting.
- `cargo near build non-reproducible-wasm --locked --no-abi`: passed with wasm-opt optimization. near-sdk 5.30.0, Rust/Cargo 1.99.1, rustup 1.29.3, cargo-near 0.22.0, MSVC 14.51.36231 and Windows SDK 10.0.26100.0.
- `node scripts/verify-wasm.mjs`: independent WebAssembly module validation passed; **19 required escrow exports** confirmed; import namespaces restricted to NEAR env. This validates structure, not a runtime lifecycle.

Logs: phase2-rust-test.log, phase2-clippy.log, phase2-near-build.log, phase2-wasm-validation.json. Prior Phase 1 results are preserved in PHASE1_VERIFICATION.md and TOOLCHAIN_HISTORY.md. Frontend/API/worker were not modified or rerun in Phase 2.

## Exact commands
From repository root:
```powershell
. ./scripts/enter-msvc.ps1
cd contracts/writbound-escrow
cargo fmt
cargo test --locked
cargo clippy --locked --all-targets -- -D warnings
cargo near build non-reproducible-wasm --locked --no-abi
cd ../..
node scripts/verify-wasm.mjs
```
The test/build commands were captured into the corresponding log files with PowerShell redirection. No test/build flags were weakened. The existing --no-abi workaround avoids the previously documented native ABI linker issue; it still builds/optimizes the complete financial contract.

## Final artifact
Path: `C:\Users\USER\Downloads\Hackathons\WritBound\contracts\writbound-escrow\target\near\writbound_escrow.wasm`

Size: **167,353 bytes**

SHA-256: `b0e079d44375cda2baf0f242f5aa405d2c0cf158782b4817b9b0ce2284e30019`

Validated exports: accept_job, attest_verification, cancel_job, contract_source_metadata, create_job, expire_job, get_accounting, get_job, get_job_count, get_verifier, list_jobs, new, on_transfer, open_challenge, refund_job, resolve_challenge, settle_job, storage_quote, submit_work, version.

## Coverage against Directive 002
| Required scenarios | Executed test coverage |
|---|---|
| 1–2 creation/funding | valid_creation_and_queries; invalid_funding_and_hashes; invalid_deadline_bounds |
| 3–6 acceptance/submission | worker_accepts_once; customer_verifier_and_contract_cannot_work; unauthorized_submission_rejected; valid_submission_stores_commitment |
| 7–8 verification authorization | successful_verification_and_immutable_attestation; unauthorized_verifier_rejected |
| 9–11 settlement timing/success/duplicates | settlement_before_deadline_rejected; settlement_at_boundary_and_callback_succeeds; duplicate_settlement_and_refund_rejected |
| 12–14 challenges | third_party_challenge_blocks_settlement; invalid_and_late_challenges; participants_cannot_challenge; challenge_duplicates_and_count_bounded |
| 15–16 challenge outcomes | valid_challenge_enters_correction; valid_challenge_can_refund_directly; rejected_challenge_allows_settlement; correction_resubmission_reverifies_and_cannot_loop |
| 17–18 expiry/closed refunds | work_timeout_for_open_and_accepted; duplicate_settlement_and_refund_rejected; verified_work_cannot_expire_arbitrarily |
| 19 failed transfer recovery | failed_worker_transfer_preserves_claim_and_retry; failed_refund_preserves_customer_claim; callback_private_and_replay_safe |
| 20 invalid transitions | closed_jobs_cannot_reenter_workflow; customer_cancels_only_unaccepted_job; bounded_metadata_and_no_resubmission |
| 21 no permanent challenge/verification lock | challenge_timeout_deterministic_refund; challenge_timeout_cannot_be_bypassed_by_resolving_another; verification_timeout_is_permissionless; correction_timeout_refunds |
| 22 storage separation | storage_is_never_worker_payment; worst_case_history_storage_and_callback_gas |

Additional coverage: conserved liabilities across multiple jobs, exact recipient/amount/callback gas receipts, insufficient liquidity preserving claims, initialization front-running, timestamp overflow and bounded pagination. Worst-case history test fills two submissions and eight challenges, flushes storage, reconstructs a cold contract, executes its callback under 40 Tgas and asserts used gas including storage/header writes stays below 35 Tgas in the mock runtime. This is not an onchain gas measurement.

## Fund-safety review
Reviewed against ESCROW_STATE_MACHINE.md and SECURITY_MODEL.md. Pending state is written before scheduling, callbacks require self plus matching attempt, failed transfers restore unpaid liability, successful transfers are terminal, replayed callbacks cannot debit twice, and no caller selects payout recipient. Expired unresolved challenges cannot be dismissed to bypass a refund timeout. Timestamp bounds cover both complete review/correction rounds. Cumulative lifetime funding is checked to prevent overflow in callback accounting. Fixed storage reserves cover bounded serialized history plus overhead; no excess deposit is accepted. Initializing requires the contract-account predecessor, and the verifier is immutable and excluded from worker/customer beneficiaries.

No unresolved critical fund-safety defect was found in this local review; this is not an independent security audit or proof. Trusted verifier dishonesty/absence, bounded challenge-slot griefing, deployer upgrade keys, and asynchronous receipt/callback liveness remain explicit assumptions. No unsafe timeout recovery of a pending transfer exists, because its transfer might already have succeeded. Runtime validation is still pending.

## Not executed / deployment gate
- No testnet account creation, deployment, wallet signing, funding transaction, or real E2E lifecycle executed. **Transaction hashes: none.**
- Public dedicated contract/verifier IDs and explicit deployment approval are required. See TESTNET_DEPLOYMENT.md for the prepared atomic initialization and two-lifecycle plan.
- Official near-sandbox currently lacks a native Windows binary; the official runner's supported platforms are Linux x86_64/aarch64 and Darwin ARM (source linked in deployment runbook). No sandbox suite was run or counted; no Docker/WSL installation was introduced.
- No CSV inspection, AI agent integration, arbitrary arbitration, frontend workflow, mainnet feature or Phase 3 implementation was added.
- No paid service or real funds used. Final source/config scan inspected 48 files, excluding dependencies/builds and local databases: no private-key/API-key patterns or unexpected environment files found. No credentials were added.


## Directive 002-B — read-only predeployment review
- Recomputed local WASM SHA-256: b0e079d44375cda2baf0f242f5aa405d2c0cf158782b4817b9b0ce2284e30019, unchanged. Independent WASM validation and all 19 escrow exports rechecked.
- Live RPC https://rpc.testnet.near.org returned chain_id=testnet, protocol 88, storage_amount_per_byte=10000000000000000000 yoctoNEAR and gas price=100000000 yoctoNEAR/gas at the recorded final blocks. Snapshot: testnet-preflight.json; estimates are not actual fees.
- Customer deposits for two 0.01-NEAR jobs: 0.34768 including 0.32768 permanent storage reserves. WASM code bytes alone imply 1.67353 storage NEAR before other account/state costs. Planned 2250 Tgas is 0.225 NEAR at the snapshot gas price; action/setup costs and price variation need additional headroom, all free testnet tokens.
- Five user-supplied implicit IDs each returned UNKNOWN_ACCOUNT at final block 276287238. No onchain balances or signing control could be confirmed. The implicit Contract ID also fails this accepted WASM's .testnet initialization guard. User selected guided creation of writbound-escrow-20261105.testnet; agent has not generated keys, requested faucet credit, funded accounts, signed or sent any transaction.
- Official portable NEAR CLI 0.30.1 downloaded/checksum-verified; no system/PATH installation. CLI first launch automatically migrated near-cli configuration V4 to V5; only help/version commands were run. No private key/seed was read or printed. Archive SHA-256 f5927854d916a6464e0092b379a6e96d54e40bee91e0dbc483786a6f680b4cbc.
- Real local CSV fixtures/spec/check reports created by `python scripts/prepare-demo-evidence.py`. Happy output passes; defective output fails missing-row preservation while passing an incomplete uniqueness baseline. Manifest records actual hashes and explicitly states no onchain execution. This prepares fault-injection evidence and does not add an AI/worker/verifier service.
- Testnet account setup guide, exact-artifact atomic deployment command and proposed 23-transaction activation/deploy/lifecycle/rejection-check packet are documented in TESTNET_DEPLOYMENT.md, TESTNET_APPROVAL_CHECKPOINT.md and testnet-transaction-plan.json.
- **At the latest read-only final block 276287969, the user-created named contract holds 10 testnet NEAR, no code, and one full-access key. The four implicit role IDs still return UNKNOWN_ACCOUNT. The 23-transaction packet is ready for review, including four role activation transfers; execution requires explicit owner approval plus supported local signing readiness. No agent-signed transaction, deployment or lifecycle has executed, no transaction hashes or final beneficiary balances exist, and Phase 2 cannot be closed.** No Phase 3 work.

The later read-only preflight initially hit sandbox DNS ENOTFOUND; retrying outside the sandbox succeeded. Latest responses are in testnet-preflight.json. Final preparation scan found no key/seed/API-secret patterns. The financial contract, accepted artifact, frontend, API and worker implementation were unchanged in Directive 002-B.


## Conditional deployment authorization — stopped before submission
The product owner conditionally authorized only the 23-transaction packet, with an explicit requirement to stop without transactions if account-control verification failed. That gate **failed**; no transfer, activation, deployment, initialization, lifecycle call, signing transaction or broadcast was performed.

| Check | Actual result |
|---|---|
| Accepted WASM SHA-256 | Match: b0e079d44375cda2baf0f242f5aa405d2c0cf158782b4817b9b0ce2284e30019 |
| Live network/source balance | testnet, 10 NEAR, empty contract code, final block 276288888 |
| Contract local signing | PASS: OS keychain credential retrieved in memory; domain-separated offchain Ed25519 signature verified against its onchain-authorized public key |
| Verifier local signing | FAIL: no accessible credential at the official NEAR testnet keychain entry |
| Customer local signing | FAIL: same |
| Worker local signing | FAIL: same |
| Challenger local signing | FAIL: same |
| Budget planning | 10 NEAR covers four 1-NEAR role allocations, ~1.67353 code storage plus overhead and 1-NEAR fee headroom at the snapshot; two job deposits come from the customer's allocation. Actual charges remain unexecuted. |

The official CLI public-key lookup was first used for the active contract account. Its source requires an onchain access-key list, so it cannot test inactive implicit accounts. A local ignored `.tools/signing-check` utility used the same official Windows keyring service/account naming to check all five directly, derive/check public keys and sign/verify a domain-separated offchain challenge. No private key, seed, credential JSON, transaction signature or signed transaction was printed or persisted. The utility exited 3 (gate failure). Reports contain only public IDs/public keys and statuses. Missing entries do not establish that the user lacks keys elsewhere; they establish that this execution environment's approved testnet keychain path is not ready. No alternate import, activation or permission change was attempted after failure.

Executed checks:
```powershell
Get-FileHash contracts/writbound-escrow/target/near/writbound_escrow.wasm -Algorithm SHA256
# $near is the existing official portable NEAR CLI path.
& $near account get-public-key from-keychain writbound-escrow-20261105.testnet network-config testnet
node scripts/testnet-preflight.mjs
. ./scripts/enter-msvc.ps1
cargo run --offline --manifest-path .tools/signing-check/Cargo.toml
```
A first help-only lookup used a missing from-keychain subcommand and returned a usage error; corrected help established the command above. No transaction was involved.

Evidence: testnet-signing-readiness.json, testnet-signing-readiness.log, testnet-execution-report.json and refreshed testnet-preflight.json. All reports exclude private key material. The utility and dependencies were compiled offline from already cached free crates; no paid service, mainnet asset or extra transaction was used.

**Transactions submitted: 0. Transaction hashes/explorer links: none.** Expected rejected transactions executed: 0. Unexpected onchain failures: 0. Actual failure: preflight signing readiness for four roles. Deployed code verification, successful lifecycle, challenge/refund lifecycle and final beneficiary balances remain unexecuted. The seeded verifier false positive remains a clearly labelled local demonstration fixture only. Phase 2 stays deployment pending and must not be closed; Phase 3 was not started.

Resume only after supported local credential setup for the same four role accounts; never paste seeds/private keys into chat. Recheck every condition before submission. Existing conditional authorization does not authorize materially different account IDs, permissions or transactions.


## Directive 002-C — offline role signing recovery
Limited checks of documented NEAR credential paths and Windows Credential Manager metadata filtered by the five exact public account prefixes found the contract credential but no original role credentials. No broad filesystem/secret search occurred. Original ID-generation provenance is unverified; the IDs were supplied by the user, and no project script recorded generating their keys. See ROLE_SIGNING_RECOVERY.md for exact scope and evidence.

Prepared four replacement keypairs directly in Windows Credential Manager using OS randomness; no plaintext key/seed files, key output or network calls. Local read-back plus offchain Ed25519 sign/verify succeeded for all four candidates and the existing contract. This does not recover the original IDs or activate any account. Evidence: testnet-replacement-signing-readiness.json and public testnet-accounts.replacement-proposal.json. Source: scripts/signing-readiness/; executed command used the identical ignored .tools/signing-check copy.

A revised testnet-transaction-plan.replacement-proposal.json retains the contract/artifact/amounts/order but changes the four role IDs and immutable verifier argument. The original canonical account mapping remains intact; its old conditional approval is not valid for these material changes. New product-owner approval and all fresh execution gates are required. No activation, funding, deployment, RPC transaction, mainnet or Phase 3 work occurred. Agent transactions remain zero. Stop after reporting this result.


## Directive 002-D — final approval packet (no transactions)
Fresh replacement/contract offchain checks: all five signatures verified using Windows Credential Manager in the intended execution environment. Contract public key matches the live full-access key. Refreshed finalized testnet block 276291356 confirms 10 NEAR on the unchanged empty contract account and four unactivated replacement role IDs. Accepted WASM SHA-256 remains b0e079d44375cda2baf0f242f5aa405d2c0cf158782b4817b9b0ce2284e30019. Verifier init matches the replacement verifier. Semantic diff confirms only identity substitutions from the original 23-step packet; amounts/order/gas/outcomes are unchanged.

Both the preflight and existing CLI RPC endpoints were confirmed read-only as chain_id=testnet. An initial stricter hostname equality check rejected the differing CLI host; a live status check verified that existing CLI host is also testnet without changing config. No transaction ran. Current conservative fee envelope is 0.6112583134272267 NEAR with a 1-NEAR cap; total resource allocation capped at 7 of 10 available NEAR (role allocations4, deployment/base storage2, fees1), with job deposits already inside the customer allocation and callbacks already inside parent gas. Authored project/log credential scan found no secret material.

Final packet: FINAL_TESTNET_APPROVAL_PACKET.md and testnet-transaction-plan.final-approval.json (SHA-256 33266af8dab092cce7c4e5eea92d96cc539dd552dd8116a81895107902f11345). No credentials generated, roles activated/funded, deployment performed or transaction signed/broadcast in this assignment. PM strategy approval is not execution approval. Stop awaiting explicit product-owner authorization; Phase 2 remains deployment pending, no Phase 3.


## Final execution authorization — stopped after first verified transfer
Signing/network/balance/approved artifact gates passed. Exactly one transaction was submitted and finalized successfully: BaQ9x4MaQdatz4cv9KajgYLPrTtqbAQmUmMXBPkEj71H (https://testnet.nearblocks.io/txns/BaQ9x4MaQdatz4cv9KajgYLPrTtqbAQmUmMXBPkEj71H), 1 testnet NEAR to the replacement verifier. All receipts succeeded; fee 0.0071149895375 NEAR; no duplicate submission. Actual source balance 8.9928850104625, verifier 1, other roles unactivated at finalized block 276296099.

Verification RPC reads subsequently returned -429 deprecation/rate-limit/subscription errors. Financial execution stopped; only read-only reconciliation continued. No paid resource was used. No steps2–23, deployment/init, escrow jobs or seeded-fault attestations executed. Expected rejected checks executed0; unexpected onchain failures0. Local CLI pre-sign prompt and public-signature output-filter issues are separately documented, not fabricated as onchain failures. No secret was exposed.

Current evidence: TESTNET_EXECUTION_REPORT.md, testnet-execution-report.json, testnet-execution/state.json, step-01-rpc.json and stopped-final-balances.json. Fresh authorization is required for the proposed rate-limited verification policy and unchanged remaining steps2–23. Phase2 remains incomplete; Phase3 not started.


Controlled resumption update: 6/23 transactions finalized successfully; deployed WASM matches the approved SHA-256; job 0 is Open with 0.01 unpaid escrow. Stopped after an order-sensitive JSON verification guard; exact approved arguments and finalized state reconciled read-only, no resubmission. Steps 7–23 remain unexecuted; settlement/refund and rejection tests remain outstanding. Fees 0.0300324813000376 testnet NEAR; conservative allocated budget 6.0300324813000376 / 7 NEAR. See docs/TESTNET_EXECUTION_REPORT.md for hashes, current balances and deadline risk. Phase 2 remains incomplete; no Phase 3.
