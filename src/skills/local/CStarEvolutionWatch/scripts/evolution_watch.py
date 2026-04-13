#!/usr/bin/env python3
"""
CStar Evolution Watch — Daily Intelligence Pipeline
===================================================
Inspects CStar, researches each finding, files wiki entries (Karpathy loop),
and outputs a daily report to docs/reports/.

Usage:
    python evolution_watch.py                    # full pipeline
    python evolution_watch.py --dry-run         # inspect only, no research
    python evolution_watch.py --findings-only    # skip research + wiki
"""

import argparse
import json
import os
import re
import sys
import textwrap
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

CSTAR_ROOT = Path(os.environ.get("CSTAR_ROOT", "/home/morderith/Corvus/CStar"))
WIKI_ROOT = Path(os.environ.get("WIKI_ROOT", Path.home() / "wiki"))
REPORT_DEST = CSTAR_ROOT / "docs" / "reports"
LOG_FILE = Path(os.environ.get("CSTAR_EVOLUTION_WATCH_LOG", Path.home() / ".hermes" / "logs" / "cstar-evolution-watch.log"))

WIKI_ROOT.mkdir(parents=True, exist_ok=True)
REPORT_DEST.mkdir(parents=True, exist_ok=True)
LOG_FILE.parent.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

def log(msg: str, level: str = "INFO"):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] [{level}] {msg}"
    print(line)
    try:
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(LOG_FILE, "a") as fh:
            fh.write(line + "\n")
    except OSError:
        # Daily reporting must still run inside sandboxed agents where ~/.hermes is read-only.
        pass


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class Finding:
    id: str
    title: str
    severity: str  # P1 | P2 | P3 | P4
    component: str
    description: str
    impact: str
    proposed_work: str
    effort_hours: Optional[float] = None
    research_queries: list = field(default_factory=list)
    wiki_page: Optional[str] = None
    research_results: list = field(default_factory=list)
    wiki_filed: bool = False


@dataclass
class VerificationCheck:
    id: str
    title: str
    status: str  # OPEN | RESOLVED | UNKNOWN
    evidence: str


# ---------------------------------------------------------------------------
# Phase 1 — Inspect
# ---------------------------------------------------------------------------

def inspect_cstar() -> list[Finding]:
    """Read key source files, extract current findings."""
    findings = []
    hall_ledger = CSTAR_ROOT / "src" / "core" / "engine" / "bead_ledger.py"
    hall_schema = CSTAR_ROOT / "src" / "core" / "engine" / "hall_schema.py"
    muninn_heart = CSTAR_ROOT / "src" / "core" / "engine" / "ravens" / "muninn_heart.py"

    # -------------------------------------------------------------------------
    # Finding 1 — SQLite concurrency
    # -------------------------------------------------------------------------
    if hall_schema.exists():
        content = hall_schema.read_text()
        has_wal = "WAL" in content or "journal_mode" in content
        has_busy = "busy_timeout" in content
        has_sync_normal = "synchronous=NORMAL" in content
        if not (has_wal and has_busy and has_sync_normal):
            findings.append(Finding(
                id="f01",
                title="SQLite: Missing WAL/busy_timeout Connection Pragmas",
                severity="P1",
                component="hall_schema.py / HallOfRecords.connect",
                description=(
                    "HallOfRecords.connect() is missing one or more SQLite connection "
                    "pragmas required for concurrent Hall access: journal_mode=WAL, "
                    "busy_timeout, and synchronous=NORMAL."
                ),
                impact=(
                    "Correctness failure under concurrent load. Write operations can fail "
                    "with locked errors as agent count scales without WAL and a timeout."
                ),
                proposed_work=(
                    "1. Enable WAL on first connect: PRAGMA journal_mode=WAL\n"
                    "2. Set busy_timeout: PRAGMA busy_timeout=5000\n"
                    "3. Add PRAGMA synchronous=NORMAL for balanced safety/speed\n"
                    "4. Keep BeadLedger.connect() delegating to HallOfRecords.connect()"
                ),
                effort_hours=2.0,
                research_queries=[
                    "sqlite3 WAL mode concurrent writes performance python 2024",
                    "sqlite3 BEGIN CONCURRENT vs BEGIN IMMEDIATE python",
                ],
            ))

    # -------------------------------------------------------------------------
    # Finding 2 — Dataclass validation
    # -------------------------------------------------------------------------
    if hall_schema.exists():
        content = hall_schema.read_text()
        has_post_init = "__post_init__" in content
        has_status_validation = "_require_status" in content and "HallBeadRecord" in content
        if not (has_post_init and has_status_validation):
            findings.append(Finding(
                id="f02",
                title="HallBeadRecord: Raw Dataclass with No Field Validation",
                severity="P2",
                component="hall_schema.py",
                description=(
                    "HallBeadRecord and HallRepositoryRecord are bare @dataclass with no "
                    "field validators. Invalid types, out-of-range values, or None where "
                    "NOT NULL applies only fail at the SQLite layer with cryptic errors. "
                    "No __post_init__ validation exists."
                ),
                impact=(
                    "Data integrity risk. Bad records can enter the ledger and cause "
                    "hard-to-debug failures downstream. The validation surface is entirely "
                    "implicit and dependent on SQLite constraints."
                ),
                proposed_work=(
                    "1. Add __post_init__ validators to HallBeadRecord and HallRepositoryRecord\n"
                    "2. Validate: bead_id is non-empty string, status in HallBeadStatus,\n"
                    "   timestamps are positive integers\n"
                    "3. Consider attrs @attr.s with validators for better performance\n"
                    "4. Or use pydantic for validation layer only, keep dataclass for storage"
                ),
                effort_hours=2.0,
                research_queries=[
                    "python dataclass validation post_init pydantic attrs comparison 2024",
                    "python attrs validators vs pydantic performance comparison",
                ],
            ))

    # -------------------------------------------------------------------------
    # Finding 3 — Duplicate detection
    # -------------------------------------------------------------------------
    if hall_ledger.exists():
        content = hall_ledger.read_text()
        dup_section = re.search(
            r"def _find_active_duplicate.*?(?=\n    def |\nclass |\Z)",
            content, re.DOTALL
        )
        if dup_section:
            has_near_duplicate_match = "_duplicate_text_matches" in content and "SequenceMatcher" in content
            if not has_near_duplicate_match:
                findings.append(Finding(
                    id="f03",
                    title="Duplicate Detection: String-Only Rationale Comparison",
                    severity="P2",
                    component="bead_ledger.py / _find_active_duplicate",
                    description=(
                        "_find_active_duplicate() uses raw string equality on rationale "
                        "as primary duplicate key. Two beads with semantically identical "
                        "intent but different wording are treated as non-duplicates. "
                        "The composite key (target_path, target_ref, target_kind) is "
                        "not weighted over rationale text."
                    ),
                    impact=(
                        "False negatives: legitimate duplicates missed due to wording. "
                        "False positives: same rationale text on different files "
                        "incorrectly flagged as duplicates. Both degrade ledger quality."
                    ),
                    proposed_work=(
                        "1. Normalize rationale for comparison: strip(), lower(), "
                        "remove code backticks\n"
                        "2. Weight composite identity key over rationale text\n"
                        "3. If two OPEN beads target same file with same acceptance_criteria, "
                        "they are duplicates regardless of rationale wording"
                    ),
                    effort_hours=2.0,
                    research_queries=[
                        "semantic code duplicate detection algorithm text similarity",
                        "python string normalization deduplication fuzzy match",
                    ],
                ))

    # -------------------------------------------------------------------------
    # Finding 4 — Security warden gaps
    # -------------------------------------------------------------------------
    security_py = CSTAR_ROOT / "src" / "core" / "security.py"
    if security_py.exists():
        content = security_py.read_text()
        has_openai = "sk-" in content
        has_aws = "AWS_" in content or "aws_" in content
        findings.append(Finding(
            id="f04",
            title="Security Warden: Thin Coverage for Agentic Threat Surface",
            severity="P2",
            component="security.py",
            description=(
                "security.py has basic Google AIza and generic 32-45 char key "
                "detection. No coverage for OpenAI sk- keys, Bearer tokens, "
                "AWS credentials, or JWTs. No scanning of hall_beads table "
                "(rationale, acceptance_criteria, checker_shell fields) for "
                "embedded secrets or injection strings. No .agents/ directory sweep."
            ),
            impact=(
                "OWASP Agentic AI Top 10 (December 2025): Tool Misuse and "
                "Privilege Compromise categories map directly to bead contract "
                "execution. A compromised bead's checker_shell could run "
                "arbitrary commands. Rationale fields from untrusted LLM output "
                "could inject preferences."
            ),
            proposed_work=(
                "1. Expand regex patterns: sk- OpenAI keys, Bearer tokens, "
                "AWS_ env vars, JWT structure\n"
                "2. Add hall_beads table scan pass — check rationale, "
                "acceptance_criteria, checker_shell for injection/secrets\n"
                "3. Add .agents/ directory to sweep\n"
                "4. Integrate OWASP Agentic AI Top 10 threat categories"
            ),
            effort_hours=3.0,
            research_queries=[
                "OWASP agentic AI top 10 2025 tool misuse privilege compromise",
                "python regex secret detection API keys JWT bearer token",
            ],
        ))

    # -------------------------------------------------------------------------
    # Finding 5 — MuninnHeart placeholder loop
    # -------------------------------------------------------------------------
    if muninn_heart.exists():
        content = muninn_heart.read_text()
        has_structured_cycle = "execute_cycle_contract" in content and "execute_validation_stage" in content and "execute_promotion_stage" in content
        has_simulated_silence = "Simulate waiting for silence" in content or "time.sleep(1) # Simulate" in content
        if not has_structured_cycle or has_simulated_silence:
            if has_structured_cycle and has_simulated_silence:
                title = "MuninnHeart: Repository Silence Check Is Simulated"
                description = (
                    "MuninnHeart executes the structured Hunt -> Validate -> Promote "
                    "cycle, but _wait_for_silence() still sleeps for one second instead "
                    "of sampling repository activity before flight."
                )
                impact = (
                    "Ravens can start while files are actively changing, creating races "
                    "between autonomous work and operator or agent edits."
                )
                proposed_work = (
                    "1. Replace the simulated sleep with a repository activity snapshot\n"
                    "2. Compare git status before/after a quiet interval\n"
                    "3. Keep MUNINN_FORCE_FLIGHT as the explicit override"
                )
            else:
                title = "MuninnHeart: Structured Cycle Contract Missing"
                description = (
                    "MuninnHeart does not show the structured Hunt -> Validate -> Promote "
                    "cycle contract expected by the Ravens runtime."
                )
                impact = (
                    "The ravens core loop may appear to run while skipping promotion, "
                    "crucible testing, or memory persistence."
                )
                proposed_work = (
                    "1. Implement the structured cycle contract\n"
                    "2. Record memory, hunt, validate, and promote stages\n"
                    "3. Keep the 6-hour endurance guard"
                )
            findings.append(Finding(
                id="f05",
                title=title,
                severity="P2",
                component="muninn_heart.py",
                description=description,
                impact=impact,
                proposed_work=proposed_work,
                effort_hours=1.5,
                research_queries=[
                    "git status porcelain detect quiet repository automation",
                    "python subprocess git status timeout best practices",
                ],
            ))

    # -------------------------------------------------------------------------
    # Finding 6 — Cortex stale knowledge
    # -------------------------------------------------------------------------
    cortex_py = CSTAR_ROOT / "src" / "core" / "engine" / "cortex.py"
    if cortex_py.exists():
        content = cortex_py.read_text()
        has_refresh = "def refresh" in content
        has_update = "def update_document" in content or "def update_skill" in content
        has_size_guard = "st_size" in content and "1024 * 1024" in content
        if not (has_refresh and has_update and has_size_guard):
            findings.append(Finding(
                id="f06",
                title="Cortex RAG: Missing Refresh/Update Guard",
                severity="P2",
                component="cortex.py",
                description=(
                    "Cortex is missing one or more safeguards required to prevent stale "
                    "knowledge: refresh(), single-document update, and source size guard."
                ),
                impact=(
                    "Documents updated on disk may not be reflected in search results "
                    "until restart, or oversized documents may exhaust memory."
                ),
                proposed_work=(
                    "1. Add refresh() with stat-based dirty checking\n"
                    "2. Add update_document/update_skill for single-source refresh\n"
                    "3. Add a total/source corpus size guard"
                ),
                effort_hours=2.0,
                research_queries=[
                    "RAG knowledge base update refresh stale vector index",
                    "chromadb llama-index document update delete upsert python",
                ],
            ))

    # -------------------------------------------------------------------------
    # Finding 7 — Vector cache eviction
    # -------------------------------------------------------------------------
    vector_py = CSTAR_ROOT / "src" / "core" / "engine" / "vector.py"
    if vector_py.exists():
        content = vector_py.read_text()
        has_bounded_cache = "SEARCH_CACHE_MAXSIZE" in content and "popitem(last=False)" in content
        if not has_bounded_cache:
            findings.append(Finding(
                id="f07",
                title="SovereignVector: Unbounded Search Cache Growth",
                severity="P3",
                component="vector.py",
                description=(
                    "_search_cache appears to grow without a bounded eviction policy."
                ),
                impact="Memory exhaustion over long runtime under heavy query load.",
                proposed_work=(
                    "1. Add bounded LRU eviction to _search_cache\n"
                    "2. Add a regression test that cache size never exceeds maxsize"
                ),
                effort_hours=1.0,
                research_queries=[
                    "python OrderedDict LRU cache eviction maxsize",
                    "python LRU cache eviction unbounded dict growth memory",
                ],
            ))

    # -------------------------------------------------------------------------
    # Finding 8 — No test suite
    # -------------------------------------------------------------------------
    tests_dir = CSTAR_ROOT / "tests"
    has_tests = tests_dir.exists() and any(tests_dir.iterdir())
    if not has_tests:
        findings.append(Finding(
            id="f08",
            title="No Automated Test Suite Visible",
            severity="P1",
            component="tests/",
            description=(
                "No tests/ directory or test files are visible. bead_ledger.py has "
                "complex state machine logic (normalization, legacy supersession, "
                "duplicate detection) that will accumulate bugs without regression "
                "coverage."
            ),
            impact=(
                "Correctness risk. Any refactor or feature addition has no guard "
                "against regressions. The complexity of the bead state machine is "
                "particularly vulnerable to silent breakage."
            ),
            proposed_work=(
                "1. Write tests/test_bead_ledger.py covering:\n"
                "   - upsert_bead with duplicate detection\n"
                "   - claim_bead / claim_next_bead / claim_next_p1_scan_bead transitions\n"
                "   - normalize_existing_beads legacy supersession logic\n"
                "   - resolve_bead / mark_ready_for_review / block_bead transitions\n"
                "   - sync_tasks_projection\n"
                "2. Add ruff or pylint lint step\n"
                "3. Set up GitHub Actions"
            ),
            effort_hours=4.0,
            research_queries=[
                "python pytest architecture testing best practices complex state machine",
                "github actions python pytest setup ci cd",
            ],
        ))

    # -------------------------------------------------------------------------
    # Finding 9 — Broken import
    # -------------------------------------------------------------------------
    if muninn_heart.exists():
        content = muninn_heart.read_text()
        stability_import = re.search(r"from.*stability import", content)
        stability_py = CSTAR_ROOT / "src" / "core" / "engine" / "ravens" / "stability.py"
        if stability_import and not stability_py.exists():
            findings.append(Finding(
                id="f09",
                title="MuninnHeart: Broken Import — TheWatcher Not Found",
                severity="P1",
                component="muninn_heart.py",
                description=(
                    "muninn_heart.py imports: 'from src.core.engine.ravens.stability "
                    "import TheWatcher'. No src/core/engine/ravens/stability.py exists "
                    "in the repository. This import would fail at runtime, preventing "
                    "MuninnHeart from being instantiated."
                ),
                impact=(
                    "Runtime import failure. MuninnHeart cannot be used until this "
                    "is resolved — either by creating stability.py or fixing the import."
                ),
                proposed_work=(
                    "1. Verify TheWatcher class exists in the codebase\n"
                    "2. If it doesn't exist: create stub at "
                    "src/core/engine/ravens/stability.py\n"
                    "3. If it exists elsewhere: fix the import path"
                ),
                effort_hours=0.5,
                research_queries=[
                    "python state machine monitoring watchdog pattern ai agent",
                ],
            ))

    # -------------------------------------------------------------------------
    # Finding 10 — Bead contract auditor
    # -------------------------------------------------------------------------
    heimdall = CSTAR_ROOT / "src" / "core" / "engine" / "heimdall_shield.py"
    autobot = CSTAR_ROOT / "src" / "core" / "engine" / "autobot_skill.py"
    if heimdall.exists() and autobot.exists():
        autobot_content = autobot.read_text()
        has_content_audit = "audit_bead_content" in autobot_content or "audit_bead_contract_content" in autobot_content
        has_checker_guard = "validate_checker_shell" in autobot_content and "HeimdallShield().enforce" in autobot_content
    else:
        has_content_audit = False
        has_checker_guard = False
    if heimdall.exists() and not (has_content_audit and has_checker_guard):
        findings.append(Finding(
            id="f10",
            title="Bead Contracts: Missing Content Audit Before Execution",
            severity="P2",
            component="heimdall_shield.py + autobot_skill.py",
            description=(
                "Heimdall command guarding must cover checker shell execution and bead "
                "content before autonomous execution. The generator did not find a "
                "complete audit path for checker_shell, rationale, acceptance_criteria, "
                "and contract refs."
            ),
            impact=(
                "A malicious or compromised bead could carry destructive command text, "
                "secret-like content, or instruction injection into the autonomous flow."
            ),
            proposed_work=(
                "1. Validate checker_shell before every shell execution\n"
                "2. Add a bead content auditor for rationale, acceptance_criteria, "
                "and contract refs\n"
                "3. Block or triage dangerous content before Hermes receives the bead"
            ),
            effort_hours=2.0,
            research_queries=[
                "agentic AI contract execution security audit bead system",
                "AI agent tool use security audit pre-execution validation",
            ],
        ))

    # -------------------------------------------------------------------------
    # Finding 11 — Gungnir scoring validation
    # -------------------------------------------------------------------------
    gungnir_schema = CSTAR_ROOT / "src" / "core" / "engine" / "gungnir" / "schema.py"
    if gungnir_schema.exists():
        content = gungnir_schema.read_text()
        has_metric_warning = "LOGGER.warning" in content and "Invalid Gungnir metric" in content
        if not has_metric_warning:
            findings.append(Finding(
                id="f11",
                title="Gungnir Scoring: Silent Fallback on Parse Failure",
                severity="P3",
                component="gungnir/schema.py / build_gungnir_matrix",
                description=(
                    "build_gungnir_matrix() falls back for unparseable score values "
                    "without a visible warning."
                ),
                impact=(
                    "Corrupted scores can appear as legitimate fallback values and "
                    "drive bad prioritization decisions."
                ),
                proposed_work=(
                    "1. Emit a warning log for any field that falls back\n"
                    "2. Keep 0.0 real values distinguishable from unavailable values"
                ),
                effort_hours=1.0,
                research_queries=[
                    "python data validation logging warning best practices",
                ],
            ))

    return findings


def _read_text(path: Path) -> str:
    try:
        return path.read_text()
    except OSError:
        return ""


def _has_any_test_file(tests_dir: Path) -> bool:
    return tests_dir.exists() and any(
        path.is_file() and path.name.startswith("test")
        for path in tests_dir.rglob("*")
    )


def verify_current_state(findings: list[Finding]) -> list[VerificationCheck]:
    """Verify known Evolution Watch findings against the current tree.

    Reports should make stale leads visible as resolved instead of silently
    reprinting old generated findings or hiding the verification work.
    """
    open_findings = {finding.id: finding for finding in findings}
    hall_ledger = CSTAR_ROOT / "src" / "core" / "engine" / "bead_ledger.py"
    hall_schema = CSTAR_ROOT / "src" / "core" / "engine" / "hall_schema.py"
    muninn_heart = CSTAR_ROOT / "src" / "core" / "engine" / "ravens" / "muninn_heart.py"
    cortex_py = CSTAR_ROOT / "src" / "core" / "engine" / "cortex.py"
    vector_py = CSTAR_ROOT / "src" / "core" / "engine" / "vector.py"
    gungnir_schema = CSTAR_ROOT / "src" / "core" / "engine" / "gungnir" / "schema.py"
    autobot = CSTAR_ROOT / "src" / "core" / "engine" / "autobot_skill.py"
    stability_py = CSTAR_ROOT / "src" / "core" / "engine" / "ravens" / "stability.py"

    hall_schema_text = _read_text(hall_schema)
    hall_ledger_text = _read_text(hall_ledger)
    muninn_text = _read_text(muninn_heart)
    cortex_text = _read_text(cortex_py)
    vector_text = _read_text(vector_py)
    gungnir_text = _read_text(gungnir_schema)
    autobot_text = _read_text(autobot)

    checks: list[VerificationCheck] = []

    def add(fid: str, title: str, resolved: bool, resolved_evidence: str, open_evidence: str) -> None:
        if fid in open_findings:
            checks.append(VerificationCheck(fid, title, "OPEN", open_evidence))
        elif resolved:
            checks.append(VerificationCheck(fid, title, "RESOLVED", resolved_evidence))
        else:
            checks.append(VerificationCheck(fid, title, "UNKNOWN", "No open finding emitted, but the verifier could not prove the mitigation."))

    add(
        "f01",
        "SQLite Hall pragmas",
        "journal_mode=WAL" in hall_schema_text and "busy_timeout" in hall_schema_text and "synchronous=NORMAL" in hall_schema_text,
        "HallOfRecords.connect configures WAL, busy_timeout, and synchronous=NORMAL.",
        "HallOfRecords.connect is missing one or more SQLite concurrency pragmas.",
    )
    add(
        "f02",
        "Hall dataclass validation",
        "__post_init__" in hall_schema_text and "_require_status" in hall_schema_text,
        "Hall schema records include post-init validation hooks.",
        "Hall schema records still lack explicit dataclass validation.",
    )
    add(
        "f03",
        "Hall duplicate detection",
        "_duplicate_text_matches" in hall_ledger_text and "SequenceMatcher" in hall_ledger_text,
        "Duplicate detection normalizes text and uses near-duplicate matching.",
        "Duplicate detection still appears to lack near-duplicate text matching.",
    )
    add(
        "f05",
        "Ravens structured cycle",
        (
            "execute_cycle_contract" in muninn_text
            and "execute_validation_stage" in muninn_text
            and "execute_promotion_stage" in muninn_text
            and "_repository_activity_snapshot" in muninn_text
            and "Simulate waiting for silence" not in muninn_text
        ),
        "MuninnHeart has a structured cycle contract and git-status silence sampling.",
        "MuninnHeart still lacks a complete structured cycle or real silence check.",
    )
    add(
        "f06",
        "Cortex freshness",
        "def refresh" in cortex_text and "def update_document" in cortex_text and "st_size" in cortex_text,
        "Cortex has refresh(), single-document update, and source size guarding.",
        "Cortex is missing refresh/update/size-guard coverage.",
    )
    add(
        "f07",
        "SovereignVector cache bounds",
        "SEARCH_CACHE_MAXSIZE" in vector_text and "popitem(last=False)" in vector_text,
        "SovereignVector search cache uses bounded LRU eviction.",
        "SovereignVector search cache still appears unbounded.",
    )
    add(
        "f08",
        "Automated test suite",
        _has_any_test_file(CSTAR_ROOT / "tests"),
        "tests/ contains executable test files.",
        "No executable tests were found under tests/.",
    )
    add(
        "f09",
        "Ravens stability import",
        stability_py.exists() or "from src.core.engine.ravens.stability import" not in muninn_text,
        "src/core/engine/ravens/stability.py satisfies the MuninnHeart import path.",
        "MuninnHeart imports ravens.stability, but that module is missing.",
    )
    add(
        "f10",
        "Bead contract pre-execution audit",
        (
            "audit_bead_contract_content" in autobot_text
            and "validate_checker_shell" in autobot_text
            and "HeimdallShield().enforce" in autobot_text
        ),
        "Autobot validates checker_shell and audits bead contract content before launch.",
        "Autobot is missing checker-shell or bead-content preflight audit coverage.",
    )
    add(
        "f11",
        "Gungnir parse fallback warnings",
        "LOGGER.warning" in gungnir_text and "Invalid Gungnir metric" in gungnir_text,
        "Gungnir metric parsing warns when falling back from invalid values.",
        "Gungnir metric parsing still falls back without an explicit warning.",
    )

    return checks


# ---------------------------------------------------------------------------
# Phase 2 — Web Research
# ---------------------------------------------------------------------------

def run_research(findings: list[Finding]) -> list[Finding]:
    """Run DuckDuckGo searches for each finding's queries."""
    try:
        from ddgs import DDGS
    except ImportError:
        log("ddgs not installed — skipping web research. Install: pip install duckduckgo-search", "WARN")
        return findings

    for finding in findings:
        all_results = []
        for query in finding.research_queries:
            log(f"Research: [{finding.id}] {query}")
            try:
                with DDGS() as ddgs:
                    for r in ddgs.text(query, max_results=4):
                        snippet = r.get("body", "")[:250].replace("\n", " ").strip()
                        all_results.append({
                            "title": r.get("title", ""),
                            "url": r.get("href", ""),
                            "snippet": snippet,
                        })
            except Exception as e:
                log(f"Research error for '{query}': {e}", "WARN")
        finding.research_results = all_results
        log(f"Research done: [{finding.id}] {len(all_results)} results")

    return findings


# ---------------------------------------------------------------------------
# Phase 3 — Karpathy LLM Wiki Loop
# ---------------------------------------------------------------------------

def ensure_wiki_structure():
    """Bootstrap the wiki directory if it doesn't exist."""
    for subdir in ["concepts", "entities", "comparisons", "queries", "raw/articles", "raw/papers", "log"]:
        (WIKI_ROOT / subdir).mkdir(parents=True, exist_ok=True)

    schema = WIKI_ROOT / "SCHEMA.md"
    if not schema.exists():
        schema.write_text(WIKI_SCHEMA_TEMPLATE)

    index = WIKI_ROOT / "index.md"
    if not index.exists():
        index.write_text("# Wiki Index\n\n> Content catalog.\n\n## Concepts\n\n")

    log_file = WIKI_ROOT / "log.md"
    if not log_file.exists():
        log_file.write_text("# Wiki Log\n\n")


WIKI_SCHEMA_TEMPLATE = """\
# Wiki Schema — CStar Intelligence

## Domain
AI coding agent infrastructure, autonomous systems, sovereign AI.

## Conventions
- File names: lowercase, hyphens (e.g., `sqlite-concurrency-patterns.md`)
- Every wiki page starts with YAML frontmatter
- Use `[[wikilinks]]` to link between pages (minimum 2 outbound links per page)
- When updating a page, always bump the `updated` date
- Every new page must be added to `index.md` under the correct section
- Every action must be appended to `log.md`

## Frontmatter
```yaml
---
title: Page Title
created: YYYY-MM-DD
updated: YYYY-MM-DD
type: concept | entity | comparison | query
tags: [security, architecture, sqlite, python, ai]
sources: []
---
```

## Tag Taxonomy
- architecture, security, performance, testing, python, sqlite, ai, agentic, workflow

## Page Thresholds
- Create a page when a concept appears in 2+ research sources OR is central to one finding
- Add to existing page when a source mentions something already covered
- Don't create a page for passing mentions

## Update Policy
When new information conflicts with existing content, note both positions with dates and sources.
"""


def wiki_page_path(finding: Finding) -> Path:
    slug = finding.id + "-" + re.sub(r"[^a-z0-9]+", "-", finding.title.lower())[:50]
    return WIKI_ROOT / "concepts" / f"{slug}.md"


def file_finding_in_wiki(findings: list[Finding]) -> list[Finding]:
    """Karpathy loop: query wiki, file promising findings as concept pages."""
    ensure_wiki_structure()

    # Build a simple inbound-link map from existing concept pages
    inbound: dict[str, set[str]] = {}

    for page in (WIKI_ROOT / "concepts").glob("*.md"):
        try:
            content = page.read_text()
            links = re.findall(r"\[\[([^\]]+)\]\]", content)
            for link in links:
                inbound.setdefault(link.lower(), set()).add(page.stem)
        except Exception:
            pass

    for finding in findings:
        page_path = wiki_page_path(finding)

        # Summarize research results for the page
        research_summary = ""
        if finding.research_results:
            top_results = finding.research_results[:3]
            research_lines = []
            for r in top_results:
                snippet = r["snippet"][:200] if r["snippet"] else "(no snippet)"
                research_lines.append(f"- *[{r['title']}]({r['url']})*: {snippet}")
            research_summary = "\n".join(research_lines)
        else:
            research_summary = "No web research results available for this finding."

        # Cross-reference: find related existing pages by tag/content scan
        related_links: list[str] = []
        all_concepts = list((WIKI_ROOT / "concepts").glob("*.md"))
        keywords = [finding.component.split("/")[-1].replace(".py", ""), finding.severity.lower()]
        for cp in all_concepts:
            if cp.stem == page_path.stem:
                continue
            try:
                content = cp.read_text().lower()
                if any(k.lower() in content for k in keywords if len(k) > 3):
                    title_match = re.search(r"^title:\s*(.+)$", cp.read_text(), re.MULTILINE)
                    if title_match:
                        related_links.append(f"[[{title_match.group(1)}]]")
            except Exception:
                pass

        if not related_links:
            # Default related concepts based on tags
            if "security" in finding.title.lower():
                related_links = ["[[security-warden-patterns]]", "[[agentic-ai-threats]]"]
            elif "sqlite" in finding.title.lower():
                related_links = ["[[sqlite-patterns]]", "[[concurrency-patterns]]"]
            elif "test" in finding.title.lower():
                related_links = ["[[python-testing]]", "[[ci-cd-pipeline]]"]

        today = datetime.now().strftime("%Y-%m-%d")

        # Build or update the page
        existing = page_path.exists()
        if existing:
            old_content = page_path.read_text()
            # Update the updated date and append new research
            lines = old_content.split("\n")
            new_lines = []
            updated = False
            for line in lines:
                new_lines.append(line)
                if line.startswith("updated:") and not updated:
                    new_lines.append(f"updated: {today}")
                    updated = True
                if line.startswith("## Research") and not updated:
                    new_lines.append(f"updated: {today}")
                    updated = True
            if not updated:
                new_lines.append(f"\nupdated: {today}")
            content = "\n".join(new_lines)
            # Append new research block
            if finding.research_results:
                content += f"\n\n## Research Update — {today}\n\n{research_summary}"
        else:
            # New page
            frontmatter = f"""\
---
title: "{finding.title}"
created: {today}
updated: {today}
type: concept
tags: [{finding.component.split("/")[-1].replace(".py", "")}, {finding.severity.lower()}, cstar-evolution]
sources: [{", ".join(f'"{r["url"]}"' for r in finding.research_results[:3])}]
---

# {finding.title}

**Severity:** {finding.severity} | **Component:** `{finding.component}`

## Problem

{finding.description}

## Impact

{finding.impact}

## Proposed Work

{textwrap.indent(finding.proposed_work, "  ")}

## Research

{research_summary}

## Related Concepts

{" | ".join(related_links)}
"""
            content = frontmatter

        page_path.write_text(content)
        finding.wiki_page = str(page_path.relative_to(WIKI_ROOT))
        finding.wiki_filed = True

        # Update index
        index = WIKI_ROOT / "index.md"
        idx_content = index.read_text() if index.exists() else ""
        if page_path.stem not in idx_content:
            summary = finding.description[:100].replace("\n", " ")
            idx_line = f"- [[{finding.title}]] — {summary}...\n"
            if "## Concepts" in idx_content:
                idx_content = idx_content.replace(
                    "## Concepts\n",
                    f"## Concepts\n{idx_line}"
                )
            index.write_text(idx_content)

        # Log
        log_file = WIKI_ROOT / "log.md"
        log_content = log_file.read_text() if log_file.exists() else ""
        log_content += f"## [{today}] filed | {finding.id} — {finding.title}\n"
        log_file.write_text(log_content)

        finding.wiki_filed = True
        log(f"Wiki filed: [{finding.id}] {page_path.name}")

    return findings


# ---------------------------------------------------------------------------
# Phase 4 — Generate Report
# ---------------------------------------------------------------------------

def severity_badge(sev: str) -> str:
    badges = {"P1": "[CRITICAL]", "P2": "[HIGH]", "P3": "[MEDIUM]", "P4": "[LOW]"}
    return badges.get(sev, sev)


def generate_report(findings: list[Finding], verification: list[VerificationCheck] | None = None) -> Path:
    today = datetime.now().strftime("%Y-%m-%d")
    report_name = f"CSTAR_EVOLUTION_WATCH_{today}.md"
    report_path = REPORT_DEST / report_name
    verification = verification if verification is not None else verify_current_state(findings)

    # Group by severity
    by_sev: dict[str, list[Finding]] = {}
    for f in findings:
        by_sev.setdefault(f.severity, []).append(f)

    lines = []
    lines.append(f"# CStar Evolution Watch\n")
    lines.append(f"**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S Canada/Eastern')}  \n")
    lines.append(f"**CStar Root:** `{CSTAR_ROOT}`  \n")
    lines.append(f"**Open Findings:** {len(findings)} total")

    # Severity summary table
    lines.append(f"\n## Severity Summary\n")
    lines.append(f"| Priority | Count | Findings |")
    lines.append(f"|----------|-------|----------|")
    sev_order = ["P1", "P2", "P3", "P4"]
    for sev in sev_order:
        if sev in by_sev and by_sev[sev]:
            ids = ", ".join(f"`{f.id}`" for f in by_sev[sev])
            lines.append(f"| {sev} | {len(by_sev[sev])} | {ids} |")

    # Current-state verification table
    resolved = [check for check in verification if check.status == "RESOLVED"]
    open_checks = [check for check in verification if check.status == "OPEN"]
    unknown = [check for check in verification if check.status == "UNKNOWN"]
    lines.append(f"\n## Current-State Verification\n")
    lines.append(f"**Verified:** {len(resolved)} resolved, {len(open_checks)} open, {len(unknown)} unknown")
    lines.append(f"| ID | Status | Evidence |")
    lines.append(f"|----|--------|----------|")
    for check in verification:
        lines.append(f"| `{check.id}` | {check.status} | {check.evidence} |")

    # Wiki filed summary
    filed = [f for f in findings if f.wiki_filed]
    lines.append(f"\n## Wiki Filed: {len(filed)}/{len(findings)} Open Findings\n")
    if filed:
        lines.append(f"| ID | Title | Wiki Page |")
        lines.append(f"|----|-------|-----------|")
        for f in filed:
            lines.append(f"| `{f.id}` | {f.title} | `wiki/{f.wiki_page}` |")

    # Detailed findings
    lines.append(f"\n## Detailed Open Findings\n")
    for sev in sev_order:
        if sev not in by_sev:
            continue
        for f in by_sev[sev]:
            lines.append(f"### {severity_badge(f.severity)} {f.id} — {f.title}\n")
            lines.append(f"**Component:** `{f.component}`")
            if f.effort_hours:
                lines.append(f"**Effort:** ~{f.effort_hours}h")
            lines.append(f"\n**Problem:** {f.description}\n")
            lines.append(f"**Impact:** {f.impact}\n")
            lines.append(f"**Proposed Work:**\n")
            for line in f.proposed_work.split("\n"):
                lines.append(f"  {line}")
            lines.append("")

            # Research results
            if f.research_results:
                lines.append("**Research Highlights:**\n")
                for r in f.research_results[:4]:
                    snippet = r["snippet"][:200] if r["snippet"] else "(no snippet)"
                    lines.append(f"- *[{r['title']}]({r['url']})*  ")
                    lines.append(f"  > {snippet}\n")

            # Wiki cross-reference
            if f.wiki_filed and f.wiki_page:
                lines.append(f"> **Wiki:** [[{f.title}]] — filed at `wiki/{f.wiki_page}`\n")

            lines.append("---\n")

    # Top priorities
    p1_findings = by_sev.get("P1", [])
    lines.append(f"## Top Priorities for Today\n")
    if p1_findings:
        for i, f in enumerate(p1_findings, 1):
            effort = f" (~{f.effort_hours}h)" if f.effort_hours else ""
            lines.append(f"{i}. **{f.title}** — `{f.component}`{effort}\n")
    else:
        lines.append("No P1 items today. The codebase is in good shape.\n")

    # Proposed BEADs
    lines.append(f"## Proposed BEADs\n")
    lines.append(f"| ID | Title | Priority | Effort |")
    lines.append(f"|----|-------|----------|--------|")
    for f in findings:
        effort = f"{f.effort_hours}h" if f.effort_hours else "TBD"
        lines.append(f"| `{f.id}` | {f.title} | {f.severity} | {effort} |")
    if not findings:
        lines.append("| - | No open findings | - | - |")

    report_content = "\n".join(lines)
    report_path.write_text(report_content)
    log(f"Report written: {report_path}")
    return report_path


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="CStar Evolution Watch")
    parser.add_argument("--dry-run", action="store_true", help="Inspect only, skip research and wiki")
    parser.add_argument("--findings-only", action="store_true", help="Skip research and wiki filing")
    args = parser.parse_args()

    log("=" * 60)
    log("CStar Evolution Watch — Starting pipeline")
    log("=" * 60)

    # Phase 1: Inspect
    log("Phase 1: Inspecting CStar codebase")
    findings = inspect_cstar()
    log(f"Phase 1 complete: {len(findings)} findings extracted")
    verification = verify_current_state(findings)
    resolved_count = sum(1 for check in verification if check.status == "RESOLVED")
    open_count = sum(1 for check in verification if check.status == "OPEN")
    unknown_count = sum(1 for check in verification if check.status == "UNKNOWN")
    log(f"Verification complete: {resolved_count} resolved, {open_count} open, {unknown_count} unknown")

    for f in findings:
        log(f"  {f.severity} {f.id} — {f.title[:60]}")

    if args.dry_run:
        log("Dry run — stopping after inspection")
        return

    # Phase 2: Research
    if not args.findings_only:
        log("Phase 2: Running web research")
        findings = run_research(findings)
    else:
        log("Phase 2: Skipped (--findings-only)")

    # Phase 3: Wiki loop
    if not args.findings_only:
        log("Phase 3: Karpathy LLM Wiki loop")
        findings = file_finding_in_wiki(findings)
    else:
        log("Phase 3: Skipped (--findings-only)")

    # Phase 4: Report
    log("Phase 4: Generating report")
    report_path = generate_report(findings, verification)

    # Summary
    log("=" * 60)
    log(f"Pipeline complete: {len(findings)} findings, {sum(1 for f in findings if f.wiki_filed)} wiki pages, report at {report_path}")
    log("=" * 60)

    # Print report preview
    print("\n" + "=" * 60)
    print("REPORT PREVIEW")
    print("=" * 60)
    content = report_path.read_text()
    print(textwrap.indent(content[:3000], "  "))


if __name__ == "__main__":
    main()
