from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4


def skill_state_dir(name: str) -> Path:
    root = Path(os.environ.get("BUILDAGENT_SKILL_STATE_DIR", "/tmp/buildagent-skills"))
    root.mkdir(parents=True, exist_ok=True)
    path = root / name
    path.mkdir(parents=True, exist_ok=True)
    return path


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text())
    except Exception:
        return default


def save_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, indent=2, sort_keys=True))


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:12]}"
