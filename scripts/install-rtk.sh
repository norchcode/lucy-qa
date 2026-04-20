#!/usr/bin/env sh
# Install RTK (Rust Token Killer) for Lucy QA.
# RTK compresses command output before it reaches the LLM context,
# reducing token usage by 60-90% on git, npm, playwright, and other commands.
#
# https://github.com/rtk-ai/rtk
#
# Usage:
#   sh scripts/install-rtk.sh
#   RTK_INSTALL_DIR=/usr/local/bin sh scripts/install-rtk.sh
set -e

INSTALL_DIR="${RTK_INSTALL_DIR:-$HOME/.local/bin}"
REPO="rtk-ai/rtk"
BINARY_NAME="rtk"

info()  { printf "\033[32m[INFO]\033[0m  %s\n" "$1"; }
warn()  { printf "\033[33m[WARN]\033[0m  %s\n" "$1"; }
error() { printf "\033[31m[ERROR]\033[0m %s\n" "$1"; exit 1; }

# ── Detect OS / arch ─────────────────────────────────────────────────────────
case "$(uname -s)" in
  Linux*)  OS="linux"  ;;
  Darwin*) OS="darwin" ;;
  *)       error "Unsupported OS: $(uname -s)" ;;
esac

case "$(uname -m)" in
  x86_64|amd64) ARCH="x86_64" ;;
  arm64|aarch64) ARCH="aarch64" ;;
  *) error "Unsupported architecture: $(uname -m)" ;;
esac

case "$OS" in
  linux)
    case "$ARCH" in
      x86_64)  TARGET="x86_64-unknown-linux-musl" ;;
      aarch64) TARGET="aarch64-unknown-linux-gnu" ;;
    esac
    ;;
  darwin)
    TARGET="${ARCH}-apple-darwin"
    ;;
esac

# ── Get latest version ────────────────────────────────────────────────────────
info "Checking latest RTK release..."
VERSION=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
  | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')

if [ -z "$VERSION" ]; then
  error "Could not fetch latest RTK version. Check your internet connection."
fi

info "Latest version: $VERSION"
info "Target: $TARGET"

# ── Download ──────────────────────────────────────────────────────────────────
DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${VERSION}/${BINARY_NAME}-${TARGET}.tar.gz"
TEMP_DIR=$(mktemp -d)
ARCHIVE="${TEMP_DIR}/${BINARY_NAME}.tar.gz"

info "Downloading $DOWNLOAD_URL..."
curl -fsSL "$DOWNLOAD_URL" -o "$ARCHIVE" || error "Download failed."

# ── Install ───────────────────────────────────────────────────────────────────
tar -xzf "$ARCHIVE" -C "$TEMP_DIR"
mkdir -p "$INSTALL_DIR"
mv "${TEMP_DIR}/${BINARY_NAME}" "${INSTALL_DIR}/${BINARY_NAME}"
chmod +x "${INSTALL_DIR}/${BINARY_NAME}"
rm -rf "$TEMP_DIR"

# ── Verify ────────────────────────────────────────────────────────────────────
info "Installed to ${INSTALL_DIR}/${BINARY_NAME}"

if command -v "$BINARY_NAME" >/dev/null 2>&1; then
  info "Verified: $($BINARY_NAME --version)"
else
  warn "RTK installed but not in PATH. Add to your shell profile:"
  warn "  export PATH=\"\$HOME/.local/bin:\$PATH\""
fi

echo ""
info "RTK installed successfully!"
info "Lucy QA will now automatically use RTK to compress command output."
info "Run: node apps/cli/src/index.mjs rtk status"
info ""
info "To verify token savings: rtk gain"
info "Docs: https://github.com/rtk-ai/rtk"
