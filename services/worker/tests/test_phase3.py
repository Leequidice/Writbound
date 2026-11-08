import json
import os
import unittest
import urllib.error
from unittest.mock import MagicMock, patch

import pandas as pd

from writbound_worker import parse_csv
from writbound_worker.__main__ import execute
from writbound_worker.ollama import plan_job, validate_plan
from writbound_worker.spec import OPERATIONS, canonical_csv, json_bytes, sha256, validate_input, validate_spec
from writbound_worker.verifier import verify

SOURCE = b" User ID , Name ,Team\n001, Alice ,Red\n001,Alice,Red\n\n002, Bob ,\n003,Chidi, Blue \n"
EXPECTED = b'"user_id","name","team"\n"001","Alice","Red"\n"002","Bob","Unassigned"\n"003","Chidi","Blue"\n'
BAD = b'"user_id","name","team"\n"001","Alice","Red"\n"003","Chidi","Blue"\n'
SPEC = {
    "schema_version": 1, "input_sha256": sha256(SOURCE), "normalize_column_names": True,
    "trim_whitespace": True, "remove_empty_rows": True, "fill_missing": {"team": "Unassigned"},
    "remove_duplicates": True,
}


class Phase3Tests(unittest.TestCase):
    def test_all_operations_preserve_values_and_first_occurrence(self):
        header, rows = parse_csv(SOURCE)
        validate_input(validate_spec(SPEC), SOURCE, header, rows)
        frame = pd.DataFrame(rows, columns=header, dtype=str)
        output = execute(frame, list(OPERATIONS), SPEC)
        self.assertEqual(canonical_csv(output.columns, output.itertuples(index=False, name=None)), EXPECTED)
        self.assertEqual(len(frame), 5)

    def test_verifier_pass_and_stable_hash(self):
        first = verify("demo", SPEC, SOURCE, EXPECTED)
        second = verify("demo", dict(reversed(list(SPEC.items()))), SOURCE, EXPECTED)
        self.assertTrue(first["passed"])
        self.assertEqual(first["artifact_sha256"], sha256(EXPECTED))
        self.assertEqual(json_bytes(first), json_bytes(second))
        self.assertFalse(verify("demo", SPEC, SOURCE, EXPECTED.replace(b"\n", b"\r\n"))["passed"])

    def test_defective_fixture_reproducibly_identifies_missing_row(self):
        report = verify("demo", SPEC, SOURCE, BAD)
        self.assertFalse(report["passed"])
        self.assertEqual(report["mismatch"]["data_row"], 2)
        self.assertEqual(report["mismatch"]["expected"]["cells"], ["002", "Bob", "Unassigned"])
        self.assertEqual(json_bytes(report), json_bytes(verify("demo", SPEC, SOURCE, BAD)))

    def test_malformed_and_header_only_artifacts(self):
        self.assertEqual(verify("demo", SPEC, SOURCE, b'"unterminated')["mismatch"]["kind"], "malformed_artifact")
        source = b"item\n\" \"\n"
        spec = {**SPEC, "input_sha256": sha256(source), "fill_missing": {}}
        self.assertTrue(verify("demo", spec, source, b'"item"\n')["passed"])

    def test_rejects_unknown_fill_column_collision_and_changed_input(self):
        header, rows = parse_csv(SOURCE)
        with self.assertRaisesRegex(ValueError, "unknown output column"):
            validate_input({**SPEC, "fill_missing": {"other": "x"}}, SOURCE, header, rows)
        with self.assertRaisesRegex(ValueError, "collide"):
            validate_input(SPEC, SOURCE, ["A B", "A-B"], rows)
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            validate_input(SPEC, SOURCE + b"\n", header, rows)
        with self.assertRaises(ValueError):
            validate_spec({**SPEC, "fill_missing": {"team": 1}})

    def test_rejects_invalid_plan_and_unsupported_operations(self):
        for plan in [None, {"operations": ["shell"]}, {"operations": list(reversed(OPERATIONS))},
                     {"operations": list(OPERATIONS), "path": "../secret.csv"},
                     {"operations": [*OPERATIONS, "remove_duplicates"]}]:
            with self.subTest(plan=plan), self.assertRaises(ValueError):
                validate_plan(plan, SPEC)

    @patch("writbound_worker.ollama.urllib.request.build_opener")
    def test_malformed_model_response(self, build):
        response = MagicMock()
        response.read.return_value = json.dumps({
            "done": True, "model": "qwen2.5:3b", "message": {"content": "{not JSON"},
        }).encode()
        build.return_value.open.return_value.__enter__.return_value = response
        with self.assertRaisesRegex(ValueError, "Malformed Ollama"):
            plan_job(SPEC, "qwen2.5:3b")

    @patch("writbound_worker.ollama.urllib.request.build_opener")
    def test_unavailable_timeout_and_missing_model(self, build):
        for error in (urllib.error.URLError("offline"), TimeoutError()):
            build.return_value.open.side_effect = error
            with self.assertRaisesRegex(ValueError, "unavailable or timed out"):
                plan_job(SPEC, "qwen2.5:3b")
        build.return_value.open.side_effect = urllib.error.HTTPError(
            "http://127.0.0.1:11434/api/chat", 404, "model missing", {}, None,
        )
        with self.assertRaisesRegex(ValueError, "model unavailable"):
            plan_job(SPEC, "qwen2.5:3b")

    @unittest.skipUnless(os.getenv("WRITBOUND_TEST_LIVE") == "1", "requires real local Ollama")
    def test_live_local_inference(self):
        operations, inference = plan_job(SPEC, os.getenv("WRITBOUND_MODEL", "qwen2.5:3b"))
        self.assertEqual(operations, list(OPERATIONS))
        self.assertGreater(inference["generated_tokens"], 0)
