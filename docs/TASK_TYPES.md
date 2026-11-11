# Local task types

Start the API, dashboard, and local Ollama as described in the [README](../README.md). In the dashboard, choose a demo on Overview or select a task type under Work Orders, upload its input, and supply its rules. Open Worker, run the job, download the artifact, and verify it. Under Challenges, check the bundled defective fixture against that demo work order. The local demo does not invoke escrow.

| Task | Input and specification | Deliberately defective artifact |
| --- | --- | --- |
| Data Cleaning (CSV) | [CSV](phase3-demo/input.csv) · [Specification](phase3-demo/task-spec.json) | [CSV missing a distinct row](phase3-demo/defective-fixture.csv) |
| JSON Transformation | [Records](task-demos/json_transform/input.json) · [Specification](task-demos/json_transform/spec.json) | [Unfilled team field](task-demos/json_transform/defective.json) |
| Data Quality Audit | [Records](task-demos/data_quality_audit/input.json) · [Specification](task-demos/data_quality_audit/spec.json) | [False clean report](task-demos/data_quality_audit/defective.json) |

The upload form computes the input hash. Paste the `rules` object from the JSON specification into the Rules field. The CSV form exposes its flags and fill rules separately. API clients can pass the full specification and base64 input to `POST /jobs`. Bundles are served by `GET /near/demo` for CSV and `GET /jobs/demo/<task_type>` for the JSON tasks.

## JSON Transformation semantics

Rules run in the fixed order `rename_fields`, `filter_records`, `normalize_strings`, `fill_missing`, `remove_fields`, then `select_fields`. Renames are simultaneous and reject collisions. A filter uses a single `field`, `operator` (`eq` or `ne`), and scalar `value`. Missing fields do not match either operator. Comparisons distinguish booleans, integers, floats, and strings. Normalizers are `trim`, `lower`, `upper`, and `trim_lower`. Fill applies to absent or null values. Selecting an absent field omits it.

## Data Quality Audit semantics

- `required_values` flags absent, null, and blank string values.
- `duplicate_identifiers` checks a single field. Nonblank string and integer identifiers are tracked separately. Findings reference the first row.
- `field_types` checks present values against `string`, `integer`, `number`, `boolean`, or `null`.
- `allowed_values` compares present values against explicit scalar choices.
- `numeric_ranges` uses inclusive bounds on numeric values. Combine it with required and type rules to flag absent or nonnumeric values.

The audit report contains one-based finding rows, check names, fields, and summary counts. A report can pass independent verification while the dataset fails its audit rules.

## Execution and verification boundaries

The JSON tasks accept UTF-8 arrays of up to 10,000 flat records with at most 100 named scalar fields per record. Inputs and artifacts are limited to 5 MiB, specifications to 16 KiB, and audits to 10,000 findings. JSON numbers use bounded safe integers or finite binary floating-point values. The canonical form sorts object keys, preserves array order, and uses compact JSON with a trailing newline. Verification accepts equivalent formatting and reports the SHA-256 of the exact candidate bytes.

Ollama receives only enabled-operation flags and a fixed response schema over loopback. The worker rejects plans that introduce operations, omit enabled ones, add arguments, or change the order. Upload contents and rule literals are never sent to the model. The executor applies the user's validated arguments using allowlisted tools. A separate reference path reconstructs the expected artifact from the original input and specification. It shares the published data conventions and comparison primitives.

The [historical NEAR testnet evidence](ONCHAIN_EVIDENCE.md) covers CSV work. The JSON workflows run locally. The historical challenge used a deliberately seeded positive attestation and a trusted offchain verifier.
