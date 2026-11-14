from __future__ import annotations

from typing import Any, Literal
from agent.schemas import AgentEvent


def make_event(
    seq: int,
    step: Literal[
        "receive",
        "quality_check",
        "extract",
        "normalize",
        "validate",
        "decide",
        "save",
        "done",
        "error",
    ],
    status: Literal["running", "ok", "warn", "error"],
    message: str,
    data: dict[str, Any] | None = None,
) -> AgentEvent:
    return AgentEvent(
        seq=seq,
        step=step,
        status=status,
        message=message,
        data=data or {},
    )
