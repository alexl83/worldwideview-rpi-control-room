#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this installer with sudo." >&2
  exit 1
fi
if [[ $(dpkg --print-architecture) != arm64 ]]; then
  echo "The pinned voice runtime is built for Debian ARM64." >&2
  exit 1
fi

readonly VOICE_ROOT=/opt/wwv-voice
readonly DOWNLOAD_DIR="$(mktemp -d)"
trap 'rm -rf -- "$DOWNLOAD_DIR"' EXIT

readonly WHISPER_VERSION=1.9.1
readonly WHISPER_ARCHIVE=whisper-bin-ubuntu-arm64.tar.gz
readonly WHISPER_URL="https://github.com/ggml-org/whisper.cpp/releases/download/v${WHISPER_VERSION}/${WHISPER_ARCHIVE}"
readonly WHISPER_SHA256=e0b66cd551ff6f2a28fabe3c6e89691eea037bb76833493abb9a71ca788994b3
readonly WHISPER_MODEL_URL=https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin
readonly WHISPER_MODEL_SHA256=60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe

readonly PIPER_VERSION=1.6.0
readonly PIPER_WHEEL=piper_tts-1.6.0-cp39-abi3-manylinux_2_17_aarch64.manylinux2014_aarch64.manylinux_2_28_aarch64.whl
readonly PIPER_URL="https://github.com/OHF-Voice/piper1-gpl/releases/download/v${PIPER_VERSION}/${PIPER_WHEEL}"
readonly PIPER_SHA256=f42386c8674959f5f1cc396d54f9b4e417d1956cc87ab1daa7728f43ff1f5fa1
readonly VOICE_BASE=https://huggingface.co/rhasspy/piper-voices/resolve/main/it/it_IT/paola/medium
readonly VOICE_MODEL=it_IT-paola-medium.onnx
readonly VOICE_MODEL_SHA256=6fc918b5a0ea6137382833dddfa567bffbe6a5060c02043c87192ee59c04210c
readonly VOICE_CONFIG_SHA256=aea19c0a7fce29fbc359b93f10e7902854401e4c95ae2ea328ae516b15d296cf

download_verified() {
  local url=$1 destination=$2 digest=$3
  curl --fail --location --retry 3 --output "$destination" "$url"
  printf '%s  %s\n' "$digest" "$destination" | sha256sum --check --status
}

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  ca-certificates curl ffmpeg python3 python3-venv

download_verified "$WHISPER_URL" "$DOWNLOAD_DIR/$WHISPER_ARCHIVE" "$WHISPER_SHA256"
download_verified "$WHISPER_MODEL_URL" "$DOWNLOAD_DIR/ggml-base.bin" "$WHISPER_MODEL_SHA256"
download_verified "$PIPER_URL" "$DOWNLOAD_DIR/$PIPER_WHEEL" "$PIPER_SHA256"
download_verified "$VOICE_BASE/$VOICE_MODEL" "$DOWNLOAD_DIR/$VOICE_MODEL" "$VOICE_MODEL_SHA256"
download_verified "$VOICE_BASE/$VOICE_MODEL.json" "$DOWNLOAD_DIR/$VOICE_MODEL.json" "$VOICE_CONFIG_SHA256"

install -d -m 0755 "$VOICE_ROOT/whisper" "$VOICE_ROOT/models"
tar -xzf "$DOWNLOAD_DIR/$WHISPER_ARCHIVE" --strip-components=1 -C "$VOICE_ROOT/whisper"
install -m 0644 "$DOWNLOAD_DIR/ggml-base.bin" "$VOICE_ROOT/models/ggml-base.bin"
install -m 0644 "$DOWNLOAD_DIR/$VOICE_MODEL" "$VOICE_ROOT/models/$VOICE_MODEL"
install -m 0644 "$DOWNLOAD_DIR/$VOICE_MODEL.json" "$VOICE_ROOT/models/$VOICE_MODEL.json"

rm -rf -- "$VOICE_ROOT/piper"
python3 -m venv "$VOICE_ROOT/piper"
"$VOICE_ROOT/piper/bin/python3" -m pip install --disable-pip-version-check \
  "$DOWNLOAD_DIR/$PIPER_WHEEL"

"$VOICE_ROOT/whisper/whisper-cli" --help >/dev/null
"$VOICE_ROOT/piper/bin/python3" -m piper --help >/dev/null
echo "Local voice runtime installed in $VOICE_ROOT."
