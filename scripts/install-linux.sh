#!/usr/bin/env bash
set -euo pipefail

TARBALL="${1:-dist/linux/Lumina-0.5.0-linux-x64.tar.gz}"
if [[ ! -f "$TARBALL" ]]; then
  echo "Tarball not found: $TARBALL" >&2
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

echo "Extracting $TARBALL -> $INSTALL_DIR..."
tar -xzf "$TARBALL" --strip-components=1 -C "$INSTALL_DIR"

if [[ -f "$INSTALL_DIR/resources/icon.png" ]]; then
  cp "$INSTALL_DIR/resources/icon.png" "$ICON_DIR/lumina.png"
fi

cat > "$BIN_DIR/lumina" <<EOF
#!/usr/bin/env bash
exec "$INSTALL_DIR/lumina" "\$@"
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

echo "Installed Lumina to $INSTALL_DIR"
echo "Launcher: $BIN_DIR/lumina"
