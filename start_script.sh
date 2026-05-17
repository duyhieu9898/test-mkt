#!/usr/bin/env bash
#
# 1Person AI - Start/Stop script for backend (API) & frontend (Web)
#
# Usage:
#   ./start_script.sh start     # Start both backend & frontend
#   ./start_script.sh stop      # Stop both
#   ./start_script.sh restart   # Stop, then start
#   ./start_script.sh status    # Show running status
#   ./start_script.sh logs      # Tail both logs (Ctrl+C to exit)
#   ./start_script.sh logs api  # Tail API log only
#   ./start_script.sh logs web  # Tail Web log only
#
# Ports (override by exporting before running, or edit .env):
#   API_PORT=8004
#   WEB_PORT=3004

set -u

# ---------- Resolve project root ----------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ---------- Load .env if present (without overriding shell env) ----------
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$SCRIPT_DIR/.env"
  set +a
fi

# ---------- Defaults ----------
API_PORT="${API_PORT:-8004}"
WEB_PORT="${WEB_PORT:-3004}"

LOG_DIR="$SCRIPT_DIR/.logs"
PID_DIR="$SCRIPT_DIR/.pids"
mkdir -p "$LOG_DIR" "$PID_DIR"

API_LOG="$LOG_DIR/api.log"
WEB_LOG="$LOG_DIR/web.log"
API_PID_FILE="$PID_DIR/api.pid"
WEB_PID_FILE="$PID_DIR/web.pid"

# ---------- Colors ----------
if [ -t 1 ]; then
  C_RESET="\033[0m"
  C_GREEN="\033[32m"
  C_RED="\033[31m"
  C_YELLOW="\033[33m"
  C_CYAN="\033[36m"
  C_BOLD="\033[1m"
else
  C_RESET=""; C_GREEN=""; C_RED=""; C_YELLOW=""; C_CYAN=""; C_BOLD=""
fi

log()  { printf "${C_CYAN}[1person]${C_RESET} %s\n" "$*"; }
ok()   { printf "${C_GREEN}[ok]${C_RESET}      %s\n" "$*"; }
warn() { printf "${C_YELLOW}[warn]${C_RESET}    %s\n" "$*"; }
err()  { printf "${C_RED}[error]${C_RESET}   %s\n" "$*" >&2; }

# ---------- Helpers ----------
port_in_use() {
  # returns 0 if port has a listener
  lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

pid_on_port() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null | head -n 1
}

is_running() {
  local pid_file="$1"
  [ -f "$pid_file" ] || return 1
  local pid
  pid="$(cat "$pid_file" 2>/dev/null)"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

free_port() {
  local port="$1"
  local label="$2"
  if port_in_use "$port"; then
    local pid
    pid="$(pid_on_port "$port")"
    warn "$label port $port already in use by PID $pid — killing it"
    kill "$pid" 2>/dev/null || true
    sleep 1
    if port_in_use "$port"; then
      warn "PID $pid still alive — sending SIGKILL"
      kill -9 "$pid" 2>/dev/null || true
      sleep 1
    fi
  fi
}

require_pnpm() {
  if ! command -v pnpm >/dev/null 2>&1; then
    err "pnpm not found in PATH. Install it first: npm i -g pnpm"
    exit 1
  fi
}

# ---------- Commands ----------
start_api() {
  if is_running "$API_PID_FILE"; then
    warn "Backend (API) already running with PID $(cat "$API_PID_FILE")"
    return 0
  fi
  free_port "$API_PORT" "Backend"

  log "Starting backend (API) on port $API_PORT — log: $API_LOG"
  (
    cd "$SCRIPT_DIR"
    API_PORT="$API_PORT" nohup pnpm --filter @1person/api dev \
      >"$API_LOG" 2>&1 &
    echo $! >"$API_PID_FILE"
  )
  sleep 1
  if is_running "$API_PID_FILE"; then
    ok "Backend started (PID $(cat "$API_PID_FILE")) → http://localhost:$API_PORT"
  else
    err "Backend failed to start — see $API_LOG"
    return 1
  fi
}

start_web() {
  if is_running "$WEB_PID_FILE"; then
    warn "Frontend (Web) already running with PID $(cat "$WEB_PID_FILE")"
    return 0
  fi
  free_port "$WEB_PORT" "Frontend"

  log "Starting frontend (Web) on port $WEB_PORT — log: $WEB_LOG"
  (
    cd "$SCRIPT_DIR"
    WEB_PORT="$WEB_PORT" nohup pnpm --filter @1person/web dev \
      >"$WEB_LOG" 2>&1 &
    echo $! >"$WEB_PID_FILE"
  )
  sleep 1
  if is_running "$WEB_PID_FILE"; then
    ok "Frontend started (PID $(cat "$WEB_PID_FILE")) → http://localhost:$WEB_PORT"
  else
    err "Frontend failed to start — see $WEB_LOG"
    return 1
  fi
}

stop_one() {
  local pid_file="$1"
  local label="$2"
  local port="$3"

  if is_running "$pid_file"; then
    local pid
    pid="$(cat "$pid_file")"
    log "Stopping $label (PID $pid)"
    # Kill the whole process group so child (next/tsx) processes also die
    kill -TERM -"$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
    sleep 2
    if kill -0 "$pid" 2>/dev/null; then
      warn "$label still alive — SIGKILL"
      kill -KILL -"$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
    fi
    rm -f "$pid_file"
    ok "$label stopped"
  else
    log "$label not tracked by pid file"
  fi

  # Final cleanup: anything still listening on the port
  if port_in_use "$port"; then
    local stray
    stray="$(pid_on_port "$port")"
    warn "Port $port still held by PID $stray — killing"
    kill -9 "$stray" 2>/dev/null || true
  fi
}

cmd_start() {
  require_pnpm
  start_api
  start_web
  echo
  log "All services started."
  log "  Backend  → http://localhost:$API_PORT  (log: $API_LOG)"
  log "  Frontend → http://localhost:$WEB_PORT  (log: $WEB_LOG)"
  log "Tail logs:  ./start_script.sh logs"
  log "Stop:       ./start_script.sh stop"
}

cmd_stop() {
  stop_one "$API_PID_FILE" "Backend (API)" "$API_PORT"
  stop_one "$WEB_PID_FILE" "Frontend (Web)" "$WEB_PORT"
}

cmd_restart() {
  cmd_stop
  sleep 1
  cmd_start
}

print_status_line() {
  local label="$1"
  local pid_file="$2"
  local port="$3"
  local pid="-"
  local state

  if is_running "$pid_file"; then
    pid="$(cat "$pid_file")"
    state="${C_GREEN}running${C_RESET}"
  elif port_in_use "$port"; then
    pid="$(pid_on_port "$port")"
    state="${C_YELLOW}running (untracked)${C_RESET}"
  else
    state="${C_RED}stopped${C_RESET}"
  fi
  printf "  %-18s  port %-5s  pid %-7s  %b\n" "$label" "$port" "$pid" "$state"
}

cmd_status() {
  printf "${C_BOLD}1Person services${C_RESET}\n"
  print_status_line "Backend (API)"  "$API_PID_FILE" "$API_PORT"
  print_status_line "Frontend (Web)" "$WEB_PID_FILE" "$WEB_PORT"
}

cmd_logs() {
  local which="${1:-both}"
  case "$which" in
    api) tail -f "$API_LOG" ;;
    web) tail -f "$WEB_LOG" ;;
    both|"") tail -f "$API_LOG" "$WEB_LOG" ;;
    *) err "Unknown log target: $which (use api|web|both)"; exit 2 ;;
  esac
}

usage() {
  cat <<EOF
1Person AI — start_script.sh

Usage: $0 <command>

Commands:
  start          Start backend (port $API_PORT) and frontend (port $WEB_PORT)
  stop           Stop both
  restart        Stop, then start
  status         Show running status
  logs [api|web] Tail logs (default: both)

Ports come from .env (API_PORT, WEB_PORT) or shell env.
EOF
}

# ---------- Dispatch ----------
case "${1:-}" in
  start)   cmd_start ;;
  stop)    cmd_stop ;;
  restart) cmd_restart ;;
  status)  cmd_status ;;
  logs)    shift; cmd_logs "${1:-both}" ;;
  ""|-h|--help|help) usage ;;
  *) err "Unknown command: $1"; usage; exit 2 ;;
esac
