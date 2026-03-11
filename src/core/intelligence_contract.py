from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from typing import Any, Literal

IntelligenceTransportMode = Literal["auto", "host_session", "synapse_db"]
IntelligenceResolvedTransportMode = Literal["host_session", "synapse_db"]
IntelligenceStatus = Literal["success", "error"]


@dataclass
class IntelligenceCaller:
    source: str
    persona: str | None = None
    sector_path: str | None = None
    workflow: str | None = None


@dataclass
class IntelligenceRequest:
    prompt: str
    system_prompt: str | None = None
    transport_mode: IntelligenceTransportMode = "auto"
    correlation_id: str = ""
    caller: IntelligenceCaller | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class IntelligenceTrace:
    correlation_id: str
    transport_mode: IntelligenceResolvedTransportMode
    cached: bool = False


@dataclass
class IntelligenceResponse:
    status: IntelligenceStatus
    trace: IntelligenceTrace
    raw_text: str | None = None
    parsed_data: Any = None
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "raw_text": self.raw_text,
            "parsed_data": self.parsed_data,
            "error": self.error,
            "trace": {
                "correlation_id": self.trace.correlation_id,
                "transport_mode": self.trace.transport_mode,
                "cached": self.trace.cached,
            },
        }


def normalize_intelligence_request(
    payload: IntelligenceRequest | dict[str, Any],
    default_source: str,
) -> IntelligenceRequest:
    if isinstance(payload, IntelligenceRequest):
        request = payload
    else:
        caller_payload = payload.get("caller") or {}
        caller = IntelligenceCaller(
            source=caller_payload.get("source", default_source),
            persona=caller_payload.get("persona"),
            sector_path=caller_payload.get("sector_path"),
            workflow=caller_payload.get("workflow"),
        )
        request = IntelligenceRequest(
            prompt=payload["prompt"],
            system_prompt=payload.get("system_prompt"),
            transport_mode=payload.get("transport_mode", "auto"),
            correlation_id=payload.get("correlation_id", ""),
            caller=caller,
            metadata=payload.get("metadata") or {},
        )

    if not request.correlation_id:
        request.correlation_id = str(uuid.uuid4())
    if request.caller is None:
        request.caller = IntelligenceCaller(source=default_source)
    if request.metadata is None:
        request.metadata = {}
    return request


def build_effective_prompt(request: IntelligenceRequest) -> str:
    if not request.system_prompt:
        return request.prompt
    return f"SYSTEM:\n{request.system_prompt}\n\nUSER:\n{request.prompt}"


def parse_structured_payload(raw_text: str) -> Any:
    text = raw_text.strip()
    if not text:
        return None

    try:
        return json.loads(text)
    except Exception:
        pass

    object_start = text.find("{")
    object_end = text.rfind("}")
    if object_start != -1 and object_end != -1 and object_end > object_start:
        try:
            return json.loads(text[object_start:object_end + 1])
        except Exception:
            pass

    array_start = text.find("[")
    array_end = text.rfind("]")
    if array_start != -1 and array_end != -1 and array_end > array_start:
        try:
            return json.loads(text[array_start:array_end + 1])
        except Exception:
            return None

    return None


def build_intelligence_success(
    request: IntelligenceRequest,
    raw_text: str,
    transport_mode: IntelligenceResolvedTransportMode,
    cached: bool = False,
) -> IntelligenceResponse:
    return IntelligenceResponse(
        status="success",
        raw_text=raw_text,
        parsed_data=parse_structured_payload(raw_text),
        trace=IntelligenceTrace(
            correlation_id=request.correlation_id,
            transport_mode=transport_mode,
            cached=cached,
        ),
    )


def build_intelligence_error(
    request: IntelligenceRequest,
    error: str,
    transport_mode: IntelligenceResolvedTransportMode,
) -> IntelligenceResponse:
    return IntelligenceResponse(
        status="error",
        error=error,
        trace=IntelligenceTrace(
            correlation_id=request.correlation_id,
            transport_mode=transport_mode,
            cached=False,
        ),
    )
