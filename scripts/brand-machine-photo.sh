#!/usr/bin/env bash
# Brand every machinery photo with the AR7 mark, the machine name and its stock
# reference, then compress to webp.
#
#   ./brand-machine-photo.sh <input.jpg> <output-slug> "<Machine name>" "<REF>"
#
# Why this exists (2026-10-03): the owner asked for photo branding on every unit
# we list. It also does real work — a branded photo of a specific machine is our
# own record of the unit we inspected, and it cannot be confused with a stock
# catalogue image from somewhere else.
#
# The bar is drawn with ImageMagick primitives, so the script has no dependency
# on a design tool or a network connection.
set -euo pipefail

IN="$1"; SLUG="$2"; TITLE="${3:-AR7 TRADERS}"; REF="${4:-}"
OUT_DIR="$(dirname "$IN")"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
MARK="$REPO/public/assets/ar7-mark.png"

W=$(identify -format "%w" "$IN")
H=$(identify -format "%h" "$IN")
SCALE=$(( W / 1200 ))
[ "$SCALE" -lt 1 ] && SCALE=1
BAR=$(( 96 * SCALE ))
LOGO=$(( 58 * SCALE ))
PAD=$(( 34 * SCALE ))
F1=$(( 30 * SCALE ))   # machine name
F2=$(( 19 * SCALE ))   # reference line
F3=$(( 26 * SCALE ))   # wordmark

# 1. bottom bar + the gold hairline above it (the site's palette: green + gold)
convert "$IN" \
  -fill "#043f28E6" -draw "rectangle 0,$(( H - BAR )) $W $H" \
  -fill "#c8881b" -draw "rectangle 0,$(( H - BAR )) $W $(( H - BAR + 3 * SCALE ))" \
  "$OUT_DIR/.stage-bar.png"

# 2. logo + wordmark, machine name and reference, all left-aligned like a spec sheet
convert "$OUT_DIR/.stage-bar.png" \
  \( "$MARK" -resize "${LOGO}x${LOGO}" \) -gravity northwest -geometry "+$PAD+$(( H - BAR + (BAR - LOGO) / 2 ))" -composite \
  -gravity northwest -font DejaVu-Sans-Bold -fill "#e4ad43" -pointsize "$F3" \
  -annotate "+$(( PAD + LOGO + 16 * SCALE ))+$(( H - BAR + (BAR - F3) / 2 ))" "AR7 TRADERS" \
  -gravity north -font DejaVu-Sans-Bold -fill "#ffffff" -pointsize "$F1" \
  -annotate "+0+$(( H - BAR + (BAR - F1) / 2 ))" "$TITLE" \
  -gravity northeast -font DejaVu-Sans-Bold -fill "#cfe4d8" -pointsize "$F2" \
  -annotate "+$PAD+$(( H - BAR + (BAR - F2) / 2 ))" "${REF:+REF $REF}" \
  -gravity northeast -font DejaVu-Sans -fill "#e4ad43" -pointsize "$F2" \
  -annotate "+$PAD+$(( H - BAR + (BAR - F2) / 2 ))" "" \
  "$OUT_DIR/.stage-brand.png"

# 3. corner badge on a dark pill, so it stays legible over a bright sky
BADGE_W=$(( 250 * SCALE ))
BADGE_H=$(( 44 * SCALE ))
convert "$OUT_DIR/.stage-brand.png" \
  -fill "#043f28CC" -draw "roundrectangle $(( W - PAD - BADGE_W )),$PAD $(( W - PAD )),$(( PAD + BADGE_H )) $(( 10 * SCALE )),$(( 10 * SCALE ))" \
  -gravity northeast -font DejaVu-Sans-Bold -fill "#e4ad43" -pointsize "$F2" \
  -annotate "+$(( PAD + 18 * SCALE ))+$(( PAD + (BADGE_H - F2) / 2 ))" "AR7traders.com" \
  -resize 1200x -strip -quality 68 \
  "$OUT_DIR/$SLUG.webp"

rm -f "$OUT_DIR/.stage-bar.png" "$OUT_DIR/.stage-brand.png"
echo "$OUT_DIR/$SLUG.webp  ($(du -h "$OUT_DIR/$SLUG.webp" | cut -f1))"
