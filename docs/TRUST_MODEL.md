# Trust and authority — current Phase 2
The NEAR contract now enforces escrow and lifecycle transitions. SQLite remains an offchain index; frontend/backend/model have no independent settlement authority. See ESCROW_STATE_MACHINE.md for transitions and SECURITY_MODEL.md for roles, funding and callback assumptions.

An immutable designated verifier attests to deterministic report commitments and adjudicates bounded challenges. The contract authenticates the caller and enforces timings and states; it cannot independently fetch, inspect or execute CSV checks. A hash commits bytes, not correctness or availability. Reports must bind job/specification/submission hashes and published suite versions (CONTRACT_API.md).

Anyone can trigger objective timeouts and eligible settlement/refunds. Verifier absence before approval or unresolved challenge expiry leads to customer refund eligibility. Opening a challenge is not a finding of defect. At most four challenges per revision and one correction bound history and waiting but permit slot-exhaustion griefing and can disadvantage honest workers if the verifier is offline.

The verifier cannot be a customer/worker beneficiary; there is no arbitrary escrow recipient, administrator withdrawal, verifier rotation or built-in upgrade. Deployment keys can still replace contract code; key custody remains a trust boundary. Failed native transfers preserve retryable fixed-beneficiary claims. NEAR receipt/callback completion is assumed; pending transfers cannot safely be retried blindly if callback execution itself fails.

Local checks passed; no testnet deployment or real E2E lifecycle has been executed. Deployment awaits explicit approval. Models have no shell/signing integration in this phase, and all planned operation is testnet-only.
