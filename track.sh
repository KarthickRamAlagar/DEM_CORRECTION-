#!/bin/bash
# usage: ./track.sh "<count command>" TOTAL [interval_seconds]
cmd="$1"; total="${2:-0}"; iv="${3:-60}"
t0=$(date +%s); c0=$(eval "$cmd"); pc=$c0; pt=$t0
echo "time | done/total | pct | +items | sec/item (now) | sec/item (avg) | remaining h | finish at"
while true; do
  sleep "$iv"
  now=$(date +%s); cur=$(eval "$cmd")
  awk -v now="$now" -v cur="$cur" -v pc="$pc" -v pt="$pt" -v c0="$c0" -v t0="$t0" -v total="$total" 'BEGIN{
    d=cur-pc; dt=now-pt; D=cur-c0; DT=now-t0
    sn=(d>0)?dt/d:0; sa=(D>0)?DT/D:0
    pct=(total>0)?100*cur/total:0
    rem=(total>0)?total-cur:0
    h=(sa>0&&total>0)?rem*sa/3600:0
    fin=(sa>0&&total>0)?strftime("%d %b %H:%M",now+rem*sa):"-"
    printf "%s | %d/%d | %.1f%% | +%d | %.1f | %.1f | %.2f h | %s\n", strftime("%H:%M:%S",now), cur, total, pct, d, sn, sa, h, fin
  }'
  pc=$cur; pt=$now
done
