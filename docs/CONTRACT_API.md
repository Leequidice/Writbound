# Escrow API — implemented Phase 2 contract
All calls are NEAR native JSON. U64/U128 fields (IDs, timestamps, amounts) are decimal strings; u8 challenge IDs are numbers. AccountId parsing is enforced by near-sdk. Mutations use predecessor_account_id, not signer_account_id, as caller authority. Only create_job accepts attached tokens; all other exported methods reject deposits through near-sdk wrappers. Use 100 Tgas minimum for settle_job/refund_job; 150 Tgas is recommended for operational headroom.

| Method | Arguments | Permission/effect |
|---|---|---|
| new | verifier: AccountId | Once, contract-account predecessor only; dedicated .testnet account |
| version | none | Current implementation version |
| get_verifier | none | Immutable verifier account |
| storage_quote | none | Per-job nonrefundable reserve in yoctoNEAR |
| create_job | escrow: U128, specification_hash: string, work_deadline: U64, challenge_duration: U64 | Exact attached escrow + storage_quote; returns unique U64 |
| accept_job | job_id: U64 | First eligible worker before work deadline |
| submit_work | job_id: U64, artifact_hash: string, metadata: string or null | Assigned worker; initial submission or one correction |
| attest_verification | job_id: U64, passed: bool, evidence_hash: string | Verifier before 24-hour verification deadline |
| open_challenge | job_id: U64, evidence_hash: string | Independent third party within approved revision's window; returns u8 |
| resolve_challenge | job_id: U64, challenge_id: u8, upheld: bool, allow_correction: bool, resolution_hash: string | Verifier only, before every unresolved challenge deadline; correction only in first round |
| cancel_job | job_id: U64 | Customer only while Open |
| expire_job | job_id: U64 | Anyone at an eligible objective timeout; marks Refundable |
| settle_job | job_id: U64 | Anyone; verified and elapsed window/no pending challenges, or retry PaymentReady |
| refund_job | job_id: U64 | Anyone while Refundable; fixed customer recipient |
| on_transfer | job_id: U64, attempt: U64 | Private callback only, never manually invoke |
| get_job | job_id: U64 | Full details, histories, worker, verification, challenges, transfer state, timestamps and escrow |
| get_job_count | none | Count/next ID |
| list_jobs | from_index: U64, limit: number (1..50) | Paginated complete job records |
| get_accounting | none | Unpaid escrow, pending transfers, retained storage reserves, paid/refunded totals |

A rejection/refund eligibility transition does not itself send tokens: call refund_job, then inspect the callback-completed state. A scheduled settlement does not mean payment succeeded: wait for Paid and successful transfer/callback receipts. Retry PaymentReady or Refundable after transfer failure. Never manually reset a pending state.

## Offchain evidence convention
Task-spec bytes should publish input SHA-256, exact CSV cleaning operation/version, deterministic acceptance checks, required columns/data treatment and artifact availability location. Hash those exact immutable bytes for specification_hash. Verification/evidence report bytes should include schema version, contract account/job ID, task-spec hash, submission artifact hash, deterministic suite version, reproduction instructions, checks/results and any failure input. Hash exact report bytes; publish reports separately so the designated verifier and challenger can reproduce them. No model/verifier runner or external artifact availability service is implemented here. The contract only enforces account authority, state, timing and commitments; the verifier remains trusted for their meaning.
