# Writbound — hackathon brief
## Overview
Autonomous work. Binding accountability. CSV-cleaning work is bound to reproducible evidence and contract-controlled NEAR escrow. Primary track: Agent Economy; secondary: Autonomous Business. Product-owner deadline: November 14, 2026, 23:59 UTC. Hackathon eligibility/schedule has not been independently verified.

## Implemented locally
React/TypeScript/Vite/Tailwind four-view empty-state dashboard; Express health/config/error handling; SQLite six-table offchain index; bounded pandas CSV loading and exact-row deduplication.

The Rust/near-sdk escrow engine now implements exact native-NEAR funding plus separate retained storage reserve; explicit workers; artifact commitments; designated verifier attestations; independent evidence challenges; one correction; finite verification/resolution/correction timeouts; fixed-beneficiary settlement/refunds; pending asynchronous transfers with success/failure callbacks and retryable claims; and paginated lifecycle/accounting queries. 48 mocked-runtime Rust tests, strict Clippy and optimized WASM/module/export checks pass.

## Deployment status
**Phase 2: deployment pending.** The user created the named contract account; one actual testnet activation/funding transfer to the replacement verifier is FINAL-success verified. Execution then stopped on RPC verification access errors. No contract deployment or E2E escrow lifecycle has run. Actual transaction evidence is in docs/TESTNET_EXECUTION_REPORT.md. A dedicated testnet deployment and successful plus challenged/refunded real lifecycles require user approval. See docs/TESTNET_DEPLOYMENT.md and docs/VERIFICATION.md. Public GitHub publication is still outstanding.

## Architecture and planned agent workflow
Implemented foundations: browser shell -> Express/SQLite workflow index; isolated Python/pandas processing; NEAR contract as financial authority. Planned later: local Ollama evaluates an explicit CSV task, selects strictly allowlisted tools, processes an input, hashes and submits the actual artifact, and sends reproducible reports to the designated verifier. Wallet signing stays outside model control. No paid services, arbitrary model shell access, mainnet, token or cross-chain integrations.

## Verification trust and limits
The contract enforces identity, timing, commitments, states and payouts; it does not independently inspect CSVs or decide arbitrary evidence. The immutable verifier is trusted to apply published deterministic checks. Verification absence and unresolved challenge expiry make customer refunds eligible. At most four distinct challengers per revision and one correction bound storage/delay but permit griefing. Storage reserves are retained, not earnings. Account upgrade keys and asynchronous receipt/callback liveness are explicit trust assumptions. SDK mocks are not sandbox or testnet execution. Optional native ABI generation is skipped via --no-abi.

No frontend/API/AI worker workflow integration, automated verifier runner, artifact hosting or treasury indexer is connected yet. No decentralized arbitration or trustlessness is claimed.

## Demo plan
Local: show actual tests, contract state queries and artifact verification without presenting simulated transactions as real. After deployment approval: use only free testnet tokens to demonstrate good work reaching Paid after a real challenge window, and a reproducible failure reaching Refunded following an upheld independent challenge. Preserve real transaction and receipt evidence. Connect the AI and UI only under later assignments.
