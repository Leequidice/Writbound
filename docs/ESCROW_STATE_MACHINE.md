# Escrow state machine — Phase 2 design
Design recorded before financial implementation. Times are NEAR block_timestamp nanoseconds. U64/U128 JSON values are decimal strings.

| State | Action/condition | Next state |
|---|---|---|
| Open | eligible worker accepts before work deadline | Accepted |
| Open | customer cancels, or anyone expires at work deadline | Refundable |
| Accepted | assigned worker submits before work deadline | Submitted |
| Accepted | anyone expires at work deadline | Refundable |
| Submitted | immutable designated verifier approves before verification timeout | Verified |
| Submitted | verifier rejects, or anyone expires at verification timeout | Refundable |
| Verified | third-party opens challenge before challenge end | Verified with pending challenge |
| Verified | verifier rejects challenge before its resolution deadline | Verified with resolved challenge |
| Verified | verifier upholds challenge, correction requested, first round | CorrectionRequired |
| Verified | verifier upholds challenge without correction, or second round | Refundable |
| Verified | anyone expires an unresolved challenge at resolution deadline | Refundable |
| CorrectionRequired | assigned worker submits before correction deadline | Submitted (second/final round) |
| CorrectionRequired | anyone expires at correction deadline | Refundable |
| Verified | challenge end reached; every challenge rejected | PayoutPending |
| PaymentReady | retry previously failed payout | PayoutPending |
| Refundable | anyone schedules customer refund | RefundPending |
| PayoutPending | matching private callback success/failure | Paid / PaymentReady |
| RefundPending | matching private callback success/failure | Refunded / Refundable |

Paid and Refunded are terminal. All unspecified transitions fail. No financial redirection, reassignment, upgrade method, withdrawal method or verifier replacement exists.

## Timing and bounds
Work deadline: 1 hour through 30 days after creation. Challenge duration: 1 hour through 7 days. Verification: 24 hours after each submission. Challenge starts only on successful verification, so every approved revision receives the full challenge window. One correction, with a new 24-hour work deadline, then re-verification and a fresh full challenge window. Four distinct third-party challengers per revision (eight records maximum), one challenge per account per revision. Resolution: 24 hours after opening. No new challenges at/after window end. Actions occur strictly before deadlines; timeout/settlement actions begin at the exact deadline. A verifier must resolve evidence before its deadline; an expired pending challenge cannot be dismissed later.

## Financial invariants
Exact attached deposit = explicit nonzero escrow + fixed per-job storage reserve (16384 bytes times runtime storage_byte_cost). No accepted excess deposits and no excess-refund subledger. Storage reserve is retained permanently for bounded lifecycle history and cannot be withdrawn. Serialized job plus conservative map overhead must fit that reserve. Deployment account separately funds code/initial state and fees.

Open escrow liability decreases into pending liability before a transfer is scheduled. Successful callback moves pending to paid/refunded totals; failed callback restores the full unpaid liability and retryable claim. Pending transfers have immutable beneficiary/amount derived from the job, plus monotonically increasing attempt IDs. No repeated call or stale callback may debit a job twice. Contract balance is never used as the payout amount. At any instant sum(job liabilities) = unpaid_escrow + pending_transfers; storage reserves and cumulative paid/refunded counters are separate.

## Availability tradeoffs
Anyone may trigger objective timeouts, settlement or refund; funds never require backend availability. Verifier absence before approval or during a challenge deterministically makes the customer refundable. This favors customer safety and can disadvantage an honest worker when a verifier is unavailable or challengers occupy all four slots. Challenge opening is not proof of defect; only the verifier can uphold evidence. The four-slot cap bounds storage but permits slot-exhaustion griefing; no decentralization claim is made.

NEAR asynchronous receipt completion is required. A failed transfer callback restores a retryable claim. The contract reserves 40 Tgas for its bounded callback and requires 100 Tgas for scheduling. A pending transfer must never be released by an arbitrary timeout: if a callback itself fails, the actual transfer may already have succeeded, and blind retry would double-pay. Callback receipt liveness is a runtime trust assumption; inspect receipt outcomes before any future migration/recovery design. No unsafe admin recovery is included.
