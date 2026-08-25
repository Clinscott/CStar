#!/usr/bin/env python3
"""Retired CStar Evolution Watch compatibility surface.

The former daily pipeline scanned source, queried Git and SQLite directly,
loaded provider credentials, called MiniMax, and wrote reports and timing state.
Those responsibilities now belong to bounded Researcher, CStar kernel, and
operator-authorized workflows.  Importing this module is deliberately inert.
"""

from dataclasses import dataclass, field


RETIRED_ERROR = "legacy_evolution_watch_retired_use_cstar_researcher_and_kernel_surfaces"


@dataclass(frozen=True)
class Candidate:
    """Pure historical result schema retained for artifact readers."""

    id: str
    approach: str
    rationale: str
    code_sketch: str
    scores: dict = field(default_factory=dict)
    winner: bool = False


@dataclass(frozen=True)
class ProbeFinding:
    """Pure historical finding schema retained for artifact readers."""

    id: str
    probe: str
    directory: str
    title: str
    severity: str
    component: str
    description: str
    file_path: str | None = None


@dataclass(frozen=True)
class Finding:
    """Pure historical source-finding schema retained for artifact readers."""

    id: str
    title: str
    severity: str
    component: str
    description: str
    impact: str
    proposed_work: str
    effort_hours: float | None = None
    research_queries: list = field(default_factory=list)
    research_results: list = field(default_factory=list)
    karpathy_candidates: list = field(default_factory=list)
    karpathy_winner: Candidate | None = None
    directory: str = ""
    requires_research: bool = False
    severity_reason: str = ""


def severity_badge(severity: str) -> str:
    """Preserve the pure display classifier for archived reports."""
    return {
        "P1": "[CRITICAL]",
        "P2": "[HIGH]",
        "P3": "[MEDIUM]",
        "P4": "[LOW]",
    }.get(severity, severity)


def inspect_cstar() -> list[Finding]:
    """Return no findings; the historical scanner no longer inspects source."""
    return []


def _retired(*args: object, **kwargs: object) -> None:
    raise RuntimeError(RETIRED_ERROR)


_init_timing_db = _retired
_log_skill_invocation = _retired
_update_baseline = _retired
_get_latency_report = _retired
log = _retired
_get_changed_files_since_last_run = _retired
_get_all_files_in_inclusion_dirs = _retired
probe_registry_drift = _retired
probe_import_boundaries = _retired
probe_cross_spoke_coupling = _retired
probe_runtime_bypass = _retired
probe_trace_compliance = _retired
_collect_health_metrics = _retired
run_proactive_probes = _retired
run_research = _retired
run_karpathy_loop = _retired
generate_report = _retired


def main() -> int:
    """Fail closed without scanning, provider use, DB access, or writes."""
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
