#!/bin/zsh

set -e
cd "$(dirname "$0")"

URL="http://127.0.0.1:1420/"

if curl -fsS "$URL" >/dev/null 2>&1; then
  open -a "Google Chrome" "$URL"
  exit 0
fi

npm run dev -- --host 127.0.0.1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" >/dev/null 2>&1 || true' EXIT INT TERM

for _ in {1..50}; do
  if curl -fsS "$URL" >/dev/null 2>&1; then
    open -a "Google Chrome" "$URL"
    wait "$SERVER_PID"
    exit 0
  fi
  sleep 0.1
done

echo "网页服务启动失败，请检查上方错误信息。"
exit 1
