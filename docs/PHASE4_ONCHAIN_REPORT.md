# Phase 4 controlled NEAR testnet execution

Execution status **completed**. 12 of 12 calls verified. Contract writbound-escrow-20261105.testnet. Job 0 cleanup was excluded.

Preflight used finalized block 276733522 (6EjYUdhPUP4cgSrvXdpuehb9owgamBugaUzqs3kcbzaP). The free archival RPC returned the approved deployed WASM, account balances, and matching access keys.

Directive 004-C resumed after the original HTTP 429 stop. Finalized block 276740097 confirmed the full one-hour window had elapsed. The revised order places job 1 settlement at call 5, then the challenged workflow at calls 6–12.
Verification used one free archival reader with seven-second spacing, bounded jittered retries, and Retry-After handling. The runner reused each verified receipt to update the local application journal.

The defective fixture intentionally omitted 002,Bob,Unassigned. Independent verification rejected those bytes. The positive attestation on B was a seeded demonstration.

The real Ollama run used qwen2.5:3b in 14038 ms. The independent verifier accepted SHA-256 41db277a79fb2579196eb99425c7e0de408665097e38c42c5d04459941704c2d.

| Step | Job | Method | Transaction hash and explorer | Verification | Job state | Fee (testnet NEAR) |
|---:|---|---|---|---|---|---:|
| 1 | A | create_job | [E9vZFyZKpww6HMgNyisr4jLn56ueCJJsCoKCNU2i1egS](https://testnet.nearblocks.io/txns/E9vZFyZKpww6HMgNyisr4jLn56ueCJJsCoKCNU2i1egS) | verified | Open | 0.000183359916091 |
| 2 | A | accept_job | [GevViVqqfNveUq9f1xoZbPxZHEiwBCu8r8cT51gvv1jN](https://testnet.nearblocks.io/txns/GevViVqqfNveUq9f1xoZbPxZHEiwBCu8r8cT51gvv1jN) | verified | Accepted | 0.0001849705463097 |
| 3 | A | submit_work | [GUTAACBD9KzYNicVZ5EdHNpF8nMgK2o1ec63bHgnxUko](https://testnet.nearblocks.io/txns/GUTAACBD9KzYNicVZ5EdHNpF8nMgK2o1ec63bHgnxUko) | verified | Submitted | 0.0001864844020439 |
| 4 | A | attest_verification | [8gytJVimymvcQea3SVDfKmyik1VjretTjXTKLZkGv4zH](https://testnet.nearblocks.io/txns/8gytJVimymvcQea3SVDfKmyik1VjretTjXTKLZkGv4zH) | verified | Verified | 0.0001877188118528 |
| 5 | A | settle_job | [5LsHwiapTRiAncof3WBbUxbw8J9vXRKkdp9WmJeusXf](https://testnet.nearblocks.io/txns/5LsHwiapTRiAncof3WBbUxbw8J9vXRKkdp9WmJeusXf) | verified | Paid | 0.0012264966713313 |
| 6 | B | create_job | [CLUhvU4TzpVarp3FuZjE9zAa33Q2sbgna3EezFZ8f1qF](https://testnet.nearblocks.io/txns/CLUhvU4TzpVarp3FuZjE9zAa33Q2sbgna3EezFZ8f1qF) | verified | Open | 0.000183587916091 |
| 7 | B | accept_job | [J2XpDiUT3xqSJAjc16ABhvot33PmmgHqGKUfyjwtG4pE](https://testnet.nearblocks.io/txns/J2XpDiUT3xqSJAjc16ABhvot33PmmgHqGKUfyjwtG4pE) | verified | Accepted | 0.0001849705463097 |
| 8 | B | submit_work | [J7KtdqB9X795yA15LtgkUzVep9oGvNmVashnKFw9voHw](https://testnet.nearblocks.io/txns/J7KtdqB9X795yA15LtgkUzVep9oGvNmVashnKFw9voHw) | verified | Submitted | 0.0001864844020439 |
| 9 | B | attest_verification | [D5HCSMrJXGDmmHKQ7G2StCRQMncFLfVsEjt2gEJ3Vedb](https://testnet.nearblocks.io/txns/D5HCSMrJXGDmmHKQ7G2StCRQMncFLfVsEjt2gEJ3Vedb) | verified | Verified | 0.0001877188118528 |
| 10 | B | open_challenge | [CaJ8YM8RQAU8V8nzyXZhS6hEbkP9VfogJCKf3Phun2Jc](https://testnet.nearblocks.io/txns/CaJ8YM8RQAU8V8nzyXZhS6hEbkP9VfogJCKf3Phun2Jc) | verified | Verified | 0.0001907060826034 |
| 11 | B | resolve_challenge | [Ch3CJnxcYYDFZdfi2rgGsHeUjzaS1X6YjCZNYniNxKoE](https://testnet.nearblocks.io/txns/Ch3CJnxcYYDFZdfi2rgGsHeUjzaS1X6YjCZNYniNxKoE) | verified | Refundable | 0.0001921691523732 |
| 12 | B | refund_job | [Dd3hyXRQFKWNobm1WSZNBDjkCD6PgS1kKJmqzwr9qnHL](https://testnet.nearblocks.io/txns/Dd3hyXRQFKWNobm1WSZNBDjkCD6PgS1kKJmqzwr9qnHL) | verified | Refunded | 0.0012346449234432 |

- **settle_job** transferred 0.01 testnet NEAR to 75b826f8ba2f37eb9431805f7a19659f0ecd81e7458eeefd42663b9365a67f55. Transfer receipt DmscjRGYg69GzZAdaxG9wYrJ7M6746rg1TJSrMh1a194, callback receipt 5Z45rpfY6k9AxJeoAfDMcXBo9YedXKUGZtMziuGyc4px, job 1 in Paid with attempt 1.
- **refund_job** transferred 0.01 testnet NEAR to 7ac384032504d793e733f0210f5ee39518adb0db92dbc95ed9001b7af08cebf9. Transfer receipt 7EihgKiy1aJCWKfQa3uHYkeRzRXBpFeUREfoRhjtzj6X, callback receipt GWjNWtX1dPG44FZ2Po2S7o2ud27HTTHv77BiwYJSBn3L, job 2 in Refunded with attempt 1.

Finalized new job deposits total 0.34768 testnet NEAR.

Job A ID 1. Job B ID 2. Challenge ID 0.

Historical fees **0.0300324813000376 NEAR**. New recorded outcome fees **0.0043293121823459 NEAR**. Total recorded fees **0.0343617934823835 NEAR**. Allocation under the approved convention (4 NEAR funding and 2 NEAR storage allowance) is **6.0343617934823835 of 7 NEAR**. Job deposits draw from existing customer funds.

Finalized A challenge deadline 2026-11-08T06:36:54.060Z.

Calls 5–12 recorded **0.0035867785060485 testnet NEAR** in fees.

Finalized balance snapshot at block **276741296**. Amounts include storage backing.

| Role | Testnet NEAR |
|---|---:|
| challenger | 0.9998092939173966 |
| contract | 6.4716699666160534 |
| customer | 0.4854694626569525 |
| verifier | 0.9994323932239212 |
| worker | 1.0092570901032928 |

Accounting in yoctoNEAR: {"unpaid_escrow":"10000000000000000000000","pending_transfers":"0","storage_reserves":"491520000000000000000000","total_paid":"10000000000000000000000","total_refunded":"10000000000000000000000"}. Job 0 remained Open.

Local signing incident: Online CLI sign-only mode selected a different block hash. Offline sign-only mode validated the exact pinned block. No broadcast occurred before recovery.
