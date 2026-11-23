#!/bin/zsh
set -euo pipefail
project_dir="${0:A:h:h}"
run_mode="${1:-run}"
cd "$project_dir"
node scripts/stop-owned.mjs
npm run build
app_path="$project_dir/out/Right Right Right-darwin-arm64/Right Right Right.app"
launch_app() {
  if [[ -n "${GAME_SERVER_URL:-}" ]]; then
    /usr/bin/open -n "$app_path" --env "GAME_SERVER_URL=$GAME_SERVER_URL"
  else
    /usr/bin/open -n "$app_path"
  fi
}
case "$run_mode" in
  run)
    launch_app
    ;;
  --verify)
    launch_since="$(node -e 'process.stdout.write(String(Date.now()))')"
    launch_app
    node scripts/verify-launch.mjs "$launch_since"
    ;;
  --logs|--telemetry)
    launch_app
    tail -F "$HOME/Library/Application Support/RightRightRight Desktop/desktop.log"
    ;;
  --debug)
    /usr/bin/lldb -- "$app_path/Contents/MacOS/Right Right Right"
    ;;
  *)
    print -u2 'Usage: build_and_run.sh [--verify|--logs|--telemetry|--debug]'
    exit 2
    ;;
esac
