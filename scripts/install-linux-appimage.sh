#!/usr/bin/env bash
set -euo pipefail

APPIMAGE="${1:-}"
if [[ -z "$APPIMAGE" || ! -f "$APPIMAGE" ]]; then
  echo "Usage: $0 /path/to/Lumina-*.AppImage" >&2
  exit 1
fi

INSTALL_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/lumina"
BIN_DIR="$HOME/.local/bin"
APPS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
ICON_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/256x256/apps"
MIME_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/mime/packages"

mkdir -p "$BIN_DIR" "$APPS_DIR" "$ICON_DIR" "$MIME_DIR"
rm -rf "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR"

TARGET_APPIMAGE="$INSTALL_DIR/Lumina.AppImage"
cp "$APPIMAGE" "$TARGET_APPIMAGE"
chmod +x "$TARGET_APPIMAGE"

# Extract icon from AppImage if available, otherwise fall back to repo asset.
TMP_EXTRACT="$(mktemp -d)"
trap 'rm -rf "$TMP_EXTRACT"' EXIT
if (cd "$TMP_EXTRACT" && "$TARGET_APPIMAGE" --appimage-extract "resources/icon.png" >/dev/null 2>&1) && [[ -f "$TMP_EXTRACT/squashfs-root/resources/icon.png" ]]; then
  cp "$TMP_EXTRACT/squashfs-root/resources/icon.png" "$ICON_DIR/lumina.png"
elif [[ -f "assets/icon.png" ]]; then
  cp "assets/icon.png" "$ICON_DIR/lumina.png"
fi

cat > "$BIN_DIR/lumina" <<EOF
#!/usr/bin/env bash
if ! ldconfig -p 2>/dev/null | grep -q 'libfuse\.so\.2'; then
  export APPIMAGE_EXTRACT_AND_RUN=1
fi
exec "$TARGET_APPIMAGE" "\$@"
EOF
chmod +x "$BIN_DIR/lumina"

cat > "$APPS_DIR/lumina.desktop" <<EOF
[Desktop Entry]
Name=Lumina
Comment=Manga, Manhwa, and Manhua Translation Studio
Exec=$BIN_DIR/lumina %U
Icon=lumina
Terminal=false
Type=Application
Categories=Graphics;Utility;
MimeType=application/x-lumina-project;
StartupWMClass=Lumina
EOF

cat > "$MIME_DIR/lumina-lmi.xml" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info">
  <mime-type type="application/x-lumina-project">
    <comment>Lumina Project File</comment>
    <glob pattern="*.lmi"/>
  </mime-type>
</mime-info>
EOF

command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APPS_DIR" || true
command -v update-mime-database >/dev/null 2>&1 && update-mime-database "${XDG_DATA_HOME:-$HOME/.local/share}/mime" || true

echo "Installed Lumina AppImage to $TARGET_APPIMAGE"
echo "Launcher: $BIN_DIR/lumina"
