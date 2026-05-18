#!/usr/bin/env python3
"""
spoke-daemon.py — Persistent research agent daemon.
Uses 'script -c' to wrap hermes in a PTY for clean output capture.
Communicates via FIFO (JSON in), reports written to reports/.
"""
import sys, os, json, datetime, subprocess, signal, select, threading, errno, time, re, threading
from pathlib import Path
from typing import Optional

SPOKE = sys.argv[1] if len(sys.argv) > 1 else "unknown"
PROFILE = sys.argv[2] if len(sys.argv) > 2 else SPOKE
DAEMON_DIR = Path.home() / "Corvus" / SPOKE / ".hermes-daemon"
REPORTS_DIR = DAEMON_DIR / "reports"
STDIN_FIFO = DAEMON_DIR / "stdin.fifo"
SCRIPT_LOG = Path("/tmp") / f"hermes-{SPOKE}.txt"
DAEMON_DIR.mkdir(parents=True, exist_ok=True)
REPORTS_DIR.mkdir(parents=True, exist_ok=True)
LOG_FILE = DAEMON_DIR / "daemon.log"

ENV = {}
mk = os.environ.get("MINIMAX_API_KEY", "")
if not mk:
    for line in (Path.home() / ".hermes" / ".env").read_text().splitlines():
        if line.startswith("MINIMAX_API_KEY="):
            mk = line.split("=", 1)[1].strip()
            break
if mk:
    ENV["MINIMAX_API_KEY"] = mk

running = True


def log(msg: str):
    ts = datetime.datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
    line = f"[{ts}] [{SPOKE}] {msg}"
    print(line, flush=True)
    LOG_FILE.write_text(LOG_FILE.read_text() + line + "\n")


def hermes_invoke(prompt: str, timeout: int = 120) -> str:
    """Run hermes via 'script -c' for clean PTY capture. Returns response text."""
    log(f"Invoking hermes: {prompt[:60]}")

    if SCRIPT_LOG.exists():
        SCRIPT_LOG.unlink()

    proc_env = {**os.environ, **ENV}

    # Build the hermes command
    hermes_cmd = (
        f"hermes --profile {PROFILE} --provider minimax --model MiniMax-M2.5 chat -Q"
    )

    # Use script -c to get PTY capture
    proc = subprocess.Popen(
        ["script", "-q", str(SCRIPT_LOG), "-c", hermes_cmd],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        env=proc_env,
    )

    # Wait for hermes to fully initialize (banner + prompt marker)
    time.sleep(6)

    # Send prompt and close stdin so hermes knows input is done
    try:
        proc.stdin.write(prompt.encode() + b"\n")
        proc.stdin.flush()
        proc.stdin.close()
    except BrokenPipeError:
        pass

    # Wait for completion
    try:
        proc.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        proc.terminate()
        proc.wait(timeout=5)
        log("Hermes timed out")

    # Read and parse the typescript
    if not SCRIPT_LOG.exists():
        return "[no output]"

    raw = SCRIPT_LOG.read_text()

    # Remove the script header/footer lines
    lines = raw.split("\n")
    result_parts = []
    in_result = False
    in_fallback = False

    for line in lines:
        # Strip ANSI escapes
        clean = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', line).strip()
        # Stop at script protocol markers
        if line.startswith("Script started") or line.startswith("Script done"):
            continue
        if "<not executed on terminal>" in line or "COMMAND=" in line:
            continue
        if "[COMMAND_EXIT_CODE=" in line:
            continue
        # Stop at session footer
        if clean.startswith("Session:") or clean.startswith("Resume this"):
            break
        if not clean:
            continue
        # Skip pure box-drawing lines
        if all(c in "─│╭╰╮╯▒░ ▏▁" for c in clean):
            continue
        # Skip Hermes box border lines
        if clean.startswith("╭─") or clean.startswith("╰─") or clean.startswith("│"):
            continue
        # Accumulate content
        result_parts.append(clean)

    result = " ".join(result_parts).strip()
    result = re.sub(r'\s+', ' ', result)  # collapse whitespace
    log(f"Response: {len(result)} chars")
    return result[:2000]


def handle_start(payload):
    topic = payload.get("topic", "")
    rounds = min(payload.get("rounds", 1), 3)
    log(f"Task: topic={topic} rounds={rounds}")

    # Send system context first
    startup = f"""You are a research agent for {SPOKE}.
Return findings as JSON: {{"findings": ["finding1", "finding2"], "skills_written": []}}
Confirm ready."""
    resp = hermes_invoke(startup, timeout=90)
    log(f"Startup response: {len(resp)} chars")
    time.sleep(2)

    findings = []
    for i in range(rounds):
        resp = hermes_invoke(f"Research: {topic} — round {i+1}/{rounds}", timeout=120)
        findings.append(resp[:800])
        log(f"Round {i+1} done, {len(resp)} chars")
        time.sleep(2)

    report = {
        "type": "report",
        "payload": {
            "topic": topic,
            "content": "\n".join(findings)[:3000],
            "skills_written": [],
            "findings": findings
        }
    }
    date = datetime.date.today().isoformat()
    (REPORTS_DIR / f"{SPOKE}-{date}.json").write_text(json.dumps(report, indent=2))
    (REPORTS_DIR / f"report-{date}.md").write_text(
        f"# {SPOKE.title()} Research — {date}\n\n## {topic}\n\n" +
        "\n\n".join(f"### Finding {i+1}\n{f}" for i, f in enumerate(findings))
    )
    wiki_dir = Path.home() / "wiki" / "queries"
    wiki_dir.mkdir(parents=True, exist_ok=True)
    (wiki_dir / f"{SPOKE}-daily-{date}.md").write_text(
        f"# {SPOKE.title()} Daily — {date}\n\n## {topic}\n\n" + "\n\n".join(findings)
    )
    log(f"OUT: report with {len(findings)} findings written")


HANDLERS = {
    "start": handle_start,
    "stop": lambda _: (log("Stop"), globals().__setitem__("running", False)),
}


def signal_handler(sig, frame):
    global running
    log(f"Signal {sig}")
    running = False


def main():
    global running
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)
    log(f"Daemon starting — spoke={SPOKE} profile={PROFILE}")

    if not STDIN_FIFO.exists():
        os.mkfifo(STDIN_FIFO)
    fifo_fd = os.open(str(STDIN_FIFO), os.O_RDONLY)
    os.set_blocking(fifo_fd, False)
    log(f"Listening on FIFO: {STDIN_FIFO}")

    while running:
        ready, _, _ = select.select([fifo_fd], [], [], 5.0)
        if not ready:
            continue

        try:
            buf = os.read(fifo_fd, 4096)
        except OSError as e:
            if e.errno == errno.EWOULDBLOCK:
                continue
            log(f"FIFO read error: {e}")
            break

        if not buf:
            continue

        line = buf.decode().strip()
        if not line:
            continue

        log(f"IN: {line[:200]}")

        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            log(f"Invalid JSON: {line[:100]}")
            continue

        handler = HANDLERS.get(msg.get("type", ""))
        if handler:
            try:
                handler(msg.get("payload", {}))
            except Exception as e:
                log(f"Handler error: {e}")
        else:
            log(f"Unknown: {msg.get('type', '')}")

    os.close(fifo_fd)
    log("Daemon stopped")


if __name__ == "__main__":
    main()