# Release audit · November 8, 2026

The source snapshot is ready for publication review. The project directory has no Git metadata or configured remote. An isolated local Git snapshot and clone reproduced the Windows install, build and demo. Publication, video recording and submission remain separate.

## Repository and credential review

- Gitleaks 8.30.1 reported zero findings in the authored release snapshot and its isolated Git history. A NEAR-specific pattern scan found 12 labelled public Ed25519 signatures and zero credential-like literals or unlabelled long Ed25519 values in the original 165-file snapshot. There is no earlier Git history in this workspace to scan.
- The clone contained the public evidence and demo fixtures. Ignore rules excluded local databases, runtime journals, Python/Node dependencies, build outputs, environment overrides, key material, Ollama models and portable tool downloads. The clone used the default configuration without an `.env` file or signing keys.
- Removed two redundant downloaded archives and generated Python bytecode caches. Retained installed runtimes, the local Ollama model, the original execution journals, recorded evidence and fixture bytes.
- The two historical execution scripts block their five broadcast entry points. The application can still prepare an unsigned intent. Install, build, test, smoke and recording commands do not invoke signing or broadcast.

## Windows validation

Node.js 24.8.0, npm 11.6.0, Python 3.13.7, Ollama 0.40.15 and the existing native MSVC/Rust toolchain. The clean clone reused the already available local `qwen2.5:3b` model. The Rust tests ran in the original workspace using the installed toolchain and target cache.

| Check | Observed result |
|---|---|
| `npm ci`, Python venv, pinned requirements, editable worker install | Passed in isolated clone |
| `npm run build` | Frontend and backend passed |
| `npm test` | 5 API tests passed |
| `node --test apps/web/test/workflow.test.ts` | 2 dashboard tests passed |
| Python unittest with `WRITBOUND_TEST_LIVE=1` | 15 passed, including real inference |
| `cargo test --locked --manifest-path contracts/writbound-escrow/Cargo.toml` | 48 passed |
| `npm run test:smoke` | API and frontend HTTP 200 |
| `node scripts/demo-phase3.mjs data/release-artifact-rehearsal` | Local run in 4,146 ms. Clean artifact passed and defective fixture failed. |
| `node scripts/smoke-phase4.mjs` | Local run in 5,269 ms. Downloaded bytes matched the approved artifact hash. The defective fixture produced the expected missing row. |
| Finalized testnet reads through the dashboard proxy | Job 1 Paid at block 276742718. Job 2 Refunded at block 276742724. Both existing transfer and callback references were present. |
| Historical broadcast entry checks | All 5 returned a release-freeze error before execution |

The cleaned artifact SHA-256 remained `41db277a79fb2579196eb99425c7e0de408665097e38c42c5d04459941704c2d`. The rehearsal verified published chain state without making onchain writes. The deployed contract and published evidence were preserved. [Public receipts and reproduction](ONCHAIN_EVIDENCE.md)

## Handoff

Record the 3:40 demo using the [recording checklist](DEMO_SCRIPT.md). Then authorize publication of the reviewed source, fill the repository and video links in [SUBMISSION.md](../SUBMISSION.md), and verify that both links open for an unauthenticated reviewer before submission. Original history remains unavailable for review. The designated verifier trust assumption and the use of testnet are disclosed in the submission.
