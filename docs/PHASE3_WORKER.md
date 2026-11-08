# Phase 3 local CSV worker

The local Express API accepts a versioned CSV job and starts one Python worker run on request. Ollama receives only operation settings and returns a schema-constrained plan. Python checks the plan against the published task, then applies the allowlisted operations. A separate reference implementation derives the expected bytes directly from the original input and task specification.

## Reproduce on Windows

Use Node 24.8 or newer, Python 3.11 or newer, and a local Ollama runtime. The demo defaults to `qwen2.5:3b`. Use the official runtime and download the model separately. [Ollama for Windows](https://docs.ollama.com/windows) · [Model card](https://ollama.com/library/qwen2.5:3b)

From the repository root, with the Ollama service running at `127.0.0.1:11434`:

```powershell
ollama pull qwen2.5:3b
npm ci
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r services/worker/requirements-lock.txt
.venv/Scripts/python.exe -m pip install -e services/worker --no-deps
npm run build
$env:WRITBOUND_PYTHON = (Resolve-Path .venv/Scripts/python.exe).Path
$env:DATABASE_PATH = Join-Path (Get-Location) 'data/phase3-demo.sqlite'
$env:WRITBOUND_WORKSPACE = Join-Path (Get-Location) 'data/phase3-worker'
node services/api/dist/server.js
```

In another terminal from the root:

```powershell
node scripts/demo-phase3.mjs data/phase3-demo
$env:WRITBOUND_TEST_LIVE = '1'
.venv/Scripts/python.exe -m unittest discover -s services/worker/tests
npm test
```

The demo sends five input rows, including a blank line, through all five operations. It downloads the three-row output, verifies it, and submits an **intentionally defective test artifact** with the distinct row `002,Bob,Unassigned` removed. The report identifies the first mismatching data row and includes the expected and actual row hashes. Repeated verification of that candidate returns identical evidence bytes for the same job. A new demo generates a new local job ID, so reports that include the ID have different hashes. Identical input, task and cleaned CSV retain the same hashes.

## Recorded run

On November 8, 2026, official portable Ollama **0.40.15** ran **qwen2.5:3b** on CPU with the integrated GPU unused. The installed model digest was `357c53fb659c5076de1d65ccb0b397446227b71a42be9d1603d46168015c9e4b`. The HTTP inference took **8,553 ms** and generated **37 tokens**. [Execution report](phase3-demo/execution.json)

| Evidence | SHA-256 |
|---|---|
| [Task spec](phase3-demo/task-spec.json) | `6112127c82bc59c4d16b730bc0aaa4138f2969a02320cfecf0712333e8772200` |
| [Input CSV](phase3-demo/input.csv) | `4586840fefb1f6b691cdc3753d9193701cdb2da8f56b6c0da58ff8915de4e99b` |
| [Cleaned CSV](phase3-demo/cleaned.csv) | `41db277a79fb2579196eb99425c7e0de408665097e38c42c5d04459941704c2d` |
| [Passing verification](phase3-demo/verification.json) | `580570d6c797f57704a30d1cc9e7c7dc8aa1b3bb86d2649b4cfcaaba6c6d1b8e` |
| [Defective fixture](phase3-demo/defective-fixture.csv) | `132f5e6720257a9dbed84902cb8e0845adf4db2d9aa04f9799ba0f748b2a08da` |
| [Challenge evidence](phase3-demo/challenge-evidence.json) | `9b587d3dd48c72feef7cb2e18b183ea035de4e2a201948299568a7fefeea0d5b` |

Run `node scripts/demo-phase3.mjs docs/phase3-demo` to refresh this recorded bundle after a real run. The command replaces the prior bundle, including its job-specific report hashes. [Recorded manifest](phase3-demo/manifest.json)

Reproduce the saved report bytes without inference or the API:

```powershell
@'
import json
from pathlib import Path
from writbound_worker.spec import json_bytes
from writbound_worker.verifier import verify
p = Path("docs/phase3-demo")
job_id = json.loads((p / "manifest.json").read_bytes())["job_id"]
spec = json.loads((p / "task-spec.json").read_bytes())
source = (p / "input.csv").read_bytes()
for artifact, report in [("cleaned.csv", "verification.json"), ("defective-fixture.csv", "challenge-evidence.json")]:
    result = verify(job_id, spec, source, (p / artifact).read_bytes())
    assert json_bytes(result) == (p / report).read_bytes()
    print(report, result["passed"])
'@ | .venv/Scripts/python.exe -
```

## Local API

| Method and path | Behavior |
|---|---|
| `POST /jobs` | Accepts `{spec, input_base64}`. Validates the input against the spec before recording a ready job. Returns the generated ID and hashes. |
| `POST /jobs/:id/run` | Runs local inference and execution with a bounded request. Returns the report, or HTTP 422 with structured errors. A repeat on a completed job returns the saved report. |
| `GET /jobs/:id` | Reads status, spec, hashes, execution report, verification result and challenge availability. |
| `GET /jobs/:id/artifact` | Downloads the cleaned CSV after checking its stored hash. |
| `POST /jobs/:id/verify` | Verifies the saved artifact, or accepts `{artifact_base64}` for a candidate. HTTP 200 means the check ran. The response's `passed` field is the outcome. |
| `GET /jobs/:id/challenge` | Returns the most recent failing verification report as exact evidence bytes. |

The API binds to loopback and rejects browser-origin worker requests. Use a same-machine CLI or a trusted local server integration. Each job gets a generated directory under `WRITBOUND_WORKSPACE` with fixed filenames. SQLite stores local job metadata and reports, including a migration for existing databases. Run a single API instance per workspace and database. Jobs are started explicitly and execute autonomously within that run. The worker has no persistent queue. A failed or interrupted run can be invoked again by the operator.

## Published transformation

The version 1 task spec contains `schema_version`, the lowercase SHA-256 of the original input bytes, four boolean operation settings and a `fill_missing` object mapping columns to explicit nonblank string literals. The verifier derives these steps in order:

1. `normalize_column_names` lowercases headers, converts each run outside ASCII letters and digits to an underscore, strips leading and trailing underscores, and rejects empty names and collisions.
2. `trim_whitespace` strips leading and trailing whitespace in cells.
3. `remove_empty_rows` removes rows whose cells are all empty at that stage. A blank input line is an empty row.
4. `fill_missing` replaces only empty cells with the exact configured literal. When normalization is enabled, the mapping names the normalized columns.
5. `remove_duplicates` retains the first occurrence of each exact row after the preceding transformations.

CSV values stay strings, including leading zeroes and literal `NA`. Input accepts UTF-8 with an optional BOM. Canonical output is UTF-8 without a BOM, with comma separators, every cell double-quoted, embedded quotes doubled, and LF after every record including the header. Hash exact bytes with SHA-256. JSON commitment bytes use sorted keys, compact separators, ASCII escapes and a trailing LF. The verifier independently transforms original rows and compares canonical bytes. Semantically equivalent but differently serialized CSV fails verification.

## Limits and integration boundary

- CSV files and output are capped at 5 MiB, 100,000 data rows and 100 columns. Specs are capped at 16 KiB. Column names and fill literals are bounded. Redirected job directories and symbolic-link artifacts are rejected.
- The model gets only operation flags. The application controls operation arguments, paths and execution. The worker opens only the fixed local Ollama endpoint and uses one inference attempt, a bounded context and output, and a subprocess deadline. The child receives only OS runtime environment variables. Local filesystem access by another process under the same Windows user is outside this isolation boundary.
- Reports and artifacts remain on the local machine. The API holds no signing credentials and issues no blockchain transactions.
- Phase 4 needs a fresh approval packet for the expired job's refund and two new testnet demos. Bind local spec/artifact/evidence hashes to the real contract and returned onchain job IDs, retain exact bytes, and execute with the existing role-separated signing boundary. Verify finalized outcomes, real challenge deadlines, transfers and callbacks before indexing chain state. The seeded challenge remains an explicit fixture.

## Implementation files

- Worker package `services/worker/src/writbound_worker` gained `__main__.py`, `ollama.py`, `spec.py` and `verifier.py`. The existing loader in `__init__.py` now shares the bounded parser.
- API routing lives in `services/api/src/worker.ts` with integration in `app.ts`, `server.ts` and `db.ts`.
- `services/worker/tests/test_phase3.py` covers worker, model and verification cases. `scripts/demo-phase3.mjs` runs the real HTTP acceptance flow and writes the evidence bundle in `docs/phase3-demo`. `.gitattributes` preserves exact evidence bytes.
- `README.md`, `PLAN.md` and `docs/VERIFICATION.md` record the current state and results.
