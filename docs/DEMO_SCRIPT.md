# Writbound recording script · 3 minutes 40 seconds

## Before recording

- Start the API, dashboard and local Ollama. Pull `qwen2.5:3b` in advance and run `node scripts/smoke-phase4.mjs` once.
- Open the dashboard and two explorer tabs for the [job 1 payout](https://testnet.nearblocks.io/txns/5LsHwiapTRiAncof3WBbUxbw8J9vXRKkdp9WmJeusXf) and [job 2 refund](https://testnet.nearblocks.io/txns/Dd3hyXRQFKWNobm1WSZNBDjkCD6PgS1kKJmqzwr9qnHL).
- Open the [sample input](phase3-demo/input.csv) and [architecture diagram](../README.md#architecture). Turn off notifications and avoid showing any unrelated local or account data.
- Use the existing finalized jobs for both payment clips. Leave the unsigned intent and job 0 controls untouched.

| Time | On screen | Narration |
|---|---|---|
| 0:00–0:25 | Writbound title and original CSV | “An AI agent can return a file in seconds. The hard part is knowing whether the work meets the spec before paying for it. Writbound connects autonomous work, reproducible checks, and escrow.” |
| 0:25–0:55 | Jobs → Create job from published demo CSV | “The customer requests a CSV cleanup. This sample has duplicates, whitespace, a blank row, and a missing team. The API validates the task and commits to the exact input bytes.” |
| 0:55–1:35 | Worker → Run local worker → Verify saved artifact → Download cleaned CSV | “Ollama proposes a structured plan. The Python worker runs only approved operations. A separate verifier reconstructs the expected result from the original input and rules. Here the cleaned CSV passes, and its SHA-256 identifies the exact bytes.” |
| 1:35–2:00 | Treasury → Job 1 · Worker payout → explorer | “This is a previously finalized testnet job using the same artifact. After the full challenge window, the worker received 0.01 NEAR. The transfer and callback both finalized.” |
| 2:00–2:45 | Challenges → Check published defective fixture. Treasury → Job 2 → challenge and refund | “We intentionally removed a distinct row and seeded an incorrect positive attestation. The independent check identifies the missing Bob row. A separate challenger committed the evidence, the verifier upheld challenge zero, and the customer received a 0.01 NEAR refund.” |
| 2:45–3:20 | Architecture diagram and evidence links | “Ollama and the verifier run locally. NEAR enforces the escrow transitions and timing. The contract trusts the designated verifier for the verdict. Both outcomes have finalized receipts anyone can inspect.” |
| 3:20–3:40 | Closing title and repository page once published | “The next steps are portable evidence storage and stronger verifier accountability. Writbound starts with a measurable task and makes the path from output to payment inspectable.” |

If inference takes longer during capture, trim only the waiting section and label the edit. If the free RPC is temporarily unavailable, show the existing explorer receipts and the [published evidence](ONCHAIN_EVIDENCE.md). Verify the final video shows the actual pass, the labelled defective fixture, and both finalized payments.
