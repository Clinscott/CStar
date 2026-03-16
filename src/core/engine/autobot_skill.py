#!/usr/bin/env python3
from __future__ import annotations

import argparse
import codecs
import errno
import json
import os
import re
import select
import shlex
import signal
import subprocess
import sys
import termios
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Sequence

from src.core.engine.bead_ledger import BeadLedger, SovereignBead
from src.core.engine.validation_result import (
    ValidationCheck,
    create_validation_result,
    save_validation_result,
)

DEFAULT_PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_AUTOBOT_DIR = Path("/home/morderith/Corvus/AutoBot")
DEFAULT_READY_REGEX = r"(?:^|\n)\s*❯\s*$"
TAIL_LIMIT = 64_000
OUTPUT_LIMIT = 200_000
RETRY_FEEDBACK_LIMIT = 4_000
PROMPT_FIELD_LIMIT = 1_200
PROMPT_BASELINE_LIMIT = 600
WORKER_NOTE_LIMIT = 6_000

ANSI_CSI_RE = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")
ANSI_OSC_RE = re.compile(r"\x1b\][^\x07]*(?:\x07|\x1b\\)")


class OverseerError(RuntimeError):
    """Base exception for overseer failures."""


class LaunchError(OverseerError):
    """Raised when Hermes or a checker command cannot be started."""


class ReadyPromptTimeoutError(OverseerError):
    """Raised when Hermes never reaches its interactive prompt."""


class HardTimeoutError(OverseerError):
    """Raised when a task exceeds the hard timeout."""


class ProcessExitedError(OverseerError):
    """Raised when a subprocess exits before the overseer sees completion."""


@dataclass
class RunResult:
    success: bool
    reason: str
    matched_pattern: str | None
    returncode: int | None
    elapsed_seconds: float


@dataclass
class CommandResult:
    command: list[str]
    returncode: int | None
    timed_out: bool
    elapsed_seconds: float
    output: str

    @property
    def succeeded(self) -> bool:
        return not self.timed_out and self.returncode == 0

    def excerpt(self, limit: int = RETRY_FEEDBACK_LIMIT) -> str:
        cleaned = normalize_terminal_text(self.output).strip()
        if not cleaned:
            return "<no output captured>"
        return cleaned[-limit:]


@dataclass(slots=True)
class AutoBotSkillResult:
    status: str
    outcome: str
    summary: str
    bead_id: str | None = None
    target_path: str | None = None
    claimed: bool = False
    attempt_count: int = 0
    max_attempts: int = 0
    final_bead_status: str | None = None
    validation_id: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "skill_id": "autobot",
            "status": self.status,
            "outcome": self.outcome,
            "summary": self.summary,
            "bead_id": self.bead_id,
            "target_path": self.target_path,
            "claimed": self.claimed,
            "attempt_count": self.attempt_count,
            "max_attempts": self.max_attempts,
            "final_bead_status": self.final_bead_status,
            "validation_id": self.validation_id,
            "metadata": dict(self.metadata),
        }


def normalize_terminal_text(text: str) -> str:
    without_osc = ANSI_OSC_RE.sub("", text)
    without_ansi = ANSI_CSI_RE.sub("", without_osc)
    return without_ansi.replace("\r", "\n")


def compact_prompt_text(text: str | None, *, limit: int) -> str | None:
    cleaned = normalize_terminal_text(text or "").strip()
    if not cleaned:
        return None
    cleaned = re.sub(r"\s+", " ", cleaned)
    if len(cleaned) <= limit:
        return cleaned
    return f"{cleaned[: max(0, limit - 1)].rstrip()}…"


def append_capped(buffer: str, text: str, *, limit: int) -> str:
    return (buffer + text)[-limit:]


def terminate_process_group(process: subprocess.Popen[bytes], grace_seconds: float) -> None:
    if process.poll() is None:
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass

        try:
            process.wait(timeout=grace_seconds)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            try:
                process.wait(timeout=2.0)
            except subprocess.TimeoutExpired:
                pass


class HermesSessionRunner:
    """
    Launch Hermes from the AutoBot directory inside a PTY, inject one prompt,
    stream its output, and always kill the process group afterward.
    """

    def __init__(
        self,
        command: Sequence[str],
        working_dir: Path,
        ready_regex: str,
        timeout_seconds: float,
        startup_timeout_seconds: float,
        grace_seconds: float,
        stream_output: bool,
        base_env: dict[str, str] | None = None,
        encoding: str = "utf-8",
    ) -> None:
        self.command = list(command)
        self.working_dir = working_dir
        self.ready_pattern = re.compile(ready_regex, re.MULTILINE)
        self.timeout_seconds = timeout_seconds
        self.startup_timeout_seconds = startup_timeout_seconds
        self.grace_seconds = grace_seconds
        self.stream_output = stream_output
        self.base_env = base_env or {}
        self.encoding = encoding

        self.process: subprocess.Popen[bytes] | None = None
        self.master_fd: int | None = None
        self.decoder = codecs.getincrementaldecoder(self.encoding)(errors="replace")
        self.tail = ""

    def run(self, task_prompt: str, *, done_regexes: Sequence[str], extra_env: dict[str, str] | None = None) -> RunResult:
        self.process = None
        self.master_fd = None
        self.decoder = codecs.getincrementaldecoder(self.encoding)(errors="replace")
        self.tail = ""

        started_at = time.monotonic()
        try:
            self._launch(extra_env)
            self._wait_for_ready_prompt(started_at)
            self._reset_tail()
            self._send_prompt(task_prompt)
            return self._monitor_for_completion(started_at, done_regexes)
        finally:
            if self.process is not None:
                terminate_process_group(self.process, self.grace_seconds)
            self._close_master_fd()

    def _launch(self, extra_env: dict[str, str] | None) -> None:
        if not self.working_dir.is_dir():
            raise LaunchError(f"AutoBot working directory does not exist: {self.working_dir}")
        if not self.command:
            raise LaunchError("No command was provided to launch Hermes.")

        env = os.environ.copy()
        env.update(self.base_env)
        env.update(extra_env or {})
        env["PWD"] = str(self.working_dir)

        try:
            master_fd, slave_fd = os.openpty()
            os.set_blocking(master_fd, False)
            slave_attrs = termios.tcgetattr(slave_fd)
            slave_attrs[3] &= ~(termios.ECHO | termios.ECHONL)
            termios.tcsetattr(slave_fd, termios.TCSANOW, slave_attrs)
        except OSError as exc:
            raise LaunchError(f"Failed to allocate a PTY for Hermes: {exc}") from exc

        try:
            self.process = subprocess.Popen(
                self.command,
                cwd=self.working_dir,
                env=env,
                stdin=slave_fd,
                stdout=slave_fd,
                stderr=slave_fd,
                start_new_session=True,
                close_fds=True,
            )
            self.master_fd = master_fd
        except OSError as exc:
            os.close(master_fd)
            os.close(slave_fd)
            raise LaunchError(
                f"Failed to launch command {shlex.join(self.command)}: {exc}"
            ) from exc
        finally:
            try:
                os.close(slave_fd)
            except OSError:
                pass

    def _wait_for_ready_prompt(self, started_at: float) -> None:
        deadline = min(
            started_at + self.timeout_seconds,
            time.monotonic() + self.startup_timeout_seconds,
        )
        while time.monotonic() < deadline:
            if self.ready_pattern.search(self._normalized_tail()):
                return

            event = self._read_output(min(0.25, max(0.0, deadline - time.monotonic())))
            if event is None or (event is False and self._returncode() is not None):
                raise ProcessExitedError(
                    "Hermes exited before showing its ready prompt.\n"
                    f"Recent output:\n{self._tail_excerpt()}"
                )

        raise ReadyPromptTimeoutError(
            f"Hermes never reached the ready prompt within {self.startup_timeout_seconds:.1f} seconds.\n"
            f"Recent output:\n{self._tail_excerpt()}"
        )

    def _send_prompt(self, task_prompt: str) -> None:
        if self.master_fd is None:
            raise LaunchError("Hermes PTY was not initialized.")

        payload = task_prompt if task_prompt.endswith("\n") else f"{task_prompt}\n"
        try:
            os.write(self.master_fd, payload.encode(self.encoding))
        except OSError as exc:
            raise OverseerError(f"Failed to send the task prompt to Hermes: {exc}") from exc

    def _monitor_for_completion(self, started_at: float, done_regexes: Sequence[str]) -> RunResult:
        deadline = started_at + self.timeout_seconds
        done_patterns = [re.compile(pattern, re.MULTILINE) for pattern in done_regexes]

        while time.monotonic() < deadline:
            normalized = self._normalized_tail()
            done_match = self._find_done_match(done_patterns, normalized)
            if done_match is not None:
                return RunResult(
                    success=True,
                    reason=f"matched completion pattern: {done_match.re.pattern}",
                    matched_pattern=done_match.re.pattern,
                    returncode=self._returncode(),
                    elapsed_seconds=time.monotonic() - started_at,
                )
            if self.ready_pattern.search(normalized):
                return RunResult(
                    success=True,
                    reason="Hermes returned to the ready prompt",
                    matched_pattern=self.ready_pattern.pattern,
                    returncode=self._returncode(),
                    elapsed_seconds=time.monotonic() - started_at,
                )

            event = self._read_output(min(0.25, max(0.0, deadline - time.monotonic())))
            if event is None or (event is False and self._returncode() is not None):
                normalized = self._normalized_tail()
                done_match = self._find_done_match(done_patterns, normalized)
                if done_match is not None:
                    return RunResult(
                        success=True,
                        reason=f"matched completion pattern before exit: {done_match.re.pattern}",
                        matched_pattern=done_match.re.pattern,
                        returncode=self._returncode(),
                        elapsed_seconds=time.monotonic() - started_at,
                    )
                raise ProcessExitedError(
                    "Hermes exited before the overseer saw a completion marker or prompt return.\n"
                    f"Recent output:\n{self._tail_excerpt()}"
                )

        raise HardTimeoutError(
            f"Hermes exceeded the hard timeout of {self.timeout_seconds:.1f} seconds.\n"
            f"Recent output:\n{self._tail_excerpt()}"
        )

    def _read_output(self, wait_seconds: float) -> bool | None:
        if self.master_fd is None:
            raise LaunchError("Hermes PTY was not initialized.")

        ready, _, _ = select.select([self.master_fd], [], [], max(0.0, wait_seconds))
        if not ready:
            return False

        try:
            chunk = os.read(self.master_fd, 4096)
        except OSError as exc:
            if exc.errno == errno.EIO:
                self._flush_decoder(final=True)
                return None
            raise

        if not chunk:
            self._flush_decoder(final=True)
            return None

        text = self.decoder.decode(chunk)
        if text:
            if self.stream_output:
                sys.stdout.write(text)
                sys.stdout.flush()
            self._append_tail(text)
        return True

    def _append_tail(self, text: str) -> None:
        self.tail = append_capped(self.tail, text, limit=TAIL_LIMIT)

    def _reset_tail(self) -> None:
        self.tail = ""

    def _flush_decoder(self, final: bool) -> None:
        leftover = self.decoder.decode(b"", final=final)
        if leftover:
            if self.stream_output:
                sys.stdout.write(leftover)
                sys.stdout.flush()
            self._append_tail(leftover)

    def _normalized_tail(self) -> str:
        return normalize_terminal_text(self.tail)

    def _tail_excerpt(self, limit: int = 1_200) -> str:
        normalized = self._normalized_tail().strip()
        if not normalized:
            return "<no output captured>"
        return normalized[-limit:]

    def _find_done_match(
        self,
        done_patterns: Sequence[re.Pattern[str]],
        normalized_text: str,
    ) -> re.Match[str] | None:
        for pattern in done_patterns:
            match = pattern.search(normalized_text)
            if match:
                return match
        return None

    def _returncode(self) -> int | None:
        return None if self.process is None else self.process.poll()

    def _close_master_fd(self) -> None:
        if self.master_fd is None:
            return
        try:
            os.close(self.master_fd)
        except OSError:
            pass
        self.master_fd = None


def run_command_capture(
    command: Sequence[str],
    *,
    cwd: Path,
    timeout_seconds: float,
    grace_seconds: float,
    stream_output: bool,
    extra_env: dict[str, str] | None = None,
    encoding: str = "utf-8",
) -> CommandResult:
    env = os.environ.copy()
    env.update(extra_env or {})
    env["PWD"] = str(cwd)

    started_at = time.monotonic()
    try:
        process = subprocess.Popen(
            list(command),
            cwd=cwd,
            env=env,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            start_new_session=True,
            close_fds=True,
        )
    except OSError as exc:
        raise LaunchError(f"Failed to launch command {shlex.join(command)}: {exc}") from exc

    output = ""
    decoder = codecs.getincrementaldecoder(encoding)(errors="replace")
    timed_out = False
    stdout_fd = process.stdout.fileno() if process.stdout is not None else None
    if stdout_fd is not None:
        os.set_blocking(stdout_fd, False)

    try:
        deadline = started_at + timeout_seconds
        while True:
            if stdout_fd is None:
                break
            if time.monotonic() >= deadline:
                timed_out = True
                break

            ready, _, _ = select.select([stdout_fd], [], [], 0.25)
            if ready:
                try:
                    chunk = os.read(stdout_fd, 4096)
                except OSError as exc:
                    if exc.errno == errno.EIO:
                        break
                    raise

                if not chunk:
                    break

                text = decoder.decode(chunk)
                if text:
                    if stream_output:
                        sys.stdout.write(text)
                        sys.stdout.flush()
                    output = append_capped(output, text, limit=OUTPUT_LIMIT)
                continue

            if process.poll() is not None:
                break

        if timed_out:
            terminate_process_group(process, grace_seconds)
        else:
            try:
                process.wait(timeout=grace_seconds)
            except subprocess.TimeoutExpired:
                terminate_process_group(process, grace_seconds)

        if stdout_fd is not None:
            while True:
                ready, _, _ = select.select([stdout_fd], [], [], 0.0)
                if not ready:
                    break
                try:
                    chunk = os.read(stdout_fd, 4096)
                except OSError as exc:
                    if exc.errno == errno.EIO:
                        break
                    raise
                if not chunk:
                    break
                text = decoder.decode(chunk)
                if text:
                    if stream_output:
                        sys.stdout.write(text)
                        sys.stdout.flush()
                    output = append_capped(output, text, limit=OUTPUT_LIMIT)

        leftover = decoder.decode(b"", final=True)
        if leftover:
            if stream_output:
                sys.stdout.write(leftover)
                sys.stdout.flush()
            output = append_capped(output, leftover, limit=OUTPUT_LIMIT)

        return CommandResult(
            command=list(command),
            returncode=process.poll(),
            timed_out=timed_out,
            elapsed_seconds=time.monotonic() - started_at,
            output=output,
        )
    finally:
        if process.stdout is not None:
            process.stdout.close()
        terminate_process_group(process, grace_seconds)


def parse_env_assignments(items: Sequence[str]) -> dict[str, str]:
    env: dict[str, str] = {}
    for item in items:
        key, sep, value = item.partition("=")
        if not sep or not key:
            raise ValueError(f"Invalid --env entry {item!r}; expected KEY=VALUE.")
        env[key] = value
    return env


def build_command(command: str, command_args: Sequence[str]) -> list[str]:
    if command_args:
        return [command, *command_args]
    return [command, "chat"]


def bead_mode_requested(args: argparse.Namespace) -> bool:
    return bool(args.bead_id or args.claim_next)


def build_bead_env(project_root: Path, bead: SovereignBead, attempt: int) -> dict[str, str]:
    target_rel = bead.target_path or bead.target_ref or ""
    target_abs = ""
    if bead.target_path:
        target_abs = str((project_root / bead.target_path).resolve())

    return {
        "CORVUS_PROJECT_ROOT": str(project_root),
        "CORVUS_BEAD_ID": bead.id,
        "CORVUS_SCAN_ID": bead.scan_id,
        "CORVUS_TARGET_PATH": target_rel,
        "CORVUS_TARGET_ABS_PATH": target_abs,
        "CORVUS_ACCEPTANCE_CRITERIA": bead.acceptance_criteria or "",
        "CORVUS_CONTRACT_REFS": ",".join(bead.contract_refs),
        "CORVUS_ATTEMPT": str(attempt),
    }


def build_done_sentinel(bead: SovereignBead, attempt: int) -> str:
    return f"AUTOBOT_BEAD_COMPLETE::{bead.id}::ATTEMPT::{attempt}"


def build_bead_prompt(
    *,
    project_root: Path,
    bead: SovereignBead,
    attempt: int,
    done_sentinel: str,
    retry_feedback: str | None,
    worker_note: str | None,
) -> str:
    target_path = bead.target_path or bead.target_ref or "<unspecified>"
    rationale = compact_prompt_text(bead.rationale, limit=PROMPT_FIELD_LIMIT) or "<none>"
    acceptance_criteria = compact_prompt_text(bead.acceptance_criteria, limit=PROMPT_FIELD_LIMIT)
    baseline_scores = compact_prompt_text(
        json.dumps(bead.baseline_scores, sort_keys=True) if bead.baseline_scores else "",
        limit=PROMPT_BASELINE_LIMIT,
    )
    bounded_worker_note = compact_prompt_text(worker_note, limit=WORKER_NOTE_LIMIT)
    lines = [
        "CorvusStar is orchestrating bead lifecycle. AutoBot via Hermes is the worker doing the implementation.",
        "AutoBot has a tight 32k context window. Treat this prompt as the full non-local brief.",
        f"Project root to edit: {project_root}",
        f"Bead ID: {bead.id}",
        f"Attempt: {attempt}",
        f"Target path: {target_path}",
        f"Rationale: {rationale}",
    ]

    if bead.contract_refs:
        contract_refs = compact_prompt_text(", ".join(bead.contract_refs), limit=PROMPT_FIELD_LIMIT)
        if contract_refs:
            lines.append(f"Contract refs: {contract_refs}")
    if acceptance_criteria:
        lines.append(f"Acceptance criteria: {acceptance_criteria}")
    if baseline_scores:
        lines.append(f"Baseline scores: {baseline_scores}")
    if bounded_worker_note:
        lines.append("Immediate Hall/PennyOne context (bounded):")
        lines.append(bounded_worker_note)
    if retry_feedback:
        lines.append("Previous validation feedback:")
        lines.append(retry_feedback)

    lines.extend(
        [
            "Execution requirements:",
            "1. Treat this as a bounded bead. Stay on the target path and only inspect directly adjacent files when required.",
            "2. Treat the Immediate Hall/PennyOne context block as the authoritative non-local context budget.",
            "3. Make the smallest complete change that satisfies the bead.",
            "4. Save every edited file under the project root above.",
            "5. Do not stop at analysis or a plan.",
            f"6. When finished, print exactly this line on its own: {done_sentinel}",
        ]
    )
    return "\n".join(lines)


def build_retry_feedback(header: str, details: str) -> str:
    cleaned = normalize_terminal_text(details).strip()
    if len(cleaned) > RETRY_FEEDBACK_LIMIT:
        cleaned = cleaned[-RETRY_FEEDBACK_LIMIT:]
    return f"{header}\n{cleaned or '<no details available>'}"


def select_bead(
    project_root: Path,
    bead_id: str | None,
    claim_next: bool,
    agent_id: str,
) -> tuple[BeadLedger, SovereignBead | None, bool]:
    ledger = BeadLedger(project_root)

    if claim_next:
        claimed = ledger.claim_next_bead(agent_id)
        if claimed is None:
            return ledger, None, False
        bead = ledger.get_bead(claimed["id"])
        if bead is None:
            raise OverseerError(f"Claimed bead {claimed['id']} could not be reloaded from the ledger.")
        return ledger, bead, True

    if bead_id is None:
        raise OverseerError("A bead id is required unless --claim-next is used.")

    bead = ledger.get_bead(bead_id)
    if bead is None:
        raise OverseerError(f"Bead {bead_id!r} does not exist.")

    if bead.status == "OPEN":
        claimed = ledger.claim_bead(bead.id, agent_id)
        if claimed is None:
            raise OverseerError(f"Bead {bead.id} could not be claimed.")
        return ledger, claimed, True

    if bead.status == "IN_PROGRESS":
        if bead.assigned_agent not in (None, agent_id):
            raise OverseerError(
                f"Bead {bead.id} is already assigned to {bead.assigned_agent}; refusing to steal it."
            )
        return ledger, bead, False

    raise OverseerError(
        f"Bead {bead.id} is in status {bead.status}; only OPEN or IN_PROGRESS beads can be worked."
    )


def persist_checker_validation(
    *,
    project_root: Path,
    bead: SovereignBead,
    attempt: int,
    checker_shell: str,
    checker_result: CommandResult,
    hermes_result: RunResult,
) -> str:
    status = "PASS" if checker_result.succeeded else "FAIL"
    timeout_note = " Checker timed out." if checker_result.timed_out else ""
    summary = (
        f"AutoBot checker accepted bead {bead.id} on attempt {attempt}."
        if checker_result.succeeded
        else f"AutoBot checker rejected bead {bead.id} on attempt {attempt}.{timeout_note}"
    )
    check = ValidationCheck(
        name="autobot_checker",
        status=status,
        details=checker_result.excerpt(),
    )
    validation = create_validation_result(
        before=bead.baseline_scores,
        after=bead.baseline_scores,
        checks=[check],
        summary=summary,
        metadata={
            "attempt": attempt,
            "checker_shell": checker_shell,
            "checker_returncode": checker_result.returncode,
            "checker_timed_out": checker_result.timed_out,
            "hermes_reason": hermes_result.reason,
            "hermes_match": hermes_result.matched_pattern,
        },
    )
    record = save_validation_result(
        str(project_root),
        validation,
        scan_id=bead.scan_id,
        bead_id=bead.id,
        target_path=bead.target_path,
        notes=f"{summary}\n\nChecker command: {checker_shell}\n\n{checker_result.excerpt()}",
    )
    return record.validation_id


def finalize_success(ledger: BeadLedger, bead: SovereignBead, attempt: int, validation_id: str | None) -> None:
    if validation_id:
        resolution_note = (
            f"AutoBot completed bead {bead.id} on attempt {attempt}. "
            f"Validation {validation_id} accepted the result."
        )
        review = ledger.mark_ready_for_review(bead.id, resolution_note=resolution_note)
        if review is None:
            raise OverseerError(f"Failed to move bead {bead.id} to READY_FOR_REVIEW.")
        resolved = ledger.resolve_bead(
            bead.id,
            validation_id=validation_id,
            resolution_note=resolution_note,
        )
        if resolved is None:
            raise OverseerError(
                f"Failed to resolve bead {bead.id} with validation {validation_id}."
            )
        return

    resolution_note = (
        f"AutoBot completed bead {bead.id} on attempt {attempt}. "
        "No checker was configured, so the bead remains READY_FOR_REVIEW."
    )
    review = ledger.mark_ready_for_review(bead.id, resolution_note=resolution_note)
    if review is None:
        raise OverseerError(f"Failed to move bead {bead.id} to READY_FOR_REVIEW.")


def block_failed_bead(
    ledger: BeadLedger,
    bead: SovereignBead,
    *,
    triage_reason: str,
    resolution_note: str,
) -> None:
    blocked = ledger.block_bead(
        bead.id,
        triage_reason,
        resolution_note=resolution_note,
    )
    if blocked is None:
        raise OverseerError(f"Failed to block bead {bead.id} after repeated failure.")


def run_prompt_mode(args: argparse.Namespace, base_env: dict[str, str]) -> int:
    if not args.prompt:
        raise OverseerError("A prompt is required unless bead mode is enabled.")

    runner = HermesSessionRunner(
        command=build_command(args.command, args.command_arg),
        working_dir=args.autobot_dir,
        ready_regex=args.ready_regex,
        timeout_seconds=args.timeout,
        startup_timeout_seconds=args.startup_timeout,
        grace_seconds=args.grace_seconds,
        stream_output=not args.no_stream,
        base_env=base_env,
    )
    result = runner.run(args.prompt, done_regexes=args.done_regex, extra_env={})
    print(
        (
            f"\n[autobot] success after {result.elapsed_seconds:.1f}s: {result.reason}. "
            f"Command: {shlex.join(runner.command)}"
        ),
        file=sys.stderr,
    )
    return 0


def run_bead_mode(args: argparse.Namespace, base_env: dict[str, str]) -> AutoBotSkillResult:
    ledger, bead, claimed_now = select_bead(
        args.project_root,
        bead_id=args.bead_id,
        claim_next=args.claim_next,
        agent_id=args.agent_id,
    )
    if bead is None:
        print("[autobot] no actionable OPEN beads were available.", file=sys.stderr)
        return AutoBotSkillResult(
            status="SUCCESS",
            outcome="NO_ACTIONABLE_BEADS",
            summary="No actionable bead is available for AutoBot execution.",
            claimed=False,
            attempt_count=0,
            max_attempts=args.max_attempts,
        )

    print(
        f"[autobot] claimed bead {bead.id} for {args.agent_id} targeting {bead.target_path or bead.target_ref}.",
        file=sys.stderr,
    )

    retry_feedback: str | None = None
    last_validation_id: str | None = None
    runner = HermesSessionRunner(
        command=build_command(args.command, args.command_arg),
        working_dir=args.autobot_dir,
        ready_regex=args.ready_regex,
        timeout_seconds=args.timeout,
        startup_timeout_seconds=args.startup_timeout,
        grace_seconds=args.grace_seconds,
        stream_output=not args.no_stream,
        base_env=base_env,
    )

    for attempt in range(1, args.max_attempts + 1):
        done_sentinel = build_done_sentinel(bead, attempt)
        bead_env = build_bead_env(args.project_root, bead, attempt)
        bead_env.update(base_env)

        print(
            f"[autobot] AutoBot attempt {attempt}/{args.max_attempts} for bead {bead.id}.",
            file=sys.stderr,
        )
        try:
            hermes_result = runner.run(
                build_bead_prompt(
                    project_root=args.project_root,
                    bead=bead,
                    attempt=attempt,
                    done_sentinel=done_sentinel,
                    retry_feedback=retry_feedback,
                    worker_note=args.worker_note,
                ),
                done_regexes=[re.escape(done_sentinel), *args.done_regex],
                extra_env=bead_env,
            )
        except OverseerError as exc:
            failure_text = str(exc)
            print(f"[autobot] AutoBot attempt {attempt} failed: {failure_text}", file=sys.stderr)
            if attempt >= args.max_attempts:
                block_failed_bead(
                    ledger,
                    bead,
                    triage_reason="AutoBot worker could not complete the claimed bead.",
                    resolution_note=build_retry_feedback(
                        f"AutoBot failed on final attempt {attempt}.",
                        failure_text,
                    ),
                )
                blocked = ledger.get_bead(bead.id)
                return AutoBotSkillResult(
                    status="FAILURE",
                    outcome="BLOCKED",
                    summary=f"AutoBot failed to complete bead {bead.id} after {attempt} attempts.",
                    bead_id=bead.id,
                    target_path=bead.target_path,
                    claimed=claimed_now,
                    attempt_count=attempt,
                    max_attempts=args.max_attempts,
                    final_bead_status=None if blocked is None else blocked.status,
                    validation_id=last_validation_id,
                    metadata={
                        "agent_id": args.agent_id,
                        "worker_failure": failure_text,
                    },
                )
            retry_feedback = build_retry_feedback(
                "Previous AutoBot attempt did not finish successfully. Fix the failure and complete the bead.",
                failure_text,
            )
            continue

        print(
            f"[autobot] AutoBot attempt {attempt} finished: {hermes_result.reason}.",
            file=sys.stderr,
        )

        if not args.checker_shell:
            finalize_success(ledger, bead, attempt, validation_id=None)
            print(
                f"[autobot] bead {bead.id} moved to READY_FOR_REVIEW; no checker was configured.",
                file=sys.stderr,
            )
            review_bead = ledger.get_bead(bead.id)
            return AutoBotSkillResult(
                status="SUCCESS",
                outcome="READY_FOR_REVIEW",
                summary=f"AutoBot completed bead {bead.id}; no checker was configured.",
                bead_id=bead.id,
                target_path=bead.target_path,
                claimed=claimed_now,
                attempt_count=attempt,
                max_attempts=args.max_attempts,
                final_bead_status=None if review_bead is None else review_bead.status,
                validation_id=None,
                metadata={
                    "agent_id": args.agent_id,
                    "hermes_reason": hermes_result.reason,
                    "matched_pattern": hermes_result.matched_pattern,
                },
            )

        print(f"[autobot] running checker for bead {bead.id}.", file=sys.stderr)
        checker_env = dict(bead_env)
        checker_env.update(
            {
                "CORVUS_HERMES_REASON": hermes_result.reason,
                "CORVUS_HERMES_MATCHED_PATTERN": hermes_result.matched_pattern or "",
            }
        )
        checker_result = run_command_capture(
            ["bash", "-lc", args.checker_shell],
            cwd=args.project_root,
            timeout_seconds=args.checker_timeout,
            grace_seconds=args.grace_seconds,
            stream_output=not args.no_stream,
            extra_env=checker_env,
        )
        validation_id = persist_checker_validation(
            project_root=args.project_root,
            bead=bead,
            attempt=attempt,
            checker_shell=args.checker_shell,
            checker_result=checker_result,
            hermes_result=hermes_result,
        )
        last_validation_id = validation_id

        if checker_result.succeeded:
            finalize_success(ledger, bead, attempt, validation_id=validation_id)
            print(
                f"[autobot] bead {bead.id} resolved with validation {validation_id}.",
                file=sys.stderr,
            )
            resolved_bead = ledger.get_bead(bead.id)
            return AutoBotSkillResult(
                status="SUCCESS",
                outcome="RESOLVED",
                summary=f"AutoBot resolved bead {bead.id} with validation {validation_id}.",
                bead_id=bead.id,
                target_path=bead.target_path,
                claimed=claimed_now,
                attempt_count=attempt,
                max_attempts=args.max_attempts,
                final_bead_status=None if resolved_bead is None else resolved_bead.status,
                validation_id=validation_id,
                metadata={
                    "agent_id": args.agent_id,
                    "checker_shell": args.checker_shell,
                    "checker_returncode": checker_result.returncode,
                    "hermes_reason": hermes_result.reason,
                    "matched_pattern": hermes_result.matched_pattern,
                },
            )

        print(
            (
                f"[autobot] checker rejected attempt {attempt} for bead {bead.id}; "
                f"validation {validation_id} recorded."
            ),
            file=sys.stderr,
        )
        if attempt >= args.max_attempts:
            block_failed_bead(
                ledger,
                bead,
                triage_reason=f"Checker rejected AutoBot output after {attempt} attempts.",
                resolution_note=build_retry_feedback(
                    f"Final checker failure for bead {bead.id}. Last validation: {last_validation_id}.",
                    checker_result.excerpt(),
                ),
            )
            blocked = ledger.get_bead(bead.id)
            return AutoBotSkillResult(
                status="FAILURE",
                outcome="BLOCKED",
                summary=f"Checker rejected AutoBot output for bead {bead.id} after {attempt} attempts.",
                bead_id=bead.id,
                target_path=bead.target_path,
                claimed=claimed_now,
                attempt_count=attempt,
                max_attempts=args.max_attempts,
                final_bead_status=None if blocked is None else blocked.status,
                validation_id=validation_id,
                metadata={
                    "agent_id": args.agent_id,
                    "checker_shell": args.checker_shell,
                    "checker_returncode": checker_result.returncode,
                    "checker_output_excerpt": checker_result.excerpt(),
                },
            )

        retry_feedback = build_retry_feedback(
            (
                f"Validation {validation_id} rejected the last attempt. "
                "Fix only the reported issues, then complete the bead."
            ),
            checker_result.excerpt(),
        )

    raise OverseerError(f"Unexpected control flow while processing bead {bead.id}.")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Ephemeral AutoBot/Hermes orchestrator. It can either run a single prompt or claim "
            "a Hall-backed bead, send that bead to Hermes, validate the result, and retry by "
            "spinning Hermes back up until the bead is resolved or blocked."
        )
    )
    parser.add_argument(
        "prompt",
        nargs="?",
        help="Single prompt for one-off mode. Omit this when using --bead-id or --claim-next.",
    )
    parser.add_argument(
        "--project-root",
        type=Path,
        default=DEFAULT_PROJECT_ROOT,
        help=f"CorvusStar project root (default: {DEFAULT_PROJECT_ROOT}).",
    )
    parser.add_argument(
        "--autobot-dir",
        type=Path,
        default=DEFAULT_AUTOBOT_DIR,
        help=f"Working directory used when spawning Hermes (default: {DEFAULT_AUTOBOT_DIR}).",
    )
    parser.add_argument(
        "--command",
        default="hermes",
        help="Base executable to launch (default: hermes).",
    )
    parser.add_argument(
        "--command-arg",
        action="append",
        default=[],
        help=(
            "Extra command arguments. If omitted, the overseer uses `chat`, which preserves "
            "Hermes' interactive prompt behavior."
        ),
    )
    parser.add_argument(
        "--env",
        action="append",
        default=[],
        metavar="KEY=VALUE",
        help="Environment variables to inject into Hermes and checker processes.",
    )
    parser.add_argument(
        "--ready-regex",
        default=DEFAULT_READY_REGEX,
        help="Regex used to detect the Hermes ready prompt.",
    )
    parser.add_argument(
        "--done-regex",
        action="append",
        default=[],
        help="Additional completion regexes. In bead mode the overseer also injects a sentinel.",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=300.0,
        help="Hard timeout for each Hermes run in seconds (default: 300).",
    )
    parser.add_argument(
        "--startup-timeout",
        type=float,
        default=30.0,
        help="How long to wait for the first Hermes prompt in seconds (default: 30).",
    )
    parser.add_argument(
        "--grace-seconds",
        type=float,
        default=3.0,
        help="How long to wait after SIGTERM before SIGKILL (default: 3).",
    )
    parser.add_argument(
        "--no-stream",
        action="store_true",
        help="Suppress live relay of Hermes and checker stdout/stderr.",
    )

    parser.add_argument(
        "--bead-id",
        help="Canonical Hall bead id to claim or continue.",
    )
    parser.add_argument(
        "--claim-next",
        action="store_true",
        help="Claim the next actionable OPEN bead from the ledger.",
    )
    parser.add_argument(
        "--agent-id",
        default="AUTOBOT-OVERSEER",
        help="Agent id used when claiming beads (default: AUTOBOT-OVERSEER).",
    )
    parser.add_argument(
        "--max-attempts",
        type=int,
        default=3,
        help="Total Hermes attempts per bead before blocking it (default: 3).",
    )
    parser.add_argument(
        "--checker-shell",
        help=(
            "Shell command to validate AutoBot's work from the project root. "
            "Runs under `bash -lc` with CORVUS_* bead env vars available."
        ),
    )
    parser.add_argument(
        "--checker-timeout",
        type=float,
        default=300.0,
        help="Hard timeout for each checker run in seconds (default: 300).",
    )
    parser.add_argument(
        "--worker-note",
        help="Optional extra instruction appended to the bead prompt sent to Hermes.",
    )
    return parser


def validate_args(args: argparse.Namespace, parser: argparse.ArgumentParser) -> None:
    if args.claim_next and args.bead_id:
        parser.error("Use either --bead-id or --claim-next, not both.")
    if bead_mode_requested(args) and args.prompt:
        parser.error("Do not pass a one-off prompt when bead mode is enabled.")
    if not bead_mode_requested(args) and not args.prompt:
        parser.error("Provide a prompt, or enable bead mode with --bead-id/--claim-next.")
    if args.max_attempts < 1:
        parser.error("--max-attempts must be at least 1.")


def execute_autobot(
    project_root: Path | str,
    *,
    bead_id: str | None = None,
    claim_next: bool = False,
    autobot_dir: Path | str = DEFAULT_AUTOBOT_DIR,
    command: str = "hermes",
    command_args: Sequence[str] | None = None,
    env: dict[str, str] | None = None,
    ready_regex: str = DEFAULT_READY_REGEX,
    done_regexes: Sequence[str] | None = None,
    timeout: float = 300.0,
    startup_timeout: float = 30.0,
    grace_seconds: float = 3.0,
    no_stream: bool = False,
    agent_id: str = "AUTOBOT",
    max_attempts: int = 3,
    checker_shell: str | None = None,
    checker_timeout: float = 300.0,
    worker_note: str | None = None,
) -> AutoBotSkillResult:
    args = argparse.Namespace(
        prompt=None,
        project_root=Path(project_root),
        autobot_dir=Path(autobot_dir),
        command=command,
        command_arg=list(command_args or []),
        env=[],
        ready_regex=ready_regex,
        done_regex=list(done_regexes or []),
        timeout=timeout,
        startup_timeout=startup_timeout,
        grace_seconds=grace_seconds,
        no_stream=no_stream,
        bead_id=bead_id,
        claim_next=claim_next,
        agent_id=agent_id,
        max_attempts=max_attempts,
        checker_shell=checker_shell,
        checker_timeout=checker_timeout,
        worker_note=worker_note,
    )
    if max_attempts < 1:
        raise OverseerError("--max-attempts must be at least 1.")
    if not bead_id and not claim_next:
        raise OverseerError("execute_autobot requires --bead-id or claim_next=True.")
    return run_bead_mode(args, dict(env or {}))


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    validate_args(args, parser)

    try:
        base_env = parse_env_assignments(args.env)
    except ValueError as exc:
        parser.error(str(exc))

    try:
        if bead_mode_requested(args):
            result = run_bead_mode(args, base_env)
            return 0 if result.status == "SUCCESS" else 4
        return run_prompt_mode(args, base_env)
    except ReadyPromptTimeoutError as exc:
        print(f"[autobot] startup timeout: {exc}", file=sys.stderr)
        return 2
    except HardTimeoutError as exc:
        print(f"[autobot] hard timeout: {exc}", file=sys.stderr)
        return 2
    except LaunchError as exc:
        print(f"[autobot] launch failed: {exc}", file=sys.stderr)
        return 3
    except ProcessExitedError as exc:
        print(f"[autobot] process exited early: {exc}", file=sys.stderr)
        return 4
    except KeyboardInterrupt:
        print("[autobot] interrupted by user, active process groups were terminated.", file=sys.stderr)
        return 130
    except OverseerError as exc:
        print(f"[autobot] failure: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"[autobot] unexpected failure: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
