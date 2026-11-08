"""Bounded local inference. Model output is data, never executable code."""
import json
import re
import time
import urllib.error
import urllib.request

from .spec import OPERATIONS, PLAN_SCHEMA


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def validate_plan(plan: object, spec: dict) -> list[str]:
    if not isinstance(plan, dict) or set(plan) != {"operations"}:
        raise ValueError("Model plan must contain only an operations array")
    operations = plan["operations"]
    if not isinstance(operations, list) or any(
        not isinstance(op, str) or op not in OPERATIONS for op in operations
    ):
        raise ValueError("Model plan includes an unsupported operation")
    if operations != [op for op in OPERATIONS if spec[op]]:
        raise ValueError("Model plan does not match the enabled operations and published order")
    return operations


def plan_job(spec: dict, model: str) -> tuple[list[str], dict]:
    if not re.fullmatch(r"[A-Za-z0-9_.-]+:[A-Za-z0-9_.-]+", model) or len(model) > 80:
        raise ValueError("Use a local Ollama model name and tag")
    settings = {op: bool(spec[op]) for op in OPERATIONS}
    payload = {
        "model": model,
        "stream": False,
        "format": PLAN_SCHEMA,
        "options": {"temperature": 0, "num_ctx": 2048, "num_predict": 192},
        "messages": [
            {"role": "system", "content": (
                "Plan a CSV cleanup. Return a JSON object with operations only. "
                "Include every enabled operation once, omit disabled operations, and use this order: "
                + ", ".join(OPERATIONS)
            )},
            {"role": "user", "content": json.dumps(settings)},
        ],
    }
    request = urllib.request.Request(
        "http://127.0.0.1:11434/api/chat", data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    start = time.monotonic()
    try:
        with opener.open(request, timeout=120) as response:
            raw = response.read(32769)
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            raise ValueError("Ollama model unavailable; pull the configured local model") from exc
        raise ValueError(f"Local Ollama returned HTTP {exc.code}") from exc
    except (TimeoutError, urllib.error.URLError) as exc:
        raise ValueError("Local Ollama unavailable or timed out") from exc
    if len(raw) > 32768:
        raise ValueError("Ollama response exceeded the size limit")
    try:
        result = json.loads(raw)
        if result["done"] is not True or result["model"] != model or result.get("done_reason") == "length":
            raise ValueError("Ollama returned an incomplete or unexpected model response")
        plan = json.loads(result["message"]["content"])
    except (KeyError, TypeError, UnicodeError, json.JSONDecodeError) as exc:
        raise ValueError("Malformed Ollama response") from exc
    operations = validate_plan(plan, spec)
    return operations, {
        "model": result["model"],
        "wall_ms": round((time.monotonic() - start) * 1000),
        "ollama_duration_ns": result.get("total_duration"),
        "generated_tokens": result.get("eval_count"),
    }
