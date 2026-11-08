> Current execution status: 6/23 FINAL successes; stopped after reconciled local verification guard. Job 0 Open; no payout/refund yet. See [execution report](TESTNET_EXECUTION_REPORT.md). Historical results below retain their original scope.

# Phase 2 testnet deployment — prepared, NOT executed
Status: Directive 002-B predeployment review complete; account activation/funding and final approval checkpoint remain pending. Public IDs were supplied, but all initially returned UNKNOWN_ACCOUNT. The supplied implicit Contract ID is incompatible with new; the user selected guided setup of writbound-escrow-20261105.testnet. See TESTNET_APPROVAL_CHECKPOINT.md for exact identities, current status, budgets and proposed sequence. No transaction hashes exist.

## Preconditions
- Local unit tests, strict Clippy and optimized WASM validation pass (see VERIFICATION.md).
- Obtain explicit user approval for testnet deployment and lifecycle transactions under Directive 002 section 7.
- Use a fresh dedicated contract account ending .testnet; no existing funds/state to migrate. Separate verifier, customer, worker and challenger account IDs. Only public IDs belong in this document; keys remain in local keychain/wallet.
- Fund exclusively with free testnet faucet tokens. The contract account must cover code/initial storage; at runtime query storage_quote for each job and attach exact escrow plus reserve. At the currently modeled storage_byte_cost the reserve is 0.16384 NEAR; do not substitute that figure for a live quote. No paid acquisition or mainnet support.
- Validate live RPC chain_id is testnet, account existence, access-key authority and account storage/liquid balance read-only before submitting. Account suffix checking in new is a guard, not cryptographic network identification.
- Deploy and initialize in one transaction signed by the contract account to avoid initialization races. This contract has no migration from the Phase 1 empty struct or other previous state.

## Exact-artifact atomic deployment command (NOT executed)
Official portable near-cli-rs 0.30.1 was downloaded from the NEAR GitHub release, with published archive SHA-256 verified as `f5927854d916a6464e0092b379a6e96d54e40bee91e0dbc483786a6f680b4cbc`. It lives in ignored `.tools/near-cli/near-cli-rs-x86_64-pc-windows-msvc/near.exe`; no system installation or PATH change. Its first help invocation automatically migrated the existing near-cli config from V4 to V5. No private credential contents or signing operations were accessed.

Deploy the exact already-approved file, rather than rebuilding-and-sending in one step:
```powershell
$near = (Resolve-Path '.tools/near-cli/near-cli-rs-x86_64-pc-windows-msvc/near.exe').Path
$contractAccount = 'writbound-escrow-20261105.testnet'
$verifierAccount = '1a23e55459c7e0503df815a0aff749c9834a0c315552709cfaadd94630083929'
$wasm = (Resolve-Path 'contracts/writbound-escrow/target/near/writbound_escrow.wasm').Path
$expected = 'b0e079d44375cda2baf0f242f5aa405d2c0cf158782b4817b9b0ce2284e30019'
if ((Get-FileHash $wasm -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'Approved artifact mismatch' }
$initArgs = @{ verifier = $verifierAccount } | ConvertTo-Json -Compress
# STOP: the following transaction requires finalized account checks and explicit approval.
& $near contract deploy $contractAccount use-file $wasm with-init-call new json-args $initArgs prepaid-gas '50 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send
```
Only version/help commands were run. The send command is documented but unexecuted. The contract-account key must sign atomic deployment/init; never pass keys/seeds in command arguments or chat.

## User-guided account setup (completed by user, not executed by agent)
The user chose a named contract while retaining four implicit role IDs. Run in the user's PowerShell terminal:
```powershell
$near = (Resolve-Path '.tools/near-cli/near-cli-rs-x86_64-pc-windows-msvc/near.exe').Path
& $near account create-account sponsor-by-faucet-service writbound-escrow-20261105.testnet autogenerate-new-keypair save-to-keychain network-config testnet create
```
Select **ed25519**, the classic default signature scheme. Keep recovery data private and retain the local keychain entry. Do not choose print-to-terminal and do not paste secrets into chat. Creation is faucet-sponsored and may be rate-limited; only a real RPC-confirmed result counts as created/funded.

The original four role IDs are valid implicit account names but were not active on testnet. After approval, native transfers to those IDs can activate/fund them. Confirm the user controls their corresponding testnet wallet keys before any funding. Keys remain in the wallet or supported local keychain; use local CLI import/signing prompts if necessary, never chat. RPC now confirms the named contract exists with 10 testnet NEAR, empty code and one full-access key. The user performed its faucet setup; no creation hash was captured. No contract deployment or role-funding transfer has run.

## Read-only preflight
```powershell
node scripts/testnet-preflight.mjs
```
Reads only status/final block/protocol config/gas price/public account and public-key permissions over the explicit testnet RPC. It verifies the accepted local WASM hash, reports account existence/balances, and refuses invalid/duplicate IDs. No signing or send code exists in this script. `docs/testnet-accounts.json` contains public IDs only; the original supplied implicit Contract ID is archived in testnet-supplied-accounts.json and is not the deployment target. Suggested all-named IDs were also checked read-only earlier; those were not created or claimed.

## Required real testnet lifecycle evidence (pending)
1. Confirm deployed code hash, version, immutable verifier and zero accounting. Record deployment/init transaction and all final receipt outcomes.
2. Customer creates a job with small explicit testnet escrow (suggested 0.01 NEAR), exact live storage quote, work deadline 2 hours ahead, challenge duration 1 hour. Record created ID and onchain block time; task/evidence hashes must be hashes of actual published demo bytes.
3. Worker accepts, submits a real artifact hash, and verifier approves based on deterministic checks. Capture job state and failed early-settlement attempt.
4. Wait until the actual onchain challenge_end (at least one hour; no shortened deployment-only constants). Settle permissionlessly and inspect transfer/callback success, Paid, fixed worker recipient, amount and accounting. Worker balance deltas must account for gas; do not treat gross deltas as exact earnings.
5. In parallel with the happy path, create the defective-fixture job and explicitly seed a verifier false-positive attestation (never describe full checks as passing). Commit actual failing reproduction evidence through the challenger. After the real window expires, prove the unresolved challenge blocks settlement; then uphold it without correction, call refund_job and verify Refunded/receipts. The exact 23-step plan, including four currently needed account-activation transfers, is in testnet-transaction-plan.json.
6. Confirm repeated settlement/refund attempts fail and storage reserves remain separate. Record every actual transaction hash and explorer/RPC receipt result in VERIFICATION.md; never invent a hash or mark a merely scheduled payout successful.

## Sandbox limitation
The official near-sandbox runner supports Linux x86_64/aarch64 and macOS ARM, not native Windows: https://raw.githubusercontent.com/near/near-sandbox-rs/main/src/runner/mod.rs . Native near-sandbox is not installed. No Docker/WSL/system changes were introduced. SDK mocked-runtime unit tests cover promise scheduling/results; they are not a sandbox or testnet E2E test. A sandbox suite is not executable here without additional infrastructure, and none is counted. An actual approved testnet lifecycle is the remaining financial runtime validation gate.


## Latest authorization outcome — execution stopped
Conditional product-owner approval was received. The mandatory all-five signing gate failed: contract credential/signature verified, but verifier/customer/worker/challenger credentials were unavailable at the official testnet OS-keychain entries. The agent stopped without submitting any transaction. The 10-NEAR source and accepted WASM hash were reconfirmed. No role activation, deployment, initialization or lifecycle ran; no transaction hashes exist. See VERIFICATION.md and testnet-execution-report.json. Configure the existing role credentials locally (never chat), then rerun the gate and all conditions before using the conditional authorization. Material changes require a new approval packet.


## Directive 002-C superseding readiness result
The original four role credentials were not found in the limited supported stores. Offline replacement credentials now pass signing checks, but their public IDs are only a proposal: see ROLE_SIGNING_RECOVERY.md and testnet-transaction-plan.replacement-proposal.json. The existing account mapping was not silently changed. Because activation recipients/signers and the immutable verifier change, a new explicit approval is required for the revised packet. No activation/funding/deployment or blockchain transactions were performed in recovery. Do not execute the old packet while its role credentials remain unavailable.


## Directive 002-D current approval document
The final replacement-ID packet is docs/FINAL_TESTNET_APPROVAL_PACKET.md and docs/testnet-transaction-plan.final-approval.json. Fresh signing/network/budget/hash/credential checks passed. Those documents supersede old identity examples for approval purposes only; no execution or mapping promotion is authorized yet. Existing 23-step order is unchanged; resource allocation is capped at 7 testnet NEAR with 1-NEAR fee and 2-NEAR deployment/base-storage caps. Stop for explicit product-owner authorization.


## Latest execution result
Only step1 was submitted and FINAL-success verified: [BaQ9x4MaQdatz4cv9KajgYLPrTtqbAQmUmMXBPkEj71H](https://testnet.nearblocks.io/txns/BaQ9x4MaQdatz4cv9KajgYLPrTtqbAQmUmMXBPkEj71H). One testnet NEAR activated/funded the replacement verifier, fee 0.0071149895375. Verification RPC deprecation/rate-limit errors triggered a stop; no steps2–23 or deployment occurred. No paid service or transaction retry. See TESTNET_EXECUTION_REPORT.md and TESTNET_RESUME_PLAN.md. Fresh authorization required before further broadcast.


Controlled resumption update: 6/23 transactions finalized successfully; deployed WASM matches the approved SHA-256; job 0 is Open with 0.01 unpaid escrow. Stopped after an order-sensitive JSON verification guard; exact approved arguments and finalized state reconciled read-only, no resubmission. Steps 7–23 remain unexecuted; settlement/refund and rejection tests remain outstanding. Fees 0.0300324813000376 testnet NEAR; conservative allocated budget 6.0300324813000376 / 7 NEAR. See docs/TESTNET_EXECUTION_REPORT.md for hashes, current balances and deadline risk. Phase 2 remains incomplete; no Phase 3.
