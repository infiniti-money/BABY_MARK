#!/usr/bin/env bash
# Local-only: apksigner prompts for passwords; no secrets in args/env/CI.
set -euo pipefail
if [[ "${CI:-}" == "true" || -n "${GITHUB_ACTIONS:-}" ]]; then
 echo "Owner signing is local-only; do not provide keys to CI." >&2; exit 1
fi
if [[ $# != 3 ]]; then echo "Usage: bash sign-android.sh KEYSTORE ALIAS NEW_OUTPUT.apk" >&2; exit 2; fi
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
key="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
alias="$2"
out="$(cd "$(dirname "$3")" && pwd)/$(basename "$3")"
[[ -f "$key" && -n "$alias" && "$out" == *.apk && ! -e "$out" ]] || { echo "Invalid keystore, alias or output already exists" >&2; exit 1; }
case "$key" in "$root"/*) echo "Store keystore outside the repository." >&2; exit 1;; esac
case "$out" in "$root"/*) echo "Store signed output outside the repository." >&2; exit 1;; esac
sdk="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
[[ -n "$sdk" ]] || { echo "Set ANDROID_HOME or ANDROID_SDK_ROOT." >&2; exit 1; }
tools="$sdk/build-tools/36.0.0"
align="$tools/zipalign"; signer="$tools/apksigner"
if [[ -f "$align.exe" ]]; then align="$align.exe"; fi
if [[ -f "$signer.bat" ]]; then signer="$signer.bat"; fi
[[ -f "$align" && -f "$signer" ]] || { echo "Install Android build-tools 36.0.0" >&2; exit 1; }
bash "$here/prepare-assets.sh" android
gradle -p "$here/android" --no-daemon lintRelease assembleRelease
unsigned="$here/android/app/build/outputs/apk/release/app-release-unsigned.apk"
[[ -f "$unsigned" ]] || { echo "Unsigned release APK missing" >&2; exit 1; }
tmp="$(mktemp -d "$(dirname "$out")/.bm-sign.XXXXXX")"
trap 'rm -rf -- "$tmp"' EXIT
"$align" -P 16 -f 4 "$unsigned" "$tmp/aligned.apk"
"$signer" sign --ks "$key" --ks-key-alias "$alias" --out "$tmp/signed.apk" "$tmp/aligned.apk"
"$signer" verify --verbose --print-certs "$tmp/signed.apk"
"$align" -c -P 16 4 "$tmp/signed.apk"
# Atomic no-clobber copy using shell noclobber; never overwrite a prior signed artifact.
(set -o noclobber; cat "$tmp/signed.apk" > "$out")
echo "Verified signed APK: $out"
