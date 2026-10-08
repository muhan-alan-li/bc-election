#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
run_dir="$root/.run"
action=${1:-status}
app_port=${2:-8000}
finder_port=${3:-8001}
case "$app_port:$finder_port" in *[!0-9:]*|:*|*:) echo 'Ports must be numeric.' >&2; exit 1;; esac
if [ "$app_port" = "$finder_port" ]; then echo 'App and finder ports must differ.' >&2; exit 1; fi
alive() {
    [ -f "$run_dir/$1.pid" ] || return 1
    tracked_pid=$(cat "$run_dir/$1.pid")
    case "$tracked_pid" in ''|*[!0-9]*) return 1;; esac
    kill -0 "$tracked_pid" 2>/dev/null
}
stop_service() {
    if alive "$1"; then kill "$tracked_pid"; echo "Stopped $1 (PID $tracked_pid)."; fi
    rm -f "$run_dir/$1.pid"
}
case "$action" in
    up)
        mkdir -p "$run_dir"
        # make up rebuilds both binaries; running processes still use the old code.
        stop_service server
        stop_service finder
        started_finder=false
        if ! alive finder; then
            nohup "$root/constituency-finder/bin/constituency-finder" \
                -addr "127.0.0.1:$finder_port" -data-dir "$root/ingestion/storage/published" \
                > "$run_dir/finder.log" 2>&1 < /dev/null &
            echo $! > "$run_dir/finder.pid"
            started_finder=true
            sleep 1
            if ! alive finder; then cat "$run_dir/finder.log"; rm -f "$run_dir/finder.pid"; exit 1; fi
        fi
        if ! alive server; then
            nohup "$root/content-server/bin/content-server" -addr "127.0.0.1:$app_port" \
                -client-dir "$root/client/dist" -data-dir "$root/ingestion/storage/published" \
                -finder-url "http://127.0.0.1:$finder_port" \
                > "$run_dir/server.log" 2>&1 < /dev/null &
            echo $! > "$run_dir/server.pid"
            sleep 1
            if ! alive server; then
                cat "$run_dir/server.log"; rm -f "$run_dir/server.pid"
                if [ "$started_finder" = true ]; then stop_service finder; fi
                exit 1
            fi
        fi
        echo "App running at http://localhost:$app_port"
        echo "Finder: http://127.0.0.1:$finder_port (loads data on demand)"
        echo "Logs: $run_dir/server.log and $run_dir/finder.log"
        ;;
    down) stop_service server; stop_service finder ;;
    status)
        for name in server finder; do
            if alive "$name"; then echo "$name running (PID $tracked_pid)."; else echo "$name is not running."; fi
        done
        ;;
    *) echo 'Usage: app.sh up|down|status [app-port] [finder-port]' >&2; exit 1 ;;
esac
