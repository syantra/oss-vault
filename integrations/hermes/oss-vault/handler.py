"""Send GitHub repository links from Hermes messages to oss-vault."""

from __future__ import annotations

import asyncio
import json
import logging
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger("hooks.oss-vault")

LOG_FILE = Path.home() / ".hermes" / "logs" / "oss-vault-hook.log"
REPO_URL_RE = re.compile(r"https?://(?:www\.)?github\.com/[^\s<>\"']+", re.IGNORECASE)
REPO_OWNER = "syantra"
REPO_NAME = "oss-vault"
WORKFLOW = "add-repo.yml"
GH = "/opt/homebrew/bin/gh"


async def handle(event_type: str, context: dict[str, Any]) -> None:
    if event_type != "agent:start":
        return

    message = str(context.get("message") or "")
    platform = str(context.get("platform") or "")
    repo_url = _extract_repo_url(message)

    if not repo_url:
        return

    result = await asyncio.to_thread(_dispatch_workflow, repo_url)
    _log({
        "event": event_type,
        "platform": platform,
        "user_id": context.get("user_id"),
        "session_id": context.get("session_id"),
        "repo_url": repo_url,
        **result,
    })


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


def _log(entry: dict[str, Any]) -> None:
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        **entry,
    }
    with LOG_FILE.open("a", encoding="utf-8") as file:
        file.write(json.dumps(entry, sort_keys=True) + "\n")
