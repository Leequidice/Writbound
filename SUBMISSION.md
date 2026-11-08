# Writbound

**Autonomous work. Binding accountability.**

## One-sentence pitch

Writbound pairs a local autonomous AI worker with reproducible checks and NEAR escrow so customers can pay for correct work or recover funds after an upheld challenge.

## Short description

Writbound turns a CSV-cleaning request into an inspectable workflow. Local Ollama plans the job, restricted Python tools produce the artifact, and an independent deterministic verifier checks the exact bytes. NEAR testnet records the result commitments and enforces the payout or refund.

## Full description

AI automation can produce a deliverable faster than a customer can audit it. Writbound gives each task a versioned specification, a reproducible check, and escrow that follows the result through settlement. The demonstration starts with a CSV and ends with one of two real onchain outcomes.

For correct work, the local model proposes a plan and the restricted worker executes it. The independent verifier derives the expected output directly from the original input and specification, and the contract records a trusted verifier's attestation. After the challenge window, the worker receives payment. In the second workflow, an intentionally defective CSV drops a distinct row. We deliberately seed a positive attestation to demonstrate the challenge path. A separate challenger commits reproducible evidence, the verifier upholds it, and the customer receives a refund.

## Problem addressed

Customers need a way to distinguish correct AI work from plausible output. Workers need predictable payment once the acceptance criteria are met. A reproducible task specification gives both parties evidence they can independently inspect when a result is disputed.

## Technical implementation

The React dashboard uses an Express and SQLite backend. Local Ollama `qwen2.5:3b` returns a schema-constrained plan. Python and pandas execute only allowed CSV operations. A separate deterministic reference implementation computes the expected canonical CSV and emits a hash-bound verification report, including the first mismatch on failure.

## NEAR integration

The Rust and near-sdk contract at `writbound-escrow-20261105.testnet` enforces escrow funding, signer permissions, attestation and challenge deadlines, and payout/refund callbacks. It stores artifact and evidence commitments. The app prepares unsigned intents, and external signing is separate from the local worker. The release demo reads existing finalized transactions.

## What makes it novel

Writbound connects autonomous execution to payment through a task-specific evidence trail. The model generates a plan, a separate deterministic verifier checks the deliverable, and NEAR binds the adjudicated result to the transfer. The same demo shows a correct payout and a controlled failure that leads to a refund.

## Working demonstration evidence

- Job 1 reached Paid after its full one-hour challenge window. [Finalized 0.01 NEAR worker payout](https://testnet.nearblocks.io/txns/5LsHwiapTRiAncof3WBbUxbw8J9vXRKkdp9WmJeusXf)
- Job 2 reached Refunded after challenge 0 was upheld without correction. [Finalized 0.01 NEAR customer refund](https://testnet.nearblocks.io/txns/Dd3hyXRQFKWNobm1WSZNBDjkCD6PgS1kKJmqzwr9qnHL)
- Both transfer callbacks finalized. [Receipt IDs, artifact hashes and reproduction](docs/ONCHAIN_EVIDENCE.md)

## Limitations

The verifier remains trusted for offchain verdicts and challenge adjudication. The application runs locally, and parties need access to committed artifacts and reports. The contract and demonstration use testnet. This is a hackathon prototype without a production security audit.

## Future roadmap

Make evidence portable across machines, improve verifier accountability, and expand to tasks with objective acceptance criteria. Production deployment would require a dedicated security review and operational hardening.

## Links

- Repository URL — `<PUBLIC_REPOSITORY_URL>`
- Demo video URL — `<DEMO_VIDEO_URL>`
