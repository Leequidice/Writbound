# Three-task release candidate

Validation completed November 11–12, 2026. Features are frozen. The comparison baseline is the approved public commit `31b19ebf9172420454e03d2b630bf67ce0cf9e1d`. The isolated release branch is `release/three-task-freeze`; its exact commit is supplied in the engineering handoff. [Complete change manifest](RELEASE_CHANGES_010.md)

## Executed validation

| Check | Actual result |
| --- | --- |
| Fresh Node dependency installation | `npm ci --no-audit --no-fund` installed 189 packages in the isolated checkout |
| Fresh Python environment | `py -3.13 -m venv .venv`, pinned requirements, and editable worker installation passed |
| Dependency consistency | `pip check` found no broken requirements |
| Python tests with real Ollama enabled | 23 passed, 0 skipped |
| API tests | 5 passed |
| Dashboard tests | 5 passed |
| Frontend and backend production builds | Both passed |
| Rust regression tests | 48 passed, 0 failed, 0 doctests; existing original-workspace build cache, with the MSVC environment loaded |
| HTTP smoke | API on port 3011 and frontend on port 5181 returned 200 |
| All three local demonstrations | Real Ollama plans, downloaded-byte integrity, independent verification, and defective-artifact rejection passed |
| Existing NEAR testnet outcomes | Read-only smoke confirmed Job 1 Paid at block 277281408 and Job 2 Refunded at block 277281415 |
| Broadcast entry guards | All five historical broadcast modes returned the release-freeze error before execution |
| npm advisory query | Zero known vulnerabilities reported across the locked dependency graph |
| Secret scans | Gitleaks 8.30.1 found no secrets in the source snapshot and available Git history; a targeted NEAR credential scan found no credential literals or unlabelled long Ed25519 values |

Node.js 24.8.0, npm 11.6.0 and Python 3.13.7 were used. The clean checkout reused the existing local Ollama service and `qwen2.5:3b` model. It installed its own Node dependencies and Python environment. The Python package resolved inside that checkout. No `.env`, signing credentials, private database, model file, or original worker installation was copied into it.

The first sandboxed npm install failed with an internal exit-handler error. A retry with registry access succeeded. No dependency versions or lockfiles were changed to obtain the passing result.

## Reproduction

Follow the Windows setup in the root README, then start the API and dashboard. From another terminal run the checks below.

```powershell
npm test
node --test apps/web/test/*.test.ts
$env:WRITBOUND_TEST_LIVE = '1'
.venv/Scripts/python.exe -m unittest discover -s services/worker/tests -v
npm run build
npm run test:smoke
node scripts/smoke-tasks.mjs
node scripts/smoke-phase4.mjs
. ./scripts/enter-msvc.ps1
cargo test --offline --locked --manifest-path contracts/writbound-escrow/Cargo.toml
```

The offline Rust command requires an existing Cargo dependency cache. On a new toolchain use `cargo test --locked` to fetch its locked dependencies. Install Rust and MSVC Build Tools as documented in the toolchain history before running contract tests.

The all-task script writes local artifacts and evidence under ignored `data/task-smoke/`. A retained real run includes the exact specifications, operations, model metadata, hashes, passing checks, and defect evidence. [Recorded three-task validation](task-demos/verification-results.json)

| Task | Downloaded artifact SHA-256 |
| --- | --- |
| CSV cleaning | `41db277a79fb2579196eb99425c7e0de408665097e38c42c5d04459941704c2d` |
| JSON transformation | `4b7875f03d6ab02d2e974d2bd988fc08f42db21e0d3258cff691744b7b3f719c` |
| Data quality audit | `da4ce5826dfe77832876b84192982100ba0e08e3f7b55e1f5632e8aa39145ad1` |

## Security and evidence preservation

The release contains public fixtures and intentionally retained execution evidence. Generated databases, temporary workspaces, dependency folders, model files, `.env` overrides, credentials, and compiler outputs remain excluded. Ignore checks covered representative paths for each category. The scan found 12 explicitly labelled public signatures in historical evidence. Pattern-based scans cannot establish the absence of every possible secret.

All 12 original workflow transaction hashes remain in the onchain evidence document and machine-readable journal. Those files retain the approved baseline bytes in the release snapshot. Contract source, Cargo manifests, and lockfiles have no changes against the baseline. The existing optimized WASM still hashes to `b0e079d44375cda2baf0f242f5aa405d2c0cf158782b4817b9b0ce2284e30019`. No contract deployment or onchain writes were performed for this release preparation.

The trusted offchain verifier and deliberately seeded historical positive attestation are disclosed. JSON tasks execute and verify locally. The historical CSV escrow outcomes are separate from fresh local work orders. The prototype has no production security audit.

## Compatibility and pending owner decisions

Existing CSV specifications and jobs remain compatible. The shared lifecycle adds JSON task types and optional response fields without a database migration. Task-specific downloads use JSON MIME types and filenames. The initial dashboard page and several button labels have changed, so UI automation tied to earlier labels needs updating. External unsigned intent preparation remains CSV-only.

GitHub publication is technically ready for explicit owner authorization. Hackathon submission still needs a license decision, a newly recorded three-task demo and public X permalink, owner contact and prize details, and approval of the exact submission. MIT is recommended for a permissive release, subject to the owner's choice and copyright-holder confirmation. A LICENSE file has not been added. [MIT license](https://opensource.org/license/mit) · [Organizer requirements](https://nearhackathon.com/HACKATHON.md)

The updated submission draft includes a 1,351-character main answer, a 253-character X caption, and a 130-second narration outline. Existing videos show the earlier CSV release. [Submission draft](../SUBMISSION.md)
