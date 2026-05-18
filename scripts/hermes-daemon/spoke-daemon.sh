#!/usr/bin/env bash
set -euo pipefail

SPOKE="$1"
PROFILE="$2"
DAEMON_DIR="$HOME/Corvus/${SPOKE}/.hermes-daemon"
LOG="$DAEMON_DIR/daemon.log"
PIPE_IN="$DAEMON_DIR/stdin.fifo"
REPORTS_DIR="$DAEMON_DIR/reports"

mkdir -p "$DAEMON_DIR/reports"
exec > >(tee -a "$LOG")
exec 2>&1

log() {
  echo "[$(date '+%Y-%m-%dT%H:%M:%S')] [$SPOKE] $*" >> "$LOG"
  echo "[$(date '+%Y-%m-%dT%H:%M:%S')] [$SPOKE] $*"
}

log "Daemon starting — spoke=$SPOKE profile=$PROFILE"

# Load MINIMAX_API_KEY so profile can authenticate
if [ -f "$HOME/.hermes/.env" ]; then
  export $(grep MINIMAX_API_KEY "$HOME/.hermes/.env" | cut -d= -f1)=$(grep MINIMAX_API_KEY "$HOME/.hermes/.env" | cut -d= -f2)
fi

# Create FIFO for stdin from Corvus
if [ ! -p "$PIPE_IN" ]; then
  mkfifo "$PIPE_IN"
fi

log "Entering message pump — waiting for Corvus messages..."

while true; do
  # Check for stop signal file
  if [ -f "$DAEMON_DIR/stop" ]; then
    log "Stop signal received. Exiting."
    rm -f "$DAEMON_DIR/stop"
    break
  fi

  # Read one JSON message (blocking on FIFO)
  if ! msg=$(cat "$PIPE_IN" 2>/dev/null); then
    log "FIFO read failed. Exiting."
    break
  fi

  if [ -z "$msg" ]; then
    sleep 1
    continue
  fi

  log "IN: $msg"

  # Parse message type with python
  msg_type=$(echo "$msg" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('type',''))" 2>/dev/null || echo "")

  case "$msg_type" in
    start)
      topic=$(echo "$msg" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('payload',{}).get('topic',''))" 2>/dev/null || echo "")
      rounds=$(echo "$msg" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('payload',{}).get('rounds',3))" 2>/dev/null || echo "3")
      lanes=$(echo "$msg" | python3 -c "import sys,json; d=json.load(sys.stdin); print(','.join(d.get('payload',{}).get('lanes',[])))" 2>/dev/null || echo "")

      log "Task: topic=$topic rounds=$rounds lanes=$lanes"

      # Build research prompt
      read -r -d '' research_prompt << 'END_TASK'
## Research Task

You are the research daemon for this spoke. Your role:
- Research your lane(s) actively using available tools (web search, X API, file reads)
- Develop new skills based on patterns you discover; write them to your skills directory
- Keep a running research log in .hermes-daemon/reports/
- When Corvus sends you a research task, think through it, execute thoroughly, and report findings
- You can write skills: save them to your profile's skills/ directory with proper YAML frontmatter
- Stay within your spoke's domain; flag out-of-scope topics but don't pursue them without approval

Topic: %TOPIC%
Lane(s): %LANES%
Rounds available: %ROUNDS%

Work through this research task. Be thorough — search multiple sources, evaluate quality, identify patterns, and synthesize findings. Write any new skills you discover to your skills directory. Produce a detailed research report.

When done, output your report as a JSON structure on a single line:
{"type":"report","payload":{"topic":"%TOPIC%","content":"YOUR REPORT CONTENT HERE","skills_written":["skill-name-if-any"],"findings":["finding1","finding2"]}}
END_TASK

      # Substitute variables
      research_prompt="${research_prompt//\%TOPIC\%/$topic}"
      research_prompt="${research_prompt//\%LANES%/$lanes}"
      research_prompt="${research_prompt//\%ROUNDS%/$rounds}"

      # Execute research via hermes chat
      output=$(echo "$research_prompt" | hermes --profile "$PROFILE" --provider minimax --model MiniMax-M2.5 chat 2>> "$DAEMON_DIR/hermes.log")
      exit_code=$?

      if [ $exit_code -ne 0 ]; then
        log "Hermes exited with code $exit_code"
        output="[hermes error: exit $exit_code]"
      fi

      # Extract JSON report line from output
      report_json=$(echo "$output" | grep -o '{.*"type":"report".*}' | tail -1 2>/dev/null || echo "")

      if [ -z "$report_json" ]; then
        content=$(echo "$output" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))" 2>/dev/null || echo '"[no output]"')
        report_json=$(python3 -c "import sys,json; print(json.dumps({'type':'report','payload':{'topic':'$topic','content':$content,'skills_written':[],'findings':[]}}))" 2>/dev/null || echo '{"type":"report","payload":{"topic":"'$topic'","content":"error","skills_written":[],"findings":[]}}')
      fi

      log "OUT: $report_json"
      echo "$report_json" >> "$LOG"
      echo "$report_json"
      ;;

    stop)
      log "Received stop from Corvus."
      echo '{"type":"stopped","payload":{}}'
      break
      ;;

    ping)
      echo "{\"type\":\"pong\",\"payload\":{\"spoke\":\"$SPOKE\"}}"
      ;;

    *)
      log "Unknown message type: $msg_type"
      echo "{\"type\":\"error\",\"payload\":{\"reason\":\"unknown message type: $msg_type\"}}"
      ;;
  esac
done

log "Daemon exit."