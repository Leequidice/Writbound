# Final testnet approval packet — Directive 002-D
**Awaiting explicit product-owner transaction authorization.** PM approval of the replacement strategy is not transaction approval. No activation, funding, deployment or lifecycle transaction has been submitted by the agent.

## Identities and current verification
| Role | Public account ID | Onchain status at checked block | Offchain signing |
|---|---|---|---|
| Contract | `writbound-escrow-20261105.testnet` | 10 testnet NEAR; active, empty code, one full-access key | PASS |
| Verifier | `fcdcd131110d9310c74e6c340e114e92bd79044bbe049d275fadd7d6b3867831` | Not activated or funded | PASS |
| Customer | `7ac384032504d793e733f0210f5ee39518adb0db92dbc95ed9001b7af08cebf9` | Not activated or funded | PASS |
| Worker | `75b826f8ba2f37eb9431805f7a19659f0ecd81e7458eeefd42663b9365a67f55` | Not activated or funded | PASS |
| Challenger | `7b1828f1acfc0003b06abf0744f9dea35f53ad105f4e14a24b0901de5a99465f` | Not activated or funded | PASS |

All five credentials were read from Windows Credential Manager in the intended Windows execution environment and used for fresh domain-separated Ed25519 sign/verify checks; no credential was generated/exported by this check. Contract public key also matches its onchain full-access key. The four replacement IDs correspond to the checked public keys. No old role ID remains in transaction signers, recipients or initialization. The canonical old mapping is intentionally not promoted until approval.

## Artifact and initialization
Contract: **writbound-escrow-20261105.testnet**.
WASM: `contracts/writbound-escrow/target/near/writbound_escrow.wasm`, **167353 bytes**.
SHA-256: `b0e079d44375cda2baf0f242f5aa405d2c0cf158782b4817b9b0ce2284e30019`.
Expected NEAR code hash: `CuTHP5d4SUnkkVjUGn3b8UzBXkS2i8KABabNDrpZhKS8`.

Deploy this exact file and initialize atomically, signed by the contract account:
```json
{"method":"new","args":{"verifier":"fcdcd131110d9310c74e6c340e114e92bd79044bbe049d275fadd7d6b3867831"},"attached_NEAR":"0","prepaid_Tgas":50}
```
The verifier equals the replacement verifier above. There is no verifier replacement method. The account's full-access key can still replace code; key custody remains a trust boundary. No code/key changes, retries or extra transactions are authorized by this packet.

## Network and maximum budget
Both read-only preflight RPC (`https://rpc.testnet.near.org`) and the existing official CLI connection (`https://archival-rpc.testnet.fastnear.com/`) returned **chain_id=testnet**. CLI network_name=testnet; no query credentials, API key, subscription or config change was used. Every transaction is explicitly tagged testnet in the machine-readable packet; every function/deploy receiver is the contract and the four activation receivers are the replacement roles. Require `network-config testnet` and a fresh live chain-ID check before execution. Stop on payment/authentication requirements; never subscribe or fall back to mainnet.

Finalized snapshot: block 276291356, `6rHzNTzD7s3T5Mt1tXRkK2QcDQxUvF9qY7qQjwbRKrKi`, protocol 88; source **10 NEAR**, gas price 100000000 yoctoNEAR/gas and storage 10000000000000000000 yoctoNEAR/byte.

| Reserved allocation | Maximum testnet NEAR |
|---|---:|
| Four exact role activation/funding transfers, 1 each | 4 |
| Deployment code and initial/base-state storage allowance | 2 |
| All network gas/action/activation fees, including expected rejections | 1 |
| **Maximum resource allocation** | **7** |
| Source balance remaining unallocated | 3 |

This is a capital-allocation ceiling, not a claim that 7 NEAR is burned as fees. Funds move between controlled testnet accounts, and storage funding remains held. Job funding is paid from the customer's existing 1-NEAR allocation: two exact deposits of **0.17384** each = **0.34768**, including **0.32768** permanent storage reserve and **0.02** escrow. Do not add those deposits again to the source allocation.

Code bytes alone require approximately **1.67353** storage NEAR before base/account/header overhead, within the separate 2-NEAR allowance. Job history is additionally funded by the customer storage reserve. Function calls allocate **2250 Tgas** = **0.225 NEAR** at the snapshot price. The two 40-Tgas callbacks are carved out of the successful 150-Tgas settlement/refund calls and are already included. A conservative 19×300-Tgas/action/receipt/implicit-creation envelope is **0.6112583134272267 NEAR**, below the **1-NEAR fee cap**. This is a planning envelope, not actual fees. Full arithmetic/assumptions: final-testnet-budget.json.

No paid funds or topups are needed. Recheck balances/live fees before each transaction; stop before exceeding any category or the total allocation, and seek revised approval if fees/storage/plan materially change.

## Exact sequence: 23 submitted transactions
H and B are actual job IDs returned by creation, never assumed IDs. Both use 0.01 escrow, live storage_quote, work_deadline=current finalized block time+2 hours, and a full **one-hour** challenge duration. All non-create calls attach zero. Full args/gas/receivers are in testnet-transaction-plan.final-approval.json.

| # | Signer | Action/method | Expected outcome |
|---|---|---|---|
| 1 | contract | Transfer 1 NEAR to verifier | activate the supplied implicit account and fund testnet-only gas/deposits |
| 2 | contract | Transfer 1 NEAR to customer | activate the supplied implicit account and fund testnet-only gas/deposits |
| 3 | contract | Transfer 1 NEAR to worker | activate the supplied implicit account and fund testnet-only gas/deposits |
| 4 | contract | Transfer 1 NEAR to challenger | activate the supplied implicit account and fund testnet-only gas/deposits |
| 5 | contract | DeployContract + new | atomic deploy/init; code hash/version/verifier verified |
| 6 | customer | create_job | Open; capture H from actual return value |
| 7 | worker | accept_job H | Accepted |
| 8 | worker | submit_work H | Submitted |
| 9 | verifier | attest_verification H | Verified; capture H challenge_end |
| 10 | customer | settle_job H | Expected failure: challenge window is still open |
| 11 | customer | create_job | Open; capture B from actual return value |
| 12 | worker | accept_job B | Accepted |
| 13 | worker | submit_work B | Submitted; full fixture checks actually fail |
| 14 | verifier | attest_verification B | Verified; controlled faulty-verifier test, not a genuine verification success |
| 15 | challenger | open_challenge B | Pending challenge; capture challenge ID and resolution deadline |
| 16 | customer | settle_job H | PayoutPending -> native transfer 0.01 -> callback -> Paid |
| 17 | customer | settle_job H | Expected failure: job is not payable; no additional transfer |
| 18 | customer | refund_job H | Expected failure: job is not refundable; no additional transfer |
| 19 | customer | settle_job B | Expected failure: Unresolved challenge (window already expired) |
| 20 | verifier | resolve_challenge B | Refundable; no payout |
| 21 | customer | refund_job B | RefundPending -> native transfer 0.01 -> callback -> Refunded |
| 22 | customer | refund_job B | Expected failure: job is not refundable; no additional transfer |
| 23 | customer | settle_job B | Expected failure: job is not payable; no additional transfer |

After step 15, wait until both real challenge windows expire and remain before B's resolution deadline; then execute steps 16–23. Successful payouts/refunds each create a native-transfer receipt and private callback; those are part of the submitted transaction's receipt graph, not additional submitted transactions. Wait for every final receipt and Paid/Refunded state.

Expected rejection tests: **10** early settlement; **17** duplicate H settlement; **18** refund after H Paid; **19** B settlement blocked by unresolved challenge after its window; **22** duplicate B refund; **23** settlement after B Refunded. Those six signed checks still consume gas and must be logged as expected rejections, never unexpected failures. Stop on any other failed or ambiguous transaction; no blind retry.

## Deviations and fixed evidence rules
Compared with the original 23-step packet, only four role identities, their signers/activation recipients, and the immutable verifier init value change. Contract, WASM, transaction count/order, amounts, gas, timing, method args other than identities, fixtures and expected outcomes are unchanged. Explicit 7-NEAR allocation / 1-NEAR fee / 2-NEAR base-storage stop ceilings clarify and tighten the previous funding estimate; they do not increase any transfer.

Step 14 is an explicitly seeded **verifier false-positive demonstration fixture**, not a genuine independent discovery or successful full verification. Actual defective-output checks fail and remain recorded as such. Reports bind actual returned job/contract IDs, exact artifact/spec bytes and actual checks; hash those actual bytes. Dynamic IDs/deadlines/live storage quote/report hashes may replace only the documented placeholders. No fabricated commitments, hashes or outcomes.

## Remaining risks and evidence
Trusted verifier dishonesty/loss/offline time, bounded challenge-slot griefing, account-upgrade keys, credential profile loss, RPC availability, price changes and NEAR receipt/callback liveness remain assumptions. At least a real one-hour wait is required. No native Windows sandbox runtime result or onchain lifecycle has been claimed. Unit tests/local WASM checks are prior evidence, not deployment proof.

Fresh evidence: final-testnet-signing-readiness.json/log, final-testnet-preflight.json, final-testnet-cli-network.json, final-testnet-protocol-fees.json, final-testnet-budget.json and final-testnet-credential-scan.json. Authored source/config/report/log scan found no actual private keys, API secrets or recovery phrases; code schema names/placeholders are not credentials. OS keychain material was never printed/exported. The scan excludes third-party caches/binaries and does not claim a proof against arbitrary unlabelled secret encodings.

Machine-readable final plan SHA-256: `33266af8dab092cce7c4e5eea92d96cc539dd552dd8116a81895107902f11345`.

**Authorization requested:** approve only this final 23-transaction NEAR-testnet packet, the replacement public identities, labelled seeded fault, expected rejections and stated caps. No mainnet, paid services, keys/permissions changes, extra/retry transactions or Phase 3. Directive 002-D requires stopping here for explicit product-owner authorization.
