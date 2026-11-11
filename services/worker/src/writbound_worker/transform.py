"""Allowlisted record transformation and a separate record-wise reference implementation."""
from .json_tasks import JsonTask, field_list, field_map, field_name, scalar
from .spec import json_bytes

OPERATIONS = ("rename_fields", "filter_records", "normalize_strings", "fill_missing", "remove_fields", "select_fields")
NORMALIZERS = {"trim": str.strip, "lower": str.lower, "upper": str.upper, "trim_lower": lambda text: text.strip().lower()}
MISSING = object()


def predicate_valid(value):
    return (isinstance(value, dict) and set(value) == {"field", "operator", "value"}
            and field_name(value["field"]) and value["operator"] in ("eq", "ne") and scalar(value["value"]))


def validate_rules(rules):
    validators = {
        "rename_fields": lambda value: field_map(value, field_name) and len(set(value.values())) == len(value),
        "filter_records": predicate_valid,
        "normalize_strings": lambda value: field_map(value, lambda mode: isinstance(mode, str) and mode in NORMALIZERS),
        "fill_missing": lambda value: field_map(value, scalar),
        "remove_fields": field_list,
        "select_fields": field_list,
    }
    for name, rule in rules.items():
        if not validators[name](rule):
            raise ValueError(f"Invalid rule for {name}")


def renamed(row, mapping):
    output = {mapping.get(key, key): value for key, value in row.items()}
    if len(output) != len(row):
        raise ValueError("Rename would overwrite an existing field")
    return output


def matches(row, predicate):
    value = row.get(predicate["field"], MISSING)
    if value is MISSING:
        return False
    equal = json_bytes(value) == json_bytes(predicate["value"])
    return equal if predicate["operator"] == "eq" else not equal


def execute(records, operations, rules):
    rows = [row.copy() for row in records]
    for operation in operations:
        rule = rules[operation]
        if operation == "rename_fields":
            rows = [renamed(row, rule) for row in rows]
        elif operation == "filter_records":
            rows = [row for row in rows if matches(row, rule)]
        elif operation == "normalize_strings":
            for row in rows:
                for key, mode in rule.items():
                    if isinstance(row.get(key), str):
                        row[key] = NORMALIZERS[mode](row[key])
        elif operation == "fill_missing":
            for row in rows:
                for key, value in rule.items():
                    if row.get(key) is None:
                        row[key] = value
        elif operation == "remove_fields":
            for row in rows:
                for key in rule:
                    row.pop(key, None)
        elif operation == "select_fields":
            rows = [{key: row[key] for key in rule if key in row} for row in rows]
        else:
            raise ValueError("Unsupported transformation operation")
    return rows, {"output_rows": len(rows)}


def reproduce(records, rules):
    expected = []
    names = rules.get("rename_fields", {})
    omitted = set(rules.get("remove_fields", []))
    selected = set(rules["select_fields"]) if "select_fields" in rules else None
    normalizers = rules.get("normalize_strings", {})
    defaults = rules.get("fill_missing", {})
    for original in records:
        row = renamed(original, names)
        if "filter_records" in rules and not matches(row, rules["filter_records"]):
            continue
        output = {}
        for key in row.keys() | defaults.keys():
            if key in omitted or (selected is not None and key not in selected):
                continue
            value = row.get(key)
            if isinstance(value, str) and key in normalizers:
                value = NORMALIZERS[normalizers[key]](value)
            output[key] = defaults.get(key) if value is None and key in defaults else value
        expected.append(output)
    return expected, {"output_rows": len(expected)}


TASK = JsonTask(OPERATIONS, validate_rules, execute, reproduce)
