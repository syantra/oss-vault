"""Hermes plugin for oss-vault bookmark dispatch."""

from __future__ import annotations

import json
import logging
import re
import asyncio
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger("plugins.oss-vault")

LOG_FILE = Path.home() / ".hermes" / "logs" / "oss-vault-hook.log"
REPO_URL_RE = re.compile(r"https?://(?:www\.)?github\.com/[^\s<>\"']+", re.IGNORECASE)
BOOKMARK_RE = re.compile(
    r"\b(bookmark|bookmakr|save|vault|archive|add\s+to\s+(?:oss[- ]?vault|vault)|oss[- ]?vault)\b",
    re.IGNORECASE,
)
REPO_OWNER = "syantra"
REPO_NAME = "oss-vault"
WORKFLOW = "add-repo.yml"
GH = "/opt/homebrew/bin/gh"


def register(ctx: Any) -> None:
    ctx.register_hook("pre_gateway_dispatch", _handle_pre_gateway_dispatch)


def _handle_pre_gateway_dispatch(event: Any, **kwargs: Any) -> dict[str, str] | None:
    message = str(getattr(event, "text", "") or "")
    repo_url = _extract_repo_url(message)

    if not repo_url or not BOOKMARK_RE.search(message):
        return None

    gateway = kwargs.get("gateway")
    source = getattr(event, "source", None)
    _schedule_dispatch(gateway, source, repo_url)
    return {
        "action": "skip",
        "reason": "oss-vault-bookmark",
    }


def _schedule_dispatch(gateway: Any, source: Any, repo_url: str) -> None:
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        result = _dispatch_workflow(repo_url)
        _log_result(source, repo_url, result)
        return

    loop.create_task(_dispatch_and_ack(gateway, source, repo_url))


async def _dispatch_and_ack(gateway: Any, source: Any, repo_url: str) -> None:
    await _send(gateway, source, f"Bookmarking {repo_url} in oss-vault.")
    result = await asyncio.to_thread(_dispatch_workflow, repo_url)
    _log_result(source, repo_url, result)

    if result.get("ok"):
        await _send(gateway, source, f"Bookmarked {repo_url} in oss-vault.")
    else:
        detail = result.get("stderr") or result.get("error") or "unknown error"
        await _send(gateway, source, f"Could not bookmark {repo_url}: {detail}")


async def _send(gateway: Any, source: Any, text: str) -> None:
    if gateway is None or source is None:
        return

    adapter = getattr(gateway, "adapters", {}).get(getattr(source, "platform", None))
    if adapter is None:
        return

    metadata = None
    metadata_fn = getattr(gateway, "_thread_metadata_for_source", None)
    if callable(metadata_fn):
        try:
            metadata = metadata_fn(source)
        except Exception:
            metadata = None

    try:
        await adapter.send(str(getattr(source, "chat_id", "")), text, metadata=metadata)
    except Exception:
        logger.debug("oss-vault acknowledgement send failed", exc_info=True)


def _extract_repo_url(message: str) -> str | None:
    match = REPO_URL_RE.search(message)
    if not match:
        return None

    url = match.group(0).rstrip("),.;")
    parts = url.split("/")
    if len(parts) < 5:
        return None

    owner = parts[3]
    repo = parts[4].removesuffix(".git")
    if not owner or not repo:
        return None

    return f"https://github.com/{owner}/{repo}"


def _dispatch_workflow(repo_url: str) -> dict[str, Any]:
    command = [
        GH,
        "workflow",
        "run",
        WORKFLOW,
        "--repo",
        f"{REPO_OWNER}/{REPO_NAME}",
        "--ref",
        "main",
        "-f",
        f"repo_url={repo_url}",
    ]

    try:
        completed = subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
            timeout=30,
        )
    except Exception as exc:
        logger.exception("Failed to dispatch oss-vault workflow")
        return {"ok": False, "error": str(exc)}

    return {
        "ok": completed.returncode == 0,
        "returncode": completed.returncode,
        "stdout": completed.stdout.strip(),
        "stderr": completed.stderr.strip(),
    }


def _log_result(source: Any, repo_url: str, result: dict[str, Any]) -> None:
    _log({
        "event": "pre_gateway_dispatch",
        "platform": getattr(getattr(source, "platform", None), "value", ""),
        "user_id": getattr(source, "user_id", None),
        "chat_id": getattr(source, "chat_id", None),
        "repo_url": repo_url,
        **result,
    })


def _log(entry: dict[str, Any]) -> None:
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        **entry,
    }
    with LOG_FILE.open("a", encoding="utf-8") as file:
        file.write(json.dumps(entry, sort_keys=True) + "\n")
