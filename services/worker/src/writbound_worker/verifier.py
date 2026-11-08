"""Independent reference transformation using rows and Python strings."""
from . import parse_csv
from .spec import canonical_csv, json_bytes, normalize_name, sha256, validate_input


def expected_output(spec: dict, source: bytes) -> bytes:
    header, rows = parse_csv(source)
    validate_input(spec, source, header, rows)
    if spec["normalize_column_names"]:
        header = [normalize_name(name) for name in header]
    if spec["trim_whitespace"]:
        rows = [[cell.strip() for cell in row] for row in rows]
    if spec["remove_empty_rows"]:
        rows = [row for row in rows if any(row)]
    if spec["fill_missing"]:
        fills = [spec["fill_missing"].get(name, "") for name in header]
        rows = [[cell if cell else fill for cell, fill in zip(row, fills)] for row in rows]
    if spec["remove_duplicates"]:
        rows = list(dict.fromkeys(map(tuple, rows)))
    return canonical_csv(header, rows)


def verify(job_id: str, spec: dict, source: bytes, artifact: bytes) -> dict:
    expected = expected_output(spec, source)
    report = {
        "suite": "writbound-csv-v1",
        "job_id": job_id,
        "specification_sha256": sha256(json_bytes(spec)),
        "input_sha256": sha256(source),
        "expected_sha256": sha256(expected),
        "artifact_sha256": sha256(artifact),
        "passed": artifact == expected,
        "mismatch": None,
    }
    if report["passed"]:
        return report
    try:
        actual_header, actual_rows = parse_csv(artifact)
    except ValueError as exc:
        report["mismatch"] = {"kind": "malformed_artifact", "reason": str(exc)}
        return report
    expected_header, expected_rows = parse_csv(expected)
    if actual_header != expected_header:
        report["mismatch"] = {
            "kind": "header_mismatch", "expected": row_evidence(expected_header),
            "actual": row_evidence(actual_header),
        }
    else:
        for index in range(max(len(expected_rows), len(actual_rows))):
            want = expected_rows[index] if index < len(expected_rows) else None
            got = actual_rows[index] if index < len(actual_rows) else None
            if want != got:
                report["mismatch"] = {
                    "kind": "row_mismatch", "data_row": index + 1,
                    "expected": row_evidence(want), "actual": row_evidence(got),
                    "expected_count": len(expected_rows), "actual_count": len(actual_rows),
                }
                break
        else:
            report["mismatch"] = {"kind": "noncanonical_serialization"}
    return report


def row_evidence(row: list[str] | None) -> dict | None:
    if row is None:
        return None
    data = json_bytes({"cells": row})
    return {"sha256": sha256(data), "cells": row if len(data) <= 2048 else None}
