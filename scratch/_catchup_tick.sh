#!/bin/bash
SECRET="eUvc8J09HOz05MS+4s2/NL2tI1fbJIsjVzfkicnSjQs="
URL="https://outreach-six-gamma.vercel.app/api/cron/tick"
END=$(( $(date +%s) + 58*60 ))
fails=0
ticks=0
while [ "$(date +%s)" -lt "$END" ]; do
  started=$(date +%s)
  status=$(curl -s -m 90 -o /tmp/_tick_out.json -w "%{http_code}" -H "Authorization: Bearer ${SECRET}" "${URL}" || echo "000")
  ticks=$((ticks+1))
  if [ "$status" = "200" ]; then
    fails=0
    body=$(cat /tmp/_tick_out.json 2>/dev/null)
    if ! echo "$body" | grep -q '"initialEmailsSent":0,"actionsProcessed":0'; then
      echo "[$(date -u +%H:%M:%S)] $body"
    fi
  else
    fails=$((fails+1))
    echo "[$(date -u +%H:%M:%S)] tick failed (HTTP $status), consecutive: $fails"
    if [ "$fails" -ge 10 ]; then
      echo "10 consecutive failures — stopping."
      break
    fi
  fi
  elapsed=$(( $(date +%s) - started ))
  sleep_for=$(( 30 - elapsed ))
  [ "$sleep_for" -gt 0 ] && sleep "$sleep_for"
done
echo "Catch-up run finished after $ticks ticks."
