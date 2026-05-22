from __future__ import annotations

from datetime import datetime, timezone


def is_due(scheduled_at: datetime | None) -> bool:
    if scheduled_at is None:
        return True
    now = datetime.now(tz=timezone.utc)
    if scheduled_at.tzinfo is None:
        scheduled_at = scheduled_at.replace(tzinfo=timezone.utc)
    return scheduled_at <= now


def should_delay(scheduled_at: datetime | None) -> bool:
    return scheduled_at is not None and not is_due(scheduled_at)
