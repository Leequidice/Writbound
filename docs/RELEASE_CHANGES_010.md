# Changes from the approved public release

Baseline commit is `31b19ebf9172420454e03d2b630bf67ce0cf9e1d`. The release branch is `release/three-task-freeze`.

28 files changed, with 17 additions and 11 modifications. No files are deleted. The contract, lockfiles, and all original testnet evidence retain the approved baseline content.

The CSV API and persisted jobs remain compatible. The dashboard now opens on Overview and uses revised labels. New JSON tasks are local and cannot prepare CSV escrow intents. No runtime dependencies were added.

| Status | File | Purpose |
| --- | --- | --- |
| M | .gitattributes | Preserve JSON demo fixture bytes across checkouts. |
| A | apps/web/src/demo.ts | Define task descriptions, workflow copy, and finalized-outcome evidence checks. |
| M | apps/web/src/main.tsx | Add Overview and task-specific work-order, worker, challenge, and Treasury presentation. |
| M | apps/web/src/style.css | Improve typography, form inputs, navigation, and visual hierarchy. |
| A | apps/web/test/demo.test.ts | Cover historical outcome identity, RPC unavailability, and receipt prerequisites. |
| A | docs/RELEASE_CANDIDATE_010.md | Record installation, tests, audits, compatibility, and owner decisions. |
| A | docs/RELEASE_CHANGES_010.md | List every changed file against the approved public commit. |
| A | docs/TASK_TYPES.md | Document task semantics, bounded inputs, fixtures, and reproduction. |
| A | docs/task-demos/data_quality_audit/defective.json | Add a fixed JSON task input, structured specification, or intentionally defective artifact. |
| A | docs/task-demos/data_quality_audit/input.json | Add a fixed JSON task input, structured specification, or intentionally defective artifact. |
| A | docs/task-demos/data_quality_audit/spec.json | Add a fixed JSON task input, structured specification, or intentionally defective artifact. |
| A | docs/task-demos/json_transform/defective.json | Add a fixed JSON task input, structured specification, or intentionally defective artifact. |
| A | docs/task-demos/json_transform/input.json | Add a fixed JSON task input, structured specification, or intentionally defective artifact. |
| A | docs/task-demos/json_transform/spec.json | Add a fixed JSON task input, structured specification, or intentionally defective artifact. |
| A | docs/task-demos/verification-results.json | Retain actual local model plans, passing checks, and rejected defects. |
| M | README.md | Describe three tasks, Windows setup, shared verification, and historical escrow evidence. |
| A | scripts/smoke-tasks.mjs | Reproduce all three real local workflows with downloaded artifact hash checks. |
| M | services/api/src/near.ts | Keep unsigned NEAR intent preparation scoped to CSV work orders. |
| M | services/api/src/worker.ts | Reuse the job lifecycle for JSON task validation, fixtures, artifacts, and verification. |
| M | services/api/test/near.test.ts | Check that JSON tasks cannot enter CSV escrow intent preparation. |
| M | services/worker/src/writbound_worker/__init__.py | Support an explicit fixed workspace extension while preserving the CSV default. |
| M | services/worker/src/writbound_worker/__main__.py | Dispatch structured task types through the bounded worker command interface. |
| A | services/worker/src/writbound_worker/audit.py | Implement five audit checks and a separate row-wise reference path. |
| A | services/worker/src/writbound_worker/json_tasks.py | Validate flat JSON, canonicalize bounded output, and report first differences. |
| M | services/worker/src/writbound_worker/ollama.py | Reuse loopback planning with task schemas and strict plan validation. |
| A | services/worker/src/writbound_worker/transform.py | Execute allowlisted transformations and independently reconstruct expected records. |
| A | services/worker/tests/test_json_tasks.py | Cover task semantics, defects, malicious rules, invalid plans, bounds, and typed comparisons. |
| M | SUBMISSION.md | Update submission answers, disclosures, X caption, and 130-second outline. |

The retained public baseline and isolated local release checkout remain available. Build products, databases, dependencies, models, and private configuration are excluded from the commit.
