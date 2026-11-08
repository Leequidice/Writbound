# Directive 002-B — proposed testnet approval packet
Status: **ready for product-owner review; execution approval pending**. The user created/funded the named contract account through the guided faucet command. Read-only RPC confirms 10 testnet NEAR, no code and one full-access key. Four implicit role IDs remain inactive; their explicit activation/funding transfers are included in this approval packet. Confirm local control of all five signing credentials before execution. No transaction was signed or sent by the agent.

## Selected public identities
| Role | Public ID | Current evidence |
|---|---|---|
| Contract | `writbound-escrow-20261105.testnet` | Confirmed active, 10 testnet NEAR, no code, one full-access key |
| Verifier | `1a23e55459c7e0503df815a0aff749c9834a0c315552709cfaadd94630083929` | UNKNOWN_ACCOUNT on testnet; balance unavailable |
| Customer | `2abfc6c4576095958e51f373b77b30c03be80058a9b1fa60d701e153ee01ff1a` | UNKNOWN_ACCOUNT on testnet; balance unavailable |
| Worker | `b265140f50d716b20d98d94ff2a4a9336c42cc52281fa124b952b16c4818bc60` | UNKNOWN_ACCOUNT on testnet; balance unavailable |
| Challenger | `30314a0c731301037ddce5c1716f14a977bf69136345cf11b835880071e768f7` | UNKNOWN_ACCOUNT on testnet; balance unavailable |

The supplied original implicit Contract ID `dd961dc1ab7b33e9be13e170369bbd453d7e610d94abd7d9e385585245680968` is not usable as contract account with the accepted WASM: new requires current_account_id ending .testnet. It also returned UNKNOWN_ACCOUNT. Do not deploy there or silently modify/rebuild the contract to remove this guard.

Role-account RPC evidence is in testnet-preflight.json at final block 276287969. UNKNOWN_ACCOUNT is not an active zero-balance account; no onchain balance can be reported until activated. No private credential content was read. User wallet/keychain control of the four implicit role IDs still needs confirmation. The named contract was created by the user; its 10-testnet-NEAR funding is now confirmed read-only. The agent did not execute the creation command; no creation transaction hash was captured.

## Exact accepted artifact and init
WASM: `contracts/writbound-escrow/target/near/writbound_escrow.wasm`, 167353 bytes.

SHA-256: `b0e079d44375cda2baf0f242f5aa405d2c0cf158782b4817b9b0ce2284e30019`.

Expected NEAR/base58 code hash: `CuTHP5d4SUnkkVjUGn3b8UzBXkS2i8KABabNDrpZhKS8`.

Atomic deployment plus initialization signed by `writbound-escrow-20261105.testnet`:
```json
{"method":"new","args":{"verifier":"1a23e55459c7e0503df815a0aff749c9834a0c315552709cfaadd94630083929"},"attached_NEAR":"0","prepaid_Tgas":50}
```
Verifier cannot be replaced by any method. Losing/compromising its key requires a new deployment and no migration exists here. Timeout refunds limit availability failures, not dishonesty. The deployment account's full-access key can still replace all contract code and must remain securely held; no key removal, emergency withdrawal or arbitrary upgrade action is approved.

## Funds — entirely free testnet NEAR
Live snapshot: protocol 88, gas price 100000000 yoctoNEAR/gas, storage price 10000000000000000000 yoctoNEAR/byte.
- Per-job escrow: 0.01; per-job retained storage reserve: 0.16384; exact attached deposit: **0.17384**.
- Two customer deposits: **0.34768**; final retained job storage reserves: **0.32768**. Exactly 0.01 is paid to worker for H and 0.01 refunded to customer for B.
- Code bytes alone imply about **1.67353** storage NEAR before account/access-key/state overhead. This is locked balance, not gas expenditure.
- Target balances after setup: contract at least 5, verifier/customer/worker/challenger 1 each. A **10-testnet-NEAR faucet source** is a conservative planning target for funding all roles and leaving headroom; actual faucet grant is not yet known.
- Nineteen contract transactions allocate 2250 Tgas: **0.225** at the snapshot price. A 19×300 Tgas envelope is **0.57** before non-function action fees/future price changes. Four native activation transfers have separate protocol action/creation fees. Official current guidance quotes a 0.007-NEAR creation charge per new implicit account (0.028 for four), plus transfer transaction fees; confirm against the live protocol/receipts. Reserve up to **1 testnet NEAR** total fee headroom and recheck live cost/balances before approval. No fixed estimate is represented as an actual fee.
- Faucet tokens can cover code/state storage, native transfers, escrow and all fees; no mainnet tokens/purchase/paid RPC is needed. Faucet eligibility, quota and grants have not been exercised or guaranteed. If free funding is insufficient, stop; do not buy tokens.

## Exact proposed sequence — 23 signed transactions
Four role activation transfers plus 19 contract transactions, with deliberate rejection steps 10, 17, 18, 19, 22, 23. The user's faucet-sponsored creation transaction is separate setup evidence. No retries, extra transfers, code changes, or key changes are implicitly authorized.

| Step | Signer role | Action/method | Expected result |
|---|---|---|---|
| 1 | contract | native NEAR Transfer | activate the supplied implicit account and fund testnet-only gas/deposits |
| 2 | contract | native NEAR Transfer | activate the supplied implicit account and fund testnet-only gas/deposits |
| 3 | contract | native NEAR Transfer | activate the supplied implicit account and fund testnet-only gas/deposits |
| 4 | contract | native NEAR Transfer | activate the supplied implicit account and fund testnet-only gas/deposits |
| 5 | contract | DeployContract + new | atomic deploy/init; code hash/version/verifier verified |
| 6 | customer | create_job | Open; capture H from actual return value |
| 7 | worker | accept_job | Accepted |
| 8 | worker | submit_work | Submitted |
| 9 | verifier | attest_verification | Verified; capture H challenge_end |
| 10 | customer | settle_job | Expected failure: challenge window is still open |
| 11 | customer | create_job | Open; capture B from actual return value |
| 12 | worker | accept_job | Accepted |
| 13 | worker | submit_work | Submitted; full fixture checks actually fail |
| 14 | verifier | attest_verification | Verified; controlled faulty-verifier test, not a genuine verification success |
| 15 | challenger | open_challenge | Pending challenge; capture challenge ID and resolution deadline |
| 16 | customer | settle_job | PayoutPending -> native transfer 0.01 -> callback -> Paid |
| 17 | customer | settle_job | Expected failure: job is not payable; no additional transfer |
| 18 | customer | refund_job | Expected failure: job is not refundable; no additional transfer |
| 19 | customer | settle_job | Expected failure: Unresolved challenge (window already expired) |
| 20 | verifier | resolve_challenge | Refundable; no payout |
| 21 | customer | refund_job | RefundPending -> native transfer 0.01 -> callback -> Refunded |
| 22 | customer | refund_job | Expected failure: job is not refundable; no additional transfer |
| 23 | customer | settle_job | Expected failure: job is not payable; no additional transfer |

Both jobs use 0.01 escrow, live exact storage quote, work_deadline = current finalized chain timestamp + 2 hours at each creation, and challenge_duration = 3600000000000 ns. Capture H/B/challenge IDs from actual transaction return values, not assumptions. Read all final receipt outcomes, including native transfer and private callback, before declaring Paid/Refunded. Queries and code verification are read-only, not extra transactions.

After step 15, wait until both real challenge_end timestamps have passed but before B's resolution deadline (24 hours after opening). No shortened build constants or fabricated time advancement. Then steps 16–23 exercise payable settlement, challenge blocking and refunds.

## Reproducible evidence and seeded fault
The local fixture generator `python scripts/prepare-demo-evidence.py` was executed. `docs/demo/happy-checks.json` passes all checks; `defective-checks.json` fails preservation of input row 002,Bob while passing the intentionally incomplete uniqueness baseline. All actual file hashes are in docs/demo/manifest.json.

Step 14 deliberately seeds a faulty verifier approval (`passed=true`) for the defective fixture so a valid challenge can reach the public challenge workflow. Its report must explicitly record **seeded false positive, full checks fail**. It is not a genuine correctness attestation or fabricated successful test. Step 15 commits the reproducible counterexample and step 20 upholds it. Approving the packet must explicitly include this controlled faulty-verifier test. No AI response or offchain success is fabricated.

Bind reports to actual contract/job IDs after job creation and hash those actual report bytes. Fixture/spec/artifact bytes are already real; no job-bound report is claimed before the job exists. All five controlled roles can reproduce the local files; they are separate accounts, not independent organizations. Public artifact publication has not been performed.

## Approval gate
Named account creation and current source balance are confirmed. Request explicit product-owner approval of the selected identities, four activation transfers and full sequence, plus confirmation that the user controls all five credentials. Before executing anything, verify supported local signing readiness and freeze the packet; rerun `node scripts/testnet-preflight.mjs`; ensure chain_id=testnet, no preexisting contract code/state, sufficient unencumbered balance and matching accepted artifact hash. If the user funds roles independently or any identity/amount/artifact changes, remove unnecessary activation transfers and re-present the changed packet for approval.

No deployment or lifecycle transactions may run until the product owner explicitly approves the finalized account-specific packet. Steps 4–5 of Directive 002-B remain unexecuted; Phase 2 cannot be closed yet. No transaction hashes/explorer success links or final balances exist.

Official references: https://docs.near.org/tools/cli (faucet/keychain setup), https://docs.near.org/integrations/accounts (implicit activation/creation charge), https://docs.near.org/protocol/storage/storage-staking (storage pricing). These are guidance, not evidence of an actual faucet grant or transaction.


## Latest account snapshot
Named contract `writbound-escrow-20261105.testnet`: **10.000000 testnet NEAR**, locked validator stake 0, storage usage 182 bytes, empty code hash `11111111111111111111111111111111`, one full-access key. Final block 276287969, hash FtMacUeuD1CaYHe8E6oPdd7pb27RABZSayP1FkL8rtKM. The four role IDs remain UNKNOWN_ACCOUNT; they have no active onchain balance yet. Full response: testnet-preflight.json. This is not deployment or a lifecycle result.

Recommended approval wording: "I control the contract and all four role-account credentials. I approve the 23 testnet-only transactions in TESTNET_APPROVAL_CHECKPOINT.md/testnet-transaction-plan.json, including four 1-NEAR role activation transfers, exact-hash atomic deployment/init, the explicitly seeded false-positive challenge test and the six expected rejection checks. No mainnet, key changes, additional transactions or Phase 3." The agent must stop at this checkpoint and await the owner's response.


## Conditional approval received; signing gate failed
The owner authorized this exact packet subject to all-five signing access and budget/hash checks. Contract signing passed; verifier/customer/worker/challenger official testnet keychain entries were unavailable. Execution was stopped without any submitted transaction. This authorization is conditional, not evidence of deployment. See testnet-signing-readiness.json and testnet-execution-report.json. No material changes are permitted under the existing approval.


## Directive 002-C superseding readiness result
The original four role credentials were not found in the limited supported stores. Offline replacement credentials now pass signing checks, but their public IDs are only a proposal: see ROLE_SIGNING_RECOVERY.md and testnet-transaction-plan.replacement-proposal.json. The existing account mapping was not silently changed. Because activation recipients/signers and the immutable verifier change, a new explicit approval is required for the revised packet. No activation/funding/deployment or blockchain transactions were performed in recovery. Do not execute the old packet while its role credentials remain unavailable.


## Directive 002-D current approval document
The final replacement-ID packet is docs/FINAL_TESTNET_APPROVAL_PACKET.md and docs/testnet-transaction-plan.final-approval.json. Fresh signing/network/budget/hash/credential checks passed. Those documents supersede old identity examples for approval purposes only; no execution or mapping promotion is authorized yet. Existing 23-step order is unchanged; resource allocation is capped at 7 testnet NEAR with 1-NEAR fee and 2-NEAR deployment/base-storage caps. Stop for explicit product-owner authorization.


## Latest execution result
Only step1 was submitted and FINAL-success verified: [BaQ9x4MaQdatz4cv9KajgYLPrTtqbAQmUmMXBPkEj71H](https://testnet.nearblocks.io/txns/BaQ9x4MaQdatz4cv9KajgYLPrTtqbAQmUmMXBPkEj71H). One testnet NEAR activated/funded the replacement verifier, fee 0.0071149895375. Verification RPC deprecation/rate-limit errors triggered a stop; no steps2–23 or deployment occurred. No paid service or transaction retry. See TESTNET_EXECUTION_REPORT.md and TESTNET_RESUME_PLAN.md. Fresh authorization required before further broadcast.
