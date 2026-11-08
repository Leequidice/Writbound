"""Published CSV task format and shared byte conventions."""
import csv
import hashlib
import io
import json
import re

from . import MAX_BYTES

OPERATIONS = (
    "normalize_column_names", "trim_whitespace", "remove_empty_rows",
    "fill_missing", "remove_duplicates",
)
PLAN_SCHEMA = {
    "type": "object",
    "required": ["operations"],
    "additionalProperties": False,
    "properties": {
        "operations": {
            "type": "array", "minItems": 1, "maxItems": len(OPERATIONS),
            "uniqueItems": True, "items": {"type": "string", "enum": list(OPERATIONS)},
        },
    },
}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def json_bytes(value: dict) -> bytes:
    return (json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":")) + "\n").encode()


def normalize_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.strip().lower()).strip("_")


def validate_spec(spec: object) -> dict:
    flags = set(OPERATIONS) - {"fill_missing"}
    if not isinstance(spec, dict) or set(spec) != flags | {"schema_version", "input_sha256", "fill_missing"}:
        raise ValueError("Spec requires schema_version, input_sha256 and all five operation settings")
    if type(spec["schema_version"]) is not int or spec["schema_version"] != 1:
        raise ValueError("Unsupported specification version")
    if not isinstance(spec["input_sha256"], str) or not re.fullmatch(r"[0-9a-f]{64}", spec["input_sha256"]):
        raise ValueError("Expected lowercase input SHA-256")
    if any(type(spec[flag]) is not bool for flag in flags):
        raise ValueError("Operation flags must be booleans")
    fills = spec["fill_missing"]
    if not isinstance(fills, dict) or len(fills) > 100 or any(
        not name.strip() or len(name) > 128 or not isinstance(value, str)
        or not value.strip() or len(value) > 128 or any(ord(c) < 32 for c in name + value)
        for name, value in fills.items()
    ):
        raise ValueError("Fill rules require explicit nonblank string literals and column names")
    if not any(spec[op] for op in OPERATIONS):
        raise ValueError("Enable at least one cleaning operation")
    return spec


def validate_input(spec: dict, data: bytes, header: list[str], rows: list[list[str]]) -> None:
    if sha256(data) != spec["input_sha256"]:
        raise ValueError("Input SHA-256 does not match the spec")
    if not rows or any(len(name) > 128 or any(ord(c) < 32 for c in name) for name in header):
        raise ValueError("Input requires data rows and valid column names of at most 128 characters")
    target = [normalize_name(name) for name in header] if spec["normalize_column_names"] else header
    if "" in target or len(set(target)) != len(target):
        raise ValueError("Normalized column names are empty or collide")
    if set(spec["fill_missing"]) - set(target):
        raise ValueError("Fill rules name an unknown output column")


def canonical_csv(header, rows) -> bytes:
    buffer = io.StringIO(newline="")
    writer = csv.writer(buffer, lineterminator="\n", quoting=csv.QUOTE_ALL)
    writer.writerow(header)
    for row in rows:
        writer.writerow(row)
        if buffer.tell() > MAX_BYTES:
            raise ValueError("Canonical output exceeds 5 MiB")
    data = buffer.getvalue().encode("utf-8")
    if len(data) > MAX_BYTES:
        raise ValueError("Canonical output exceeds 5 MiB")
    return data
