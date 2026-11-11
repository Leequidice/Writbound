"""Fixed worker commands invoked by the local API."""
import argparse
import json
from pathlib import Path
import re
import sys

import pandas as pd

from . import MAX_BYTES, parse_csv, read_workspace_file, remove_duplicate_rows
from .audit import TASK as AUDIT
from .ollama import plan_job
from .json_tasks import canonical_json, parse_json
from .spec import canonical_csv, json_bytes, normalize_name, sha256, validate_input, validate_spec
from .transform import TASK as TRANSFORM
from .verifier import verify

JSON_TASKS = {"json_transform": TRANSFORM, "data_quality_audit": AUDIT}


def publish(workspace, artifact, extension):
    # Publish complete output only, using an exclusively created temporary file.
    with (workspace / "artifact.tmp").open("xb") as handle:
        handle.write(artifact)
    (workspace / "artifact.tmp").replace(workspace / ("artifact" + extension))


def run_json_task(args, spec, task, report):
    source = read_workspace_file(args.workspace, "input.json", MAX_BYTES, ".json")
    report.update(input_sha256=sha256(source), task_type=spec["task_type"])
    records = task.validate(spec, source)
    report["input_rows"] = len(records)
    if args.command == "validate":
        return {"specification_sha256": sha256(json_bytes(spec))}
    if args.command != "run":
        filename = "artifact.json" if args.command == "verify" else "candidate.json"
        artifact = read_workspace_file(args.workspace, filename, MAX_BYTES, ".json")
        return task.verify(args.job_id, spec, records, artifact)

    enabled = {op: op in spec["rules"] for op in task.operations}
    operations, inference = plan_job(enabled, args.model, task.operations, spec["task_type"])
    report.update(operations=operations, plan={"operations": operations}, inference=inference)
    output, metrics = task.execute(records, operations, spec["rules"])
    artifact = canonical_json(output)
    publish(args.workspace, artifact, ".json")
    report.update(status="succeeded", artifact_sha256=sha256(artifact), **metrics)
    return report


def execute(frame: pd.DataFrame, operations: list[str], spec: dict) -> pd.DataFrame:
    for operation in operations:
        if operation == "normalize_column_names":
            frame = frame.rename(columns=normalize_name)
        elif operation == "trim_whitespace":
            frame = frame.apply(lambda column: column.str.strip())
        elif operation == "remove_empty_rows":
            frame = frame.loc[frame.ne("").any(axis=1)]
        elif operation == "fill_missing":
            frame = frame.copy()
            for name, value in spec["fill_missing"].items():
                frame[name] = frame[name].mask(frame[name].eq(""), value)
        elif operation == "remove_duplicates":
            frame = remove_duplicate_rows(frame)
        else:
            raise ValueError("Unsupported operation")
    return frame


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["validate", "run", "verify", "verify-candidate"])
    parser.add_argument("workspace", type=Path)
    parser.add_argument("job_id")
    parser.add_argument("--model", default="qwen2.5:3b")
    args = parser.parse_args()
    report = {
        "job_id": args.job_id, "status": "failed", "operations": [], "input_sha256": None,
        "artifact_sha256": None, "input_rows": None, "output_rows": None, "errors": [],
    }
    try:
        if not re.fullmatch(r"[a-f0-9]{32}", args.job_id):
            raise ValueError("Invalid local job ID")
        raw = sys.stdin.buffer.read(16385)
        if len(raw) > 16384:
            raise ValueError("Specification exceeds 16 KiB")
        spec = parse_json(raw)
        if isinstance(spec, dict) and "task_type" in spec:
            task_type = spec["task_type"]
            if not isinstance(task_type, str) or task_type not in JSON_TASKS:
                raise ValueError("Unsupported task type")
            sys.stdout.buffer.write(json_bytes(run_json_task(args, spec, JSON_TASKS[task_type], report)))
            return 0
        spec = validate_spec(spec)
        source = read_workspace_file(args.workspace, "input.csv", MAX_BYTES)
        report["input_sha256"] = sha256(source)
        header, rows = parse_csv(source)
        report["input_rows"] = len(rows)
        validate_input(spec, source, header, rows)
        if args.command == "validate":
            result = {"specification_sha256": sha256(json_bytes(spec))}
        elif args.command == "run":
            operations, inference = plan_job(spec, args.model)
            report.update(operations=operations, inference=inference)
            frame = execute(pd.DataFrame(rows, columns=header, dtype=str), operations, spec)
            artifact = canonical_csv(list(frame.columns), frame.itertuples(index=False, name=None))
            publish(args.workspace, artifact, ".csv")
            report.update(status="succeeded", artifact_sha256=sha256(artifact), output_rows=len(frame))
            result = report
        else:
            filename = "artifact.csv" if args.command == "verify" else "candidate.csv"
            result = verify(args.job_id, spec, source, read_workspace_file(args.workspace, filename, MAX_BYTES))
        sys.stdout.buffer.write(json_bytes(result))
        return 0
    except (ValueError, OSError, TypeError) as exc:
        report["errors"].append(str(exc) if isinstance(exc, ValueError) else "Workspace or execution error")
        sys.stdout.buffer.write(json_bytes(report))
        return 1


if __name__ == "__main__":
    sys.exit(main())
