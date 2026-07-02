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
    ctx.register_command(
        "vault",
        _handle_vault_command,
        description="Bookmark one or more GitHub repositories in oss-vault",
        args_hint="<github-url> [github-url...]",
    )


def _handle_vault_command(raw_args: str) -> str:
    repo_urls = _extract_repo_urls(raw_args)
    if not repo_urls:
        return "Usage: /vault https://github.com/owner/repo [more repo URLs...]"

    result = _dispatch_workflow(repo_urls)

    for repo_url in repo_urls:
        _log_result(None, repo_url, {**result, "event": "command:vault"})

    if result.get("ok"):
        return f"Queued {len(repo_urls)} repo(s) for oss-vault:\n" + "\n".join(
            f"- {repo_url}" for repo_url in repo_urls
        )

    detail = result.get("stderr") or result.get("error") or "unknown error"
    return f"Could not queue {len(repo_urls)} repo(s): {detail}"


def _handle_pre_gateway_dispatch(event: Any, **kwargs: Any) -> dict[str, str] | None:
    message = str(getattr(event, "text", "") or "")
    repo_urls = _extract_repo_urls(message)

    if not repo_urls or not BOOKMARK_RE.search(message):
        return None

    gateway = kwargs.get("gateway")
    source = getattr(event, "source", None)
    _schedule_dispatch(gateway, source, repo_urls)
    return {
        "action": "skip",
        "reason": "oss-vault-bookmark",
    }


def _schedule_dispatch(gateway: Any, source: Any, repo_urls: list[str]) -> None:
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        result = _dispatch_workflow(repo_urls)
        for repo_url in repo_urls:
            _log_result(source, repo_url, result)
        return

    loop.create_task(_dispatch_and_ack(gateway, source, repo_urls))


async def _dispatch_and_ack(gateway: Any, source: Any, repo_urls: list[str]) -> None:
    count = len(repo_urls)
    await _send(gateway, source, f"Bookmarking {count} repo(s) in oss-vault.")

    result = await asyncio.to_thread(_dispatch_workflow, repo_urls)

    for repo_url in repo_urls:
        _log_result(source, repo_url, result)

    if result.get("ok"):
        await _send(gateway, source, f"Queued {count} repo(s) for oss-vault.")
    else:
        detail = result.get("stderr") or result.get("error") or "unknown error"
        await _send(
            gateway,
            source,
            f"Could not queue {count} repo(s): {detail}",
        )


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


def _extract_repo_urls(message: str) -> list[str]:
    repo_urls = []
    seen = set()

    for match in REPO_URL_RE.finditer(message):
        url = match.group(0).rstrip("),.;")
        parts = url.split("/")
        if len(parts) < 5:
            continue

        owner = parts[3]
        repo = parts[4].removesuffix(".git")
        if not owner or not repo:
            continue

        repo_url = f"https://github.com/{owner}/{repo}"
        key = repo_url.lower()
        if key in seen:
            continue

        seen.add(key)
        repo_urls.append(repo_url)

    return repo_urls


def _dispatch_workflow(repo_urls: list[str]) -> dict[str, Any]:
    workflow_input = "\n".join(repo_urls)
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
        f"repo_url={workflow_input}",
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
        "event": result.get("event", "pre_gateway_dispatch"),
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
