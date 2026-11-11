"""Deterministic rule checks and an independent row-wise audit reference."""
from collections import defaultdict

from .json_tasks import JsonTask, field_list, field_map, field_name, scalar
from .spec import json_bytes

OPERATIONS = ("required_values", "duplicate_identifiers", "field_types", "allowed_values", "numeric_ranges")
MAX_FINDINGS = 10_000
TYPES = {
    "string": lambda value: type(value) is str,
    "integer": lambda value: type(value) is int,
    "number": lambda value: type(value) in (int, float),
    "boolean": lambda value: type(value) is bool,
    "null": lambda value: value is None,
}


def numeric_range(rule):
    return (isinstance(rule, dict) and bool(rule) and set(rule) <= {"min", "max"}
            and all(TYPES["number"](value) and scalar(value) for value in rule.values())
            and ("min" not in rule or "max" not in rule or rule["min"] <= rule["max"]))


def validate_rules(rules):
    validators = {
        "required_values": field_list,
        "duplicate_identifiers": field_name,
        "field_types": lambda rule: field_map(rule, lambda name: isinstance(name, str) and name in TYPES),
        "allowed_values": lambda rule: field_map(rule, lambda values: isinstance(values, list)
                                                and 0 < len(values) <= 100 and all(scalar(item) for item in values)),
        "numeric_ranges": lambda rule: field_map(rule, numeric_range),
    }
    for name, rule in rules.items():
        if not validators[name](rule):
            raise ValueError(f"Invalid rule for {name}")


def missing(value):
    return value is None or isinstance(value, str) and not value.strip()


def identifier(value):
    return type(value) is int or isinstance(value, str) and bool(value.strip())


def outside(value, bounds):
    return TYPES["number"](value) and (value < bounds.get("min", float("-inf")) or value > bounds.get("max", float("inf")))


def findings_for(records, operation, rule):
    seen = {}
    if operation == "allowed_values":
        rule = {field: {json_bytes(value) for value in values} for field, values in rule.items()}
    for index, row in enumerate(records, 1):
        if operation == "required_values":
            for field in rule:
                if missing(row.get(field)):
                    yield (index, operation, field, None)
        elif operation == "duplicate_identifiers":
            value = row.get(rule)
            if identifier(value):
                first = seen.setdefault(value, index)
                if first != index:
                    yield (index, operation, rule, first)
        elif operation == "field_types":
            for field, name in rule.items():
                if field in row and not TYPES[name](row[field]):
                    yield (index, operation, field, None)
        elif operation == "allowed_values":
            for field, allowed in rule.items():
                if field in row and json_bytes(row[field]) not in allowed:
                    yield (index, operation, field, None)
        elif operation == "numeric_ranges":
            for field, bounds in rule.items():
                if outside(row.get(field), bounds):
                    yield (index, operation, field, None)
        else:
            raise ValueError("Unsupported audit operation")


def report(records, findings):
    results = []
    for row, check, field, first in findings:
        if len(results) >= MAX_FINDINGS:
            raise ValueError("Audit exceeds 10000 findings; use a smaller dataset or fewer rules")
        item = {"row": row, "check": check, "field": field}
        if first is not None:
            item["first_row"] = first
        results.append(item)
    results.sort(key=lambda item: (item["row"], item["check"], item["field"]))
    summary = {"records_audited": len(records), "finding_count": len(results), "rules_passed": not results}
    return {**summary, "findings": results}, summary


def execute(records, operations, rules):
    return report(records, (finding for operation in operations for finding in findings_for(records, operation, rules[operation])))


def reference_findings(records, rules):
    groups = defaultdict(list)
    identity = rules.get("duplicate_identifiers")
    if identity is not None:
        for index, row in enumerate(records, 1):
            if identifier(row.get(identity)):
                groups[row[identity]].append(index)
        for indexes in groups.values():
            for later in indexes[1:]:
                yield (later, "duplicate_identifiers", identity, indexes[0])

    required = set(rules.get("required_values", []))
    types = rules.get("field_types", {})
    allowed = {field: {json_bytes(value) for value in values} for field, values in rules.get("allowed_values", {}).items()}
    ranges = rules.get("numeric_ranges", {})
    for index, row in enumerate(records, 1):
        for field in required - row.keys():
            yield (index, "required_values", field, None)
        for field, value in row.items():
            if field in required and missing(value):
                yield (index, "required_values", field, None)
            if field in types and not TYPES[types[field]](value):
                yield (index, "field_types", field, None)
            if field in allowed and json_bytes(value) not in allowed[field]:
                yield (index, "allowed_values", field, None)
            if field in ranges and outside(value, ranges[field]):
                yield (index, "numeric_ranges", field, None)


def reproduce(records, rules):
    return report(records, reference_findings(records, rules))


TASK = JsonTask(OPERATIONS, validate_rules, execute, reproduce)
