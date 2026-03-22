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
from src.core.engine.sovereign_worker import SovereignWorker
from src.core.engine.validation_result import (
    ValidationCheck,
    create_validation_result,
    save_validation_result,
)

DEFAULT_PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_AUTOBOT_DIR = Path("/home/morderith/Corvus/AutoBot")
DEFAULT_SOVEREIGN_MODEL = "deepseek"
DEFAULT_SOVEREIGN_BASE_URL = "http://localhost:11434/v1"
DEFAULT_SOVEREIGN_API_KEY = "sk-dummy-string"
DEFAULT_READY_REGEX = r"(?:^|\n)\s*❯\s*$"
TAIL_LIMIT = 64_000
OUTPUT_LIMIT = 200_000
TRANSCRIPT_LIMIT = 500_000
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


class QueryCommandError(OverseerError):
    """Raised when Hermes single-query execution fails after launching."""

    def __init__(self, message: str, *, command_result: CommandResult) -> None:
        super().__init__(message)
        self.command_result = command_result


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


@dataclass(slots=True)
class AttemptArtifact:
    attempt: int
    prompt_path: str
    transcript_path: str
    metadata_path: str
    transcript_excerpt: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "attempt": self.attempt,
            "prompt_path": self.prompt_path,
            "transcript_path": self.transcript_path,
            "metadata_path": self.metadata_path,
            "transcript_excerpt": self.transcript_excerpt,
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
        self.transcript = ""

    def run(self, task_prompt: str, *, done_regexes: Sequence[str], extra_env: dict[str, str] | None = None) -> RunResult:
        self.process = None
        self.master_fd = None
        self.decoder = codecs.getincrementaldecoder(self.encoding)(errors="replace")
        self.tail = ""
        self.transcript = ""

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
        self.transcript = append_capped(self.transcript, text, limit=TRANSCRIPT_LIMIT)

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

    def transcript_text(self) -> str:
        return self.transcript

    def transcript_excerpt(self, limit: int = 2_000) -> str:
        normalized = normalize_terminal_text(self.transcript).strip()
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


def run_preflight_checker(
    *,
    project_root: Path,
    bead_id: str,
    checker_shell: str,
    timeout_seconds: float,
    grace_seconds: float,
    stream_output: bool,
    extra_env: dict[str, str] | None = None,
    encoding: str = "utf-8",
) -> CommandResult | None:
    """Run the bead checker once before any Hermes attempt."""
    if not checker_shell:
        return None

    checker_env = dict(extra_env or {})
    checker_env["CORVUS_PROJECT_ROOT"] = str(project_root)
    checker_env["CORVUS_BEAD_ID"] = bead_id
    return run_command_capture(
        ["bash", "-lc", checker_shell],
        cwd=project_root,
        timeout_seconds=timeout_seconds,
        grace_seconds=grace_seconds,
        stream_output=stream_output,
        extra_env=checker_env,
        encoding=encoding,
    )


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


def default_hermes_command(autobot_dir: Path) -> str:
    candidates = [
        autobot_dir / "hermes-agent" / ".venv" / "bin" / "hermes",
        autobot_dir / "hermes-agent" / ".venv" / "Scripts" / "hermes.exe",
        autobot_dir / "hermes-agent" / "hermes",
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)
    return str(candidates[0])


def default_hermes_command_args() -> list[str]:
    return ["chat", "-m", DEFAULT_HERMES_MODEL]


def build_command(command: str | None, command_args: Sequence[str], *, autobot_dir: Path) -> list[str]:
    resolved_command = command.strip() if isinstance(command, str) else ""
    if not resolved_command:
        resolved_command = default_hermes_command(autobot_dir)
    if command_args:
        return [resolved_command, *command_args]
    return [resolved_command, *default_hermes_command_args()]


def build_bead_command(
    command: str | None,
    command_args: Sequence[str],
    *,
    autobot_dir: Path,
    task_prompt: str,
) -> list[str]:
    resolved = build_command(command, command_args, autobot_dir=autobot_dir)
    if not any(item in {"-q", "--query"} or item.startswith("--query=") for item in resolved):
        resolved.extend(["-q", task_prompt])
    if not any(item in {"-Q", "--quiet"} for item in resolved):
        resolved.append("-Q")
    return resolved


def build_base_env(env: dict[str, str] | None = None) -> dict[str, str]:
    merged = {
        "OPENAI_BASE_URL": DEFAULT_HERMES_BASE_URL,
        "OPENAI_API_KEY": DEFAULT_HERMES_API_KEY,
    }
    merged.update(env or {})
    return merged


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


def iter_preflight_paths(project_root: Path, bead: SovereignBead) -> list[Path]:
    paths: list[Path] = []
    seen: set[Path] = set()

    for candidate in [bead.target_path, *bead.contract_refs]:
        value = str(candidate or "").strip()
        if not value:
            continue
        if ":" in value and not value.startswith(("./", "../")) and not os.path.isabs(value):
            continue

        path = Path(value)
        resolved = path if path.is_absolute() else (project_root / path)
        normalized = resolved.resolve()
        try:
            normalized.relative_to(project_root.resolve())
        except ValueError:
            continue
        if normalized in seen:
            continue
        seen.add(normalized)
        paths.append(normalized)

    return paths


def has_post_bead_file_activity(project_root: Path, bead: SovereignBead) -> bool:
    bead_created_ms = bead.created_at
    for candidate in iter_preflight_paths(project_root, bead):
        if not candidate.exists():
            continue
        modified_ms = candidate.stat().st_mtime_ns / 1_000_000
        if modified_ms >= bead_created_ms:
            return True
    return False


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
    bounded_worker_note = compact_prompt_text(worker_note, limit=WORKER_NOTE_LIMIT)
    lines = [
        "CorvusStar is orchestrating bead lifecycle. SovereignWorker is the native worker doing the implementation.",
        "SovereignWorker has a 32k context window and directly executes CStar skills.",
        f"Project root to edit: {project_root}",
        f"Bead ID: {bead.id}",
        f"Attempt: {attempt}",
    ]

    if bounded_worker_note:
        lines.append("Authoritative Hall/PennyOne brief:")
        lines.append(bounded_worker_note)
    else:
        target_path = bead.target_path or bead.target_ref or "<unspecified>"
        rationale = compact_prompt_text(bead.rationale, limit=PROMPT_FIELD_LIMIT) or "<none>"
        acceptance_criteria = compact_prompt_text(bead.acceptance_criteria, limit=PROMPT_FIELD_LIMIT)
        baseline_scores = compact_prompt_text(
            json.dumps(bead.baseline_scores, sort_keys=True) if bead.baseline_scores else "",
            limit=PROMPT_BASELINE_LIMIT,
        )
        lines.extend(
            [
                f"Target path: {target_path}",
                f"Rationale: {rationale}",
            ]
        )
        if bead.contract_refs:
            contract_refs = compact_prompt_text(", ".join(bead.contract_refs), limit=PROMPT_FIELD_LIMIT)
            if contract_refs:
                lines.append(f"Contract refs: {contract_refs}")
        if acceptance_criteria:
            lines.append(f"Acceptance criteria: {acceptance_criteria}")
        if baseline_scores:
            lines.append(f"Baseline scores: {baseline_scores}")
    if retry_feedback:
        lines.append("Previous validation feedback:")
        lines.append(retry_feedback)

    lines.extend(
        [
            "Execution requirements:",
            "1. Treat this as a bounded bead. Stay on the target path and only inspect directly adjacent files when required.",
            "2. If an Authoritative Hall/PennyOne brief block is present, treat it as the authoritative non-local context budget.",
            "3. Make the smallest complete change that satisfies the bead.",
            "4. Save every edited file under the project root above.",
            "5. Do not stop at analysis or a plan.",
            "6. Do not invent imports, files, commands, or dependencies. If something is not already present or directly verified, do not rely on it.",
            f"7. When finished, print exactly this line on its own: {done_sentinel}",
        ]
    )
    return "\n".join(lines)


def build_retry_feedback(header: str, details: str) -> str:
    cleaned = normalize_terminal_text(details).strip()
    if len(cleaned) > RETRY_FEEDBACK_LIMIT:
        cleaned = cleaned[-RETRY_FEEDBACK_LIMIT:]
    return f"{header}\n{cleaned or '<no details available>'}"


def run_bead_query(
    command: Sequence[str],
    *,
    cwd: Path,
    timeout_seconds: float,
    grace_seconds: float,
    stream_output: bool,
    extra_env: dict[str, str],
    done_regexes: Sequence[str],
) -> tuple[RunResult, CommandResult]:
    command_result = run_command_capture(
        command,
        cwd=cwd,
        timeout_seconds=timeout_seconds,
        grace_seconds=grace_seconds,
        stream_output=stream_output,
        extra_env=extra_env,
    )

    excerpt = command_result.excerpt()
    if command_result.timed_out:
        raise QueryCommandError(
            f"Hermes single-query command exceeded the hard timeout of {timeout_seconds:.1f} seconds.\n"
            f"Recent output:\n{excerpt}",
            command_result=command_result,
        )
    if command_result.returncode != 0:
        raise QueryCommandError(
            "Hermes single-query command exited before completion.\n"
            f"Return code: {command_result.returncode}\n"
            f"Recent output:\n{excerpt}",
            command_result=command_result,
        )

    normalized_output = normalize_terminal_text(command_result.output)
    matched_pattern: str | None = None
    for pattern in done_regexes:
        if re.compile(pattern, re.MULTILINE).search(normalized_output):
            matched_pattern = pattern
            break

    reason = (
        f"matched completion pattern: {matched_pattern}"
        if matched_pattern is not None
        else "Hermes single-query run exited cleanly"
    )
    return (
        RunResult(
            success=True,
            reason=reason,
            matched_pattern=matched_pattern,
            returncode=command_result.returncode,
            elapsed_seconds=command_result.elapsed_seconds,
        ),
        command_result,
    )


def _safe_artifact_fragment(value: str, fallback: str) -> str:
    normalized = re.sub(r"[^A-Za-z0-9._-]+", "_", value.strip())
    normalized = normalized.strip("._-")
    return normalized or fallback


def _relative_to_root(path: Path, project_root: Path) -> str:
    try:
        return str(path.relative_to(project_root))
    except ValueError:
        return str(path)


def _redact_env(env: dict[str, str]) -> dict[str, str]:
    redacted: dict[str, str] = {}
    for key, value in env.items():
        if key.upper().endswith("API_KEY") or key.upper().endswith("TOKEN"):
            redacted[key] = "<redacted>"
        else:
            redacted[key] = value
    return redacted


def _redact_command(command: Sequence[str]) -> list[str]:
    redacted: list[str] = []
    skip_query_value = False
    for item in command:
        if skip_query_value:
            redacted.append("<prompt omitted>")
            skip_query_value = False
            continue
        if item in {"-q", "--query"}:
            redacted.append(item)
            skip_query_value = True
            continue
        if item.startswith("--query="):
            redacted.append("--query=<prompt omitted>")
            continue
        redacted.append(item)
    return redacted


def persist_attempt_artifact(
    *,
    project_root: Path,
    bead: SovereignBead,
    attempt: int,
    task_prompt: str,
    transcript_text: str,
    command: Sequence[str],
    extra_env: dict[str, str],
    status: str,
    detail: str,
    matched_pattern: str | None,
    returncode: int | None,
    elapsed_seconds: float | None,
) -> AttemptArtifact:
    diagnostics_root = project_root / ".stats" / "autobot" / _safe_artifact_fragment(bead.id, "bead")
    diagnostics_root.mkdir(parents=True, exist_ok=True)

    attempt_prefix = f"attempt-{attempt:03d}"
    prompt_path = diagnostics_root / f"{attempt_prefix}.prompt.txt"
    transcript_path = diagnostics_root / f"{attempt_prefix}.transcript.txt"
    metadata_path = diagnostics_root / f"{attempt_prefix}.json"

    normalized_transcript = normalize_terminal_text(transcript_text)
    prompt_path.write_text(task_prompt, encoding="utf-8")
    transcript_path.write_text(normalized_transcript, encoding="utf-8")
    metadata_path.write_text(
        json.dumps(
            {
                "bead_id": bead.id,
                "attempt": attempt,
                "status": status,
                "detail": detail,
                "matched_pattern": matched_pattern,
                "returncode": returncode,
                "elapsed_seconds": elapsed_seconds,
                "command": _redact_command(command),
                "target_path": bead.target_path,
                "env": _redact_env(extra_env),
                "prompt_path": _relative_to_root(prompt_path, project_root),
                "transcript_path": _relative_to_root(transcript_path, project_root),
                "transcript_excerpt": compact_prompt_text(normalized_transcript, limit=2_000),
                "created_at": int(time.time() * 1000),
            },
            indent=2,
            sort_keys=True,
        ),
        encoding="utf-8",
    )

    return AttemptArtifact(
        attempt=attempt,
        prompt_path=_relative_to_root(prompt_path, project_root),
        transcript_path=_relative_to_root(transcript_path, project_root),
        metadata_path=_relative_to_root(metadata_path, project_root),
        transcript_excerpt=compact_prompt_text(normalized_transcript, limit=2_000) or "<no output captured>",
    )


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

    if bead.status in {"SET", "OPEN"}:
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
        f"Bead {bead.id} is in status {bead.status}; only SET, OPEN, or IN_PROGRESS beads can be worked."
    )


def persist_checker_validation(
    *,
    project_root: Path,
    bead: SovereignBead,
    attempt: int,
    checker_shell: str,
    checker_result: CommandResult,
    hermes_result: RunResult | None,
) -> str:
    status = "PASS" if checker_result.succeeded else "FAIL"
    timeout_note = " Checker timed out." if checker_result.timed_out else ""
    stage = "preflight checker" if hermes_result is None else "checker"
    summary = (
        f"AutoBot {stage} accepted bead {bead.id} on attempt {attempt}."
        if checker_result.succeeded
        else f"AutoBot {stage} rejected bead {bead.id} on attempt {attempt}.{timeout_note}"
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
            "preflight": hermes_result is None,
            "checker_shell": checker_shell,
            "checker_returncode": checker_result.returncode,
            "checker_timed_out": checker_result.timed_out,
            "hermes_reason": None if hermes_result is None else hermes_result.reason,
            "hermes_match": None if hermes_result is None else hermes_result.matched_pattern,
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
        command=build_command(args.command, args.command_arg, autobot_dir=args.autobot_dir),
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
        print("[autobot] no actionable SET/OPEN beads were available.", file=sys.stderr)
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
    attempt_artifacts: list[AttemptArtifact] = []

    # Preflight checker short-circuit: only a successful preflight resolves early.
    if args.checker_shell:
        print(f"[autobot] running preflight checker for bead {bead.id}.", file=sys.stderr)
        preflight_env = dict(base_env)
        preflight_env["CORVUS_BEAD_ID"] = bead.id
        preflight_env["CORVUS_PROJECT_ROOT"] = str(args.project_root)

        preflight_result = run_preflight_checker(
            project_root=args.project_root,
            bead_id=bead.id,
            checker_shell=args.checker_shell,
            timeout_seconds=args.checker_timeout,
            grace_seconds=args.grace_seconds,
            stream_output=not args.no_stream,
            extra_env=preflight_env,
        )

        if preflight_result is not None and preflight_result.succeeded and has_post_bead_file_activity(args.project_root, bead):
            validation_id = persist_checker_validation(
                project_root=args.project_root,
                bead=bead,
                attempt=0,
                checker_shell=args.checker_shell,
                checker_result=preflight_result,
                hermes_result=None,
            )
            finalize_success(ledger, bead, 0, validation_id=validation_id)
            print(
                f"[autobot] bead {bead.id} resolved via preflight validation {validation_id} (attempt_count=0).",
                file=sys.stderr,
            )
            resolved_bead = ledger.get_bead(bead.id)
            return AutoBotSkillResult(
                status="SUCCESS",
                outcome="RESOLVED_PREFLIGHT",
                summary=f"AutoBot resolved bead {bead.id} via preflight validation {validation_id}.",
                bead_id=bead.id,
                target_path=bead.target_path,
                claimed=claimed_now,
                attempt_count=0,
                max_attempts=args.max_attempts,
                final_bead_status=None if resolved_bead is None else resolved_bead.status,
                validation_id=validation_id,
                metadata={
                    "agent_id": args.agent_id,
                    "checker_shell": args.checker_shell,
                    "checker_returncode": preflight_result.returncode,
                    "hermes_reason": None,
                    "matched_pattern": None,
                    "attempt_artifacts": [],
                },
            )
        if preflight_result is not None and preflight_result.succeeded:
            print(
                (
                    f"[autobot] preflight checker passed for bead {bead.id}, "
                    "but no target or contract files changed after bead creation; continuing into Hermes."
                ),
                file=sys.stderr,
            )
        elif preflight_result is not None:
            failure_reason = "timed out" if preflight_result.timed_out else "did not pass"
            print(
                (
                    f"[autobot] preflight checker {failure_reason} for bead {bead.id}; "
                    "continuing into Hermes."
                ),
                file=sys.stderr,
            )

    for attempt in range(1, args.max_attempts + 1):
        done_sentinel = build_done_sentinel(bead, attempt)
        bead_env = build_bead_env(args.project_root, bead, attempt)
        bead_env.update(base_env)

        print(
            f"[autobot] AutoBot attempt {attempt}/{args.max_attempts} for bead {bead.id}.",
            file=sys.stderr,
        )
        task_prompt = build_bead_prompt(
            project_root=args.project_root,
            bead=bead,
            attempt=attempt,
            done_sentinel=done_sentinel,
            retry_feedback=retry_feedback,
            worker_note=args.worker_note,
        )
        bead_command = build_bead_command(
            args.command,
            args.command_arg,
            autobot_dir=args.autobot_dir,
            task_prompt=task_prompt,
        )
        try:
            # PIVOT: Using CStar-native SovereignWorker instead of Hermes CLI
            worker = SovereignWorker(
                project_root=args.project_root,
                model=DEFAULT_HERMES_MODEL,
                base_url=DEFAULT_HERMES_BASE_URL,
                max_turns=10
            )
            
            system_prompt = (
                "You are a CStar Sovereign Worker. Your goal is to complete the user's task by using tools.\n"
                "You MUST use tools via XML: <invoke name='tool_name'><arg_name>value</arg_name></invoke>.\n"
                "Available tools: read_file, write_file, run_shell_command, list_directory.\n"
                "Think in <thought> tags before acting.\n"
                "When finished, summarize your work and end with the word DONE."
            )
            
            start_time = time.time()
            transcript = worker.run(system_prompt, task_prompt)
            elapsed = time.time() - start_time
            
            hermes_result = RunResult(
                success=True,
                reason="SovereignWorker completed task loop.",
                matched_pattern="DONE",
                returncode=0,
                elapsed_seconds=elapsed
            )
            
            command_result = CommandResult(
                command=["sovereign_worker", "--project-root", str(args.project_root)],
                returncode=0,
                timed_out=False,
                elapsed_seconds=elapsed,
                output=transcript
            )
            
            artifact = persist_attempt_artifact(
                project_root=args.project_root,
                bead=bead,
                attempt=attempt,
                task_prompt=task_prompt,
                transcript_text=command_result.output,
                command=command_result.command,
                extra_env=bead_env,
                status="SUCCESS",
                detail=hermes_result.reason,
                matched_pattern=hermes_result.matched_pattern,
                returncode=hermes_result.returncode,
                elapsed_seconds=hermes_result.elapsed_seconds,
            )
            attempt_artifacts.append(artifact)
        except OverseerError as exc:
            failed_command = bead_command
            failed_transcript = ""
            failed_returncode: int | None = None
            failed_elapsed_seconds: float | None = None
            if isinstance(exc, QueryCommandError):
                failed_command = exc.command_result.command
                failed_transcript = exc.command_result.output
                failed_returncode = exc.command_result.returncode
                failed_elapsed_seconds = exc.command_result.elapsed_seconds
            artifact = persist_attempt_artifact(
                project_root=args.project_root,
                bead=bead,
                attempt=attempt,
                task_prompt=task_prompt,
                transcript_text=failed_transcript,
                command=failed_command,
                extra_env=bead_env,
                status="FAILURE",
                detail=str(exc),
                matched_pattern=None,
                returncode=failed_returncode,
                elapsed_seconds=failed_elapsed_seconds,
            )
            attempt_artifacts.append(artifact)
            failure_text = (
                f"{exc}\n"
                f"Diagnostic transcript: {artifact.transcript_path}\n"
                f"Diagnostic metadata: {artifact.metadata_path}"
            )
            print(f"[autobot] AutoBot attempt {attempt} failed: {failure_text}", file=sys.stderr)
            if attempt >= args.max_attempts:
                failure_summary = (
                    f"AutoBot failed to complete bead {bead.id} after {attempt} attempts. "
                    f"See {artifact.transcript_path}."
                )
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
                    summary=failure_summary,
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
                        "attempt_artifacts": [item.to_dict() for item in attempt_artifacts],
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
                    "attempt_artifacts": [item.to_dict() for item in attempt_artifacts],
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
                    "attempt_artifacts": [item.to_dict() for item in attempt_artifacts],
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
            failure_summary = (
                f"Checker rejected AutoBot output for bead {bead.id} after {attempt} attempts. "
                f"See {attempt_artifacts[-1].transcript_path}."
            )
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
                summary=failure_summary,
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
                    "attempt_artifacts": [item.to_dict() for item in attempt_artifacts],
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
        default=None,
        help=(
            "Base executable to launch. If omitted, the overseer uses the local Hermes binary "
            "under <autobot-dir>/hermes-agent/.venv/bin/hermes."
        ),
    )
    parser.add_argument(
        "--command-arg",
        action="append",
        default=[],
        help=(
            f"Extra command arguments. If omitted, the overseer uses "
            f"`{' '.join(default_hermes_command_args())}`."
        ),
    )
    parser.add_argument(
        "--env",
        action="append",
        default=[],
        metavar="KEY=VALUE",
        help=(
            "Environment variables to inject into Hermes and checker processes. Explicit values "
            "override the local-model defaults for OPENAI_BASE_URL and OPENAI_API_KEY."
        ),
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
    command: str | None = None,
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
    return run_bead_mode(args, build_base_env(env))


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    validate_args(args, parser)

    try:
        base_env = build_base_env(parse_env_assignments(args.env))
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
