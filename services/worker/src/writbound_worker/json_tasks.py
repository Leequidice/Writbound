"""Bounded JSON input, artifact encoding, and specification-driven verification."""
from dataclasses import dataclass
import json
import math
import re
from typing import Callable

from . import MAX_BYTES
from .spec import json_bytes, sha256

MAX_RECORDS = 10_000
MAX_FIELDS = 100
MAX_STRING = 4096


def unique_fields(pairs):
    result = dict(pairs)
    if len(result) != len(pairs):
        raise ValueError("JSON contains duplicate object keys")
    return result


def reject_constant(_):
    raise ValueError("JSON numbers must be finite")


def parse_json(raw: bytes):
    try:
        return json.loads(raw.decode("utf-8"), object_pairs_hook=unique_fields, parse_constant=reject_constant)
    except (UnicodeError, RecursionError, json.JSONDecodeError) as exc:
        raise ValueError("Expected well-formed UTF-8 JSON") from exc


def valid_text(value, limit):
    return isinstance(value, str) and len(value) <= limit and not any(0xD800 <= ord(c) <= 0xDFFF for c in value)


def field_name(value):
    return valid_text(value, 128) and bool(value.strip()) and all(ord(c) >= 32 for c in value)


def scalar(value):
    return (value is None or type(value) is bool or valid_text(value, MAX_STRING)
            or type(value) is int and abs(value) <= 2**53 - 1
            or type(value) is float and math.isfinite(value))


def records_from(source: bytes):
    records = parse_json(source)
    if not isinstance(records, list) or not 1 <= len(records) <= MAX_RECORDS:
        raise ValueError("Input requires 1–10000 JSON records")
    if any(not isinstance(row, dict) or len(row) > MAX_FIELDS or
           any(not field_name(key) or not scalar(value) for key, value in row.items()) for row in records):
        raise ValueError("Each record must be a flat object with at most 100 named scalar fields")
    return records


def field_list(value):
    return (isinstance(value, list) and 0 < len(value) <= MAX_FIELDS
            and all(field_name(key) for key in value) and len(set(value)) == len(value))


def field_map(value, valid):
    return (isinstance(value, dict) and 0 < len(value) <= MAX_FIELDS
            and all(field_name(key) and valid(item) for key, item in value.items()))


def canonical_json(value):
    encoder = json.JSONEncoder(ensure_ascii=True, sort_keys=True, separators=(",", ":"), allow_nan=False)
    result = bytearray()
    try:
        for part in encoder.iterencode(value):
            if len(result) + len(part) >= MAX_BYTES:
                raise ValueError("Canonical JSON exceeds 5 MiB")
            result.extend(part.encode("ascii"))
    except RecursionError as exc:
        raise ValueError("JSON nesting exceeds the processing limit") from exc
    result.append(10)
    return bytes(result)


@dataclass(frozen=True)
class JsonTask:
    operations: tuple[str, ...]
    validate_rules: Callable
    execute: Callable
    reproduce: Callable

    def validate(self, spec, source):
        if set(spec) != {"task_type", "schema_version", "input_sha256", "rules"}:
            raise ValueError("Expected task_type, schema_version, input_sha256 and rules")
        if type(spec["schema_version"]) is not int or spec["schema_version"] != 1:
            raise ValueError("Unsupported specification version")
        if spec["input_sha256"] != sha256(source):
            raise ValueError("Input SHA-256 does not match the spec")
        rules = spec["rules"]
        if not isinstance(rules, dict) or not rules or set(rules) - set(self.operations):
            raise ValueError("Rules must contain at least one supported operation")
        self.validate_rules(rules)
        return records_from(source)

    def verify(self, job_id, spec, records, artifact):
        expected, _ = self.reproduce(records, spec["rules"])
        expected_bytes = canonical_json(expected)
        try:
            candidate = parse_json(artifact)
            passed = canonical_json(candidate) == expected_bytes
            mismatch = None if passed else first_difference(expected, candidate)
        except ValueError:
            passed = False
            mismatch = {"kind": "malformed_artifact"}
        return {
            "job_id": job_id, "task_type": spec["task_type"], "passed": passed,
            "artifact_sha256": sha256(artifact), "expected_sha256": sha256(expected_bytes),
            "specification_sha256": sha256(json_bytes(spec)), "mismatch": mismatch,
        }


def first_difference(expected, actual, path="$"):
    """Find one difference with bounded evidence rather than echoing uploaded data."""
    if type(expected) is type(actual):
        if isinstance(expected, dict):
            for key in sorted(expected.keys() | actual.keys()):
                child = path + "[" + json.dumps(key[:128], ensure_ascii=True) + "]"
                if key not in actual or key not in expected:
                    return difference(child, expected.get(key), actual.get(key), key in expected, key in actual)
                mismatch = first_difference(expected[key], actual[key], child)
                if mismatch:
                    return mismatch
            return None
        if isinstance(expected, list):
            for index, (left, right) in enumerate(zip(expected, actual)):
                mismatch = first_difference(left, right, f"{path}[{index}]")
                if mismatch:
                    return mismatch
            index = min(len(expected), len(actual))
            if len(expected) == len(actual):
                return None
            has_expected, has_actual = index < len(expected), index < len(actual)
            return difference(f"{path}[{index}]", expected[index] if has_expected else None,
                              actual[index] if has_actual else None, has_expected, has_actual)
        if json_bytes(expected) == json_bytes(actual):
            return None
    return difference(path, expected, actual)


def difference(path, expected, actual, has_expected=True, has_actual=True):
    def preview(value, present):
        if not present:
            return "(missing)"
        if isinstance(value, (list, dict)):
            return f"{'array' if isinstance(value, list) else 'object'} with {len(value)} entries"
        return json_bytes(value).decode().strip()[:180]

    return {"kind": "json_mismatch", "path": path, "expected_text": preview(expected, has_expected),
            "actual_text": preview(actual, has_actual)}
