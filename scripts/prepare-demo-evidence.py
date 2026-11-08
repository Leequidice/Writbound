"""Prepare real deterministic local fixtures; never sign or send transactions."""
import csv
import hashlib
import io
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "docs" / "demo"
ROOT.mkdir(parents=True, exist_ok=True)

def digest(data):
    return hashlib.sha256(data).hexdigest()

def write_json(name, value):
    data = (json.dumps(value, indent=2, sort_keys=True) + "\n").encode()
    (ROOT / name).write_bytes(data)
    return digest(data)

def rows(data):
    parsed = list(csv.reader(io.StringIO(data.decode(), newline=""), strict=True))
    return parsed[0], parsed[1:]

source = b"id,name\n001,Alice\n001,Alice\n002,Bob\n003,Chidi\n"
good = b"id,name\n001,Alice\n002,Bob\n003,Chidi\n"
bad = b"id,name\n001,Alice\n003,Chidi\n"
for name, data in [("input.csv", source), ("happy-output.csv", good), ("defective-output.csv", bad)]:
    (ROOT / name).write_bytes(data)
header, original = rows(source)
expected = list(dict.fromkeys(tuple(row) for row in original))
spec = {"schema_version":1,"task":"Remove exact duplicate rows, keep first occurrence and every distinct input row in order; preserve string values and header.","input_sha256":digest(source),"checks":["header_matches_input","no_exact_duplicate_output_rows","all_distinct_input_rows_retained_in_order"],"suite_version":"writbound-demo-csv-v1"}
spec_hash = write_json("task-spec.json", spec)
reports = {}
for name, data in [("happy",good),("defective",bad)]:
    output_header, output_rows = rows(data)
    values = [tuple(row) for row in output_rows]
    checks = {"header_matches_input":output_header==header,"no_exact_duplicate_output_rows":len(values)==len(set(values)),"all_distinct_input_rows_retained_in_order":values==expected}
    report = {"schema_version":1,"scope":"Local fixture checks only; no chain job ID assigned, no transaction executed.","specification_hash":spec_hash,"artifact_hash":digest(data),"checks":checks,"passed":all(checks.values()),"baseline_only_passed":checks["header_matches_input"] and checks["no_exact_duplicate_output_rows"],"suite_version":spec["suite_version"],"reproduce":"python scripts/prepare-demo-evidence.py"}
    reports[name] = {"report_sha256":write_json(f"{name}-checks.json",report),"artifact_sha256":digest(data),"passed":report["passed"],"baseline_only_passed":report["baseline_only_passed"]}
assert reports["happy"]["passed"]
assert not reports["defective"]["passed"] and reports["defective"]["baseline_only_passed"]
manifest = {"specification_hash":spec_hash,"reports":reports,"challenge_demonstration":"Requires explicitly approved seeded verifier false-positive for the defective fixture. Full checks fail; never describe that attestation as genuine successful verification.","onchain_execution":False}
write_json("manifest.json",manifest)
print(json.dumps(manifest,indent=2))
