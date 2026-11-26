#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
source="$here/../mobile/assets/app-icon.png"
case "${1:-}" in
 android)
  dst="$here/android/app/src/main/res/drawable-nodpi"
  mkdir -p "$dst"
  cp "$source" "$dst/babymark.png"
  ;;
 ios)
  dst="$here/ios/BABYMARK/Assets.xcassets/AppIcon.appiconset"
  sips -s format png -z 1024 1024 "$source" --out "$dst/AppIcon.png" >/dev/null
  ;;
 *) echo "Usage: bash apps/native/prepare-assets.sh android|ios" >&2; exit 1;;
esac
