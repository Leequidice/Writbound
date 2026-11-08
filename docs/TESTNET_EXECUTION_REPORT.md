# Controlled testnet execution report — stopped after 6/23

The owner authorized resumption of steps 2–23. Transaction 1 was preserved and never repeated. Steps 2–6 were submitted once each and finalized successfully. No transaction failed onchain. Broadcasts stopped when the transaction-6 argument-comparison guard failed. Read-only reconciliation proved that the official CLI only reordered JSON keys: all actual values, method, gas, deposit, signer and receiver matched the approved plan. The comparison now uses structural equality. No transaction 7 or later was submitted; no automatic resume is enabled.

## Preconditions and network

Fresh Windows Credential Manager offchain signing checks passed for all five approved identities. Frozen plan SHA-256 remained 33266af8dab092cce7c4e5eea92d96cc539dd552dd8116a81895107902f11345. Approved WASM SHA-256 remained b0e079d44375cda2baf0f242f5aa405d2c0cf158782b4817b9b0ce2284e30019. The approved free archival endpoint returned testnet status, finalized block, protocol, gas, account/key and finalized transaction queries without authentication, subscription or payment. Reads are serialized at a minimum two-second interval with four total attempts and 4/8/16-second bounded backoff for transient read failures. There is no broadcast retry. Initial restricted-sandbox fetch failure was resolved by running the read-only checks with network permission.

## Finalized transactions

| Step | Hash / explorer | Result | Fee, testnet NEAR |
|---|---|---|---|
| 1 | [BaQ9x4MaQdatz4cv9KajgYLPrTtqbAQmUmMXBPkEj71H](https://testnet.nearblocks.io/txns/BaQ9x4MaQdatz4cv9KajgYLPrTtqbAQmUmMXBPkEj71H) | FINAL success | 0.0071149895375 |
| 2 | [8hjkjR2AHmU6DPWA9kiZiUXYHJpGng3RgbrzBgKz35BF](https://testnet.nearblocks.io/txns/8hjkjR2AHmU6DPWA9kiZiUXYHJpGng3RgbrzBgKz35BF) | FINAL success | 0.0071149895375 |
| 3 | [CQjY3w88sYgnmME7QwfxwDcjTRfhVQqwVc7QfmTQAiAZ](https://testnet.nearblocks.io/txns/CQjY3w88sYgnmME7QwfxwDcjTRfhVQqwVc7QfmTQAiAZ) | FINAL success | 0.0071149895375 |
| 4 | [5uHawfNNN49wWbXDQwTCh7wSikrsYNnYvb8s8eE77VEW](https://testnet.nearblocks.io/txns/5uHawfNNN49wWbXDQwTCh7wSikrsYNnYvb8s8eE77VEW) | FINAL success | 0.0071149895375 |
| 5 | [4aUfJ4ATEnqi4UMZi7H3r1CBV1WRu8Xhv73FeRgjYemY](https://testnet.nearblocks.io/txns/4aUfJ4ATEnqi4UMZi7H3r1CBV1WRu8Xhv73FeRgjYemY) | FINAL success | 0.0013900752339466 |
| 6 | [9Y9PLxdGEm64BXQ2FcoBMGbPYeuP326F1j2Py9EBM43W](https://testnet.nearblocks.io/txns/9Y9PLxdGEm64BXQ2FcoBMGbPYeuP326F1j2Py9EBM43W) | FINAL success | 0.000182447916091 |

Step 1 funds verifier; 2 customer; 3 worker; 4 challenger, exactly 1 NEAR each. Step 5 atomically deployed and initialized the approved contract and verifier. Downloaded deployed WASM bytes matched the approved SHA-256. NEAR code hash: CuTHP5d4SUnkkVjUGn3b8UzBXkS2i8KABabNDrpZhKS8. Step 6 created actual job ID 0, state Open, 0.01 escrow and 0.16384 storage reserve (0.17384 total customer deposit). Its work deadline is 1793864285767879777 ns (2026-11-05T07:38:05.767Z). No challenge window has begun.

## Actual balances and accounting

Finalized block 276300484, D1is2iaS7jdr7FZ58LgjaFFeDTiXAGbphUYwvHMK2xdN; timestamp 1793857159484789106 ns.

| Role | Testnet NEAR amount |
|---|---:|
| challenger | 1 |
| contract | 6.1439899666160534 |
| customer | 0.825977552083909 |
| verifier | 1 |
| worker | 1 |

These account amounts include storage backing. Contract storage usage is 168013 bytes, approximately 1.68013 NEAR at the verified byte cost. The contract holds unpaid escrow 0.01, storage reserves 0.16384, pending transfers 0, total paid 0 and total refunded 0. No escrow has been paid or refunded, once or twice.

Sum of outcome tokens_burnt: **0.0300324813000376 testnet NEAR**. Aggregate controlled balances: 9.9699675186999624; net reduction from initial 10: **0.0300324813000376 NEAR**. Difference 0 is consistent with contract execution gas rewards credited to the receiver. The conservative budget counts full outcome fees, without crediting rewards. Four role transfers + the entire 2-NEAR deployment storage allowance + fees = 6.0300324813000376 NEAR, below the original 7-NEAR cap; customer job deposit is already within its 1-NEAR allocation. No paid resources or mainnet transactions were used.

## Incomplete outcomes and next checkpoint

Happy-path settlement: not executed. Challenge/refund: not executed. Expected rejection tests 10,17,18,19,22,23: none executed. Seeded verifier false positive: demonstration fixture only, no attestation submitted. No evidence of lifecycle completion is claimed.

Execution remains stopped after a reconciled local verification-tooling incident. Seek owner direction before continuing at step 7; do not repeat steps 1–6. Recheck job 0's real work deadline before any resume; an expired deadline may make the unchanged remaining plan impossible and require revised approval. Preserve actual challenge-window deadlines once attestations occur. Phase 2 cannot yet be closed. Phase 3 was not started. Remaining security assumptions include immutable verifier trust, full-access upgrade-key custody, receipt/callback liveness and free-RPC availability.

Evidence: testnet-execution/state.json, resume-precheck.json, step-01-rpc.json through step-06-rpc.json and per-step after snapshots. Commands: cargo run --offline --locked --manifest-path scripts/signing-readiness/Cargo.toml -- --check-replacements (after scripts/enter-msvc.ps1); node scripts/execute-testnet-plan.mjs resume-precheck; step 2, step 3, step 4, step 5, step 6; reconcile-json-order (read-only). Private credentials remained in Windows Credential Manager and were never printed/exported.
