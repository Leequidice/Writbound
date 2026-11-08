# Writbound onchain evidence

The deployed NEAR testnet contract is [`writbound-escrow-20261105.testnet`](https://testnet.nearblocks.io/address/writbound-escrow-20261105.testnet). Its approved WASM SHA-256 is `b0e079d44375cda2baf0f242f5aa405d2c0cf158782b4817b9b0ce2284e30019`. [Deployment transaction](https://testnet.nearblocks.io/txns/4aUfJ4ATEnqi4UMZi7H3r1CBV1WRu8Xhv73FeRgjYemY)

## Job 1 paid the worker

Job 1 progressed from Open to Accepted, Submitted, Verified and Paid. The real local `qwen2.5:3b` inference took 14,038 ms. The independent verifier accepted the cleaned CSV with SHA-256 `41db277a79fb2579196eb99425c7e0de408665097e38c42c5d04459941704c2d`. The full challenge window ended on November 8, 2026 at 06:36:54.060 UTC. The settlement finalized after that deadline.

| Action | Finalized transaction |
|---|---|
| Create | [E9vZFyZKpww6HMgNyisr4jLn56ueCJJsCoKCNU2i1egS](https://testnet.nearblocks.io/txns/E9vZFyZKpww6HMgNyisr4jLn56ueCJJsCoKCNU2i1egS) |
| Accept | [GevViVqqfNveUq9f1xoZbPxZHEiwBCu8r8cT51gvv1jN](https://testnet.nearblocks.io/txns/GevViVqqfNveUq9f1xoZbPxZHEiwBCu8r8cT51gvv1jN) |
| Submit artifact hash | [GUTAACBD9KzYNicVZ5EdHNpF8nMgK2o1ec63bHgnxUko](https://testnet.nearblocks.io/txns/GUTAACBD9KzYNicVZ5EdHNpF8nMgK2o1ec63bHgnxUko) |
| Attest | [8gytJVimymvcQea3SVDfKmyik1VjretTjXTKLZkGv4zH](https://testnet.nearblocks.io/txns/8gytJVimymvcQea3SVDfKmyik1VjretTjXTKLZkGv4zH) |
| Settle | [5LsHwiapTRiAncof3WBbUxbw8J9vXRKkdp9WmJeusXf](https://testnet.nearblocks.io/txns/5LsHwiapTRiAncof3WBbUxbw8J9vXRKkdp9WmJeusXf) |

The worker received **0.01 testnet NEAR** in transfer receipt `DmscjRGYg69GzZAdaxG9wYrJ7M6746rg1TJSrMh1a194`. Callback `5Z45rpfY6k9AxJeoAfDMcXBo9YedXKUGZtMziuGyc4px` succeeded and recorded Paid on transfer attempt 1.

## Job 2 refunded the customer

Job 2 used an intentionally defective artifact with SHA-256 `132f5e6720257a9dbed84902cb8e0845adf4db2d9aa04f9799ba0f748b2a08da`. It omitted `002,Bob,Unassigned`. The verifier's onchain positive attestation was deliberately seeded. The separate deterministic verifier rejected the artifact and reproduced the missing-row evidence.

The [source failure report](phase3-demo/challenge-evidence.json) hashes to `9b587d3dd48c72feef7cb2e18b183ea035de4e2a201948299568a7fefeea0d5b`. The onchain challenge commits the hash of a separate envelope binding that report to job 2, the contract and artifact. The exact envelope and its hash are recorded in call 10 of the [machine-readable execution journal](phase4-onchain-results.json).

| Action | Finalized transaction |
|---|---|
| Create | [CLUhvU4TzpVarp3FuZjE9zAa33Q2sbgna3EezFZ8f1qF](https://testnet.nearblocks.io/txns/CLUhvU4TzpVarp3FuZjE9zAa33Q2sbgna3EezFZ8f1qF) |
| Accept | [J2XpDiUT3xqSJAjc16ABhvot33PmmgHqGKUfyjwtG4pE](https://testnet.nearblocks.io/txns/J2XpDiUT3xqSJAjc16ABhvot33PmmgHqGKUfyjwtG4pE) |
| Submit defective artifact | [J7KtdqB9X795yA15LtgkUzVep9oGvNmVashnKFw9voHw](https://testnet.nearblocks.io/txns/J7KtdqB9X795yA15LtgkUzVep9oGvNmVashnKFw9voHw) |
| Seed positive attestation | [D5HCSMrJXGDmmHKQ7G2StCRQMncFLfVsEjt2gEJ3Vedb](https://testnet.nearblocks.io/txns/D5HCSMrJXGDmmHKQ7G2StCRQMncFLfVsEjt2gEJ3Vedb) |
| Open challenge 0 | [CaJ8YM8RQAU8V8nzyXZhS6hEbkP9VfogJCKf3Phun2Jc](https://testnet.nearblocks.io/txns/CaJ8YM8RQAU8V8nzyXZhS6hEbkP9VfogJCKf3Phun2Jc) |
| Uphold without correction | [Ch3CJnxcYYDFZdfi2rgGsHeUjzaS1X6YjCZNYniNxKoE](https://testnet.nearblocks.io/txns/Ch3CJnxcYYDFZdfi2rgGsHeUjzaS1X6YjCZNYniNxKoE) |
| Refund | [Dd3hyXRQFKWNobm1WSZNBDjkCD6PgS1kKJmqzwr9qnHL](https://testnet.nearblocks.io/txns/Dd3hyXRQFKWNobm1WSZNBDjkCD6PgS1kKJmqzwr9qnHL) |

Challenge 0 progressed from Pending to Upheld, making job 2 Refundable. The customer received **0.01 testnet NEAR** in transfer receipt `7EihgKiy1aJCWKfQa3uHYkeRzRXBpFeUREfoRhjtzj6X`. Callback `GWjNWtX1dPG44FZ2Po2S7o2ud27HTTHv77BiwYJSBn3L` succeeded and recorded Refunded on transfer attempt 1. The final snapshot at block 276741296 showed zero pending transfers. [Execution report and balances](PHASE4_ONCHAIN_REPORT.md)

## Reproduce without a wallet

1. Follow the [Windows setup](../README.md#local-setup-on-windows), then run `node scripts/smoke-phase4.mjs` to execute the local worker, check both artifacts, verify the downloaded bytes, and read the two finalized jobs.
2. Open the transaction links above to inspect the original action, transfer, and callback receipts. In the local dashboard, **Treasury** reads jobs 1 and 2 and shows the published receipt IDs separately from local execution.
3. To reproduce the exact published pass and failure reports offline, follow the [byte-for-byte verifier commands](PHASE3_WORKER.md#recorded-run). The cleaned and defective CSVs are in [the demo bundle](phase3-demo/manifest.json).

The deterministic check and challenge evidence are produced offchain. NEAR enforces the authorized state transitions, deadlines, and transfers. The designated verifier remains trusted.
