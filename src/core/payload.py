from dataclasses import dataclass, field
from types import MappingProxyType
from typing import Any


@dataclass(frozen=True)
class IntentPayload:
    """
    [O.D.I.N.] Immutable Payload Object for intent routing.
    Enforces strict structural rigidity across the Python Daemon boundaries.
    """
    system_meta: MappingProxyType[str, Any]
    intent_raw: str
    intent_normalized: str
    target_workflow: str
    extracted_entities: MappingProxyType[str, Any] = field(default_factory=lambda: MappingProxyType({}))

    def __post_init__(self):
        """[ALFRED] Converts standard dicts to MappingProxyType for true physical immutability."""
        if isinstance(self.system_meta, dict):
            object.__setattr__(self, 'system_meta', MappingProxyType(self.system_meta))
        if isinstance(self.extracted_entities, dict):
            object.__setattr__(self, 'extracted_entities', MappingProxyType(self.extracted_entities))

    def __repr__(self) -> str:
        """[ALFRED] Clean representation for Warden logging, avoiding raw memory addresses."""
        return (
            f"IntentPayload("
            f"workflow='{self.target_workflow}', "
            f"intent='{self.intent_normalized}', "
            f"entities={list(self.extracted_entities.keys())}"
            f")"
        )

    def to_dict(self) -> dict[str, Any]:
        """[ALFRED] Converts the immutable payload back to a standard dictionary."""
        return {
            "system_meta": dict(self.system_meta),
            "intent_raw": self.intent_raw,
            "intent_normalized": self.intent_normalized,
            "target_workflow": self.target_workflow,
            "extracted_entities": dict(self.extracted_entities)
        }
