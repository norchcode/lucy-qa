#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET_DIR="${LUCY_INSTALL_DIR:-$HOME/.local/bin}"
mkdir -p "$TARGET_DIR"
ln -sf "$REPO_ROOT/bin/lucy" "$TARGET_DIR/lucy"
chmod +x "$REPO_ROOT/bin/lucy"
echo "Installed lucy to $TARGET_DIR/lucy"
echo "Make sure $TARGET_DIR is in your PATH."
echo "Try: lucy"
