#!/usr/bin/env bash
# Install Wanwu CLI into ~/.wanwu/bin (or WANWU_INSTALL_DIR).
set -euo pipefail

VERSION="${WANWU_INSTALL_VERSION:-1.0.0-beta}"
INSTALL_DIR="${WANWU_INSTALL_DIR:-${HOME}/.wanwu/bin}"
REPO="${WANWU_INSTALL_REPO:-yipengcao-css/Wanwu-Code}"
FROM="${WANWU_INSTALL_FROM:-release}" # release | local

mkdir -p "$INSTALL_DIR"

detect_asset() {
  local os arch
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"
  case "$os" in
    linux*) os=linux ;;
    darwin*) os=macos ;;
    mingw*|msys*|cygwin*) os=win ;;
    *) os=linux ;;
  esac
  case "$arch" in
    x86_64|amd64) arch=x64 ;;
    aarch64|arm64) arch=arm64 ;;
    *) arch=x64 ;;
  esac
  if [[ "$os" == "win" ]]; then
    echo "wanwu-${VERSION}-${os}-${arch}.exe"
  else
    echo "wanwu-${VERSION}-${os}-${arch}"
  fi
}

install_local() {
  local root asset dest
  root="$(cd "$(dirname "$0")/.." && pwd)"
  asset="$(detect_asset)"
  if [[ -f "$root/dist-bin/$asset" ]]; then
    dest="$INSTALL_DIR/wanwu"
    cp "$root/dist-bin/$asset" "$dest"
    chmod +x "$dest"
    echo "installed local native → $dest"
    return
  fi
  if [[ -f "$root/dist-bin/wanwu.mjs" ]]; then
    dest="$INSTALL_DIR/wanwu"
    cat >"$dest" <<EOF
#!/usr/bin/env bash
exec node "$root/dist-bin/wanwu.mjs" "\$@"
EOF
    chmod +x "$dest"
    echo "installed local mjs wrapper → $dest"
    return
  fi
  echo "local dist-bin missing — run: pnpm build:cli && pnpm build:cli:native" >&2
  exit 1
}

install_release() {
  local asset url dest tmp
  asset="$(detect_asset)"
  url="https://github.com/${REPO}/releases/download/v${VERSION}/${asset}"
  dest="$INSTALL_DIR/wanwu"
  tmp="$(mktemp)"
  echo "downloading $url"
  if ! curl -fsSL "$url" -o "$tmp"; then
    echo "native asset not found; falling back to wanwu-${VERSION}.mjs" >&2
    url="https://github.com/${REPO}/releases/download/v${VERSION}/wanwu-${VERSION}.mjs"
    curl -fsSL "$url" -o "$tmp"
    dest="$INSTALL_DIR/wanwu.mjs"
    mv "$tmp" "$dest"
    chmod +x "$dest"
    cat >"$INSTALL_DIR/wanwu" <<EOF
#!/usr/bin/env bash
exec node "$dest" "\$@"
EOF
    chmod +x "$INSTALL_DIR/wanwu"
    echo "installed mjs → $INSTALL_DIR/wanwu"
    return
  fi
  mv "$tmp" "$dest"
  chmod +x "$dest"
  echo "installed native → $dest"
}

case "$FROM" in
  local) install_local ;;
  release) install_release ;;
  *) echo "WANWU_INSTALL_FROM must be local|release" >&2; exit 2 ;;
esac

echo
echo "Add to PATH:"
echo "  export PATH=\"$INSTALL_DIR:\$PATH\""
echo "Then:"
echo "  wanwu doctor"
