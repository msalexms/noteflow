# Maintainer: yagoid <yago.igle@gmail.com>
# Contributor: callysthenes

pkgname=noteflow
pkgver=2.0.0
pkgrel=1
pkgdesc="Fast notes for software engineers - Local files, optional private GitHub sync. No telemetry."
arch=('x86_64')
url="https://github.com/yagoid/noteflow"
license=('GPL-3.0-or-later')
depends=('electron' 'xdg-utils')
makedepends=('npm' 'nodejs>=18' 'git')
optdepends=('git: for GitHub sync feature')
conflicts=("${pkgname}-bin" "${pkgname}-appimage")
source=("${pkgname}-${pkgver}.tar.gz::https://github.com/yagoid/${pkgname}/archive/refs/tags/v${pkgver}.tar.gz")
sha256sums=('SKIP') # Update with actual checksums after release

prepare() {
  cd "${srcdir}/${pkgname}-${pkgver}"
  # Install dependencies
  npm install
}

build() {
  cd "${srcdir}/${pkgname}-${pkgver}"
  # Build the app
  npm run build
}

package() {
  cd "${srcdir}/${pkgname}-${pkgver}"

  # Create directories
  install -d "${pkgdir}/usr/lib/${pkgname}"
  install -d "${pkgdir}/usr/bin"
  install -d "${pkgdir}/usr/share/applications"
  install -d "${pkgdir}/usr/share/icons/hicolor/512x512/apps"
  install -d "${pkgdir}/usr/share/licenses/${pkgname}"

  # Copy application files
  cp -r dist "${pkgdir}/usr/lib/${pkgname}/"
  cp -r dist-electron "${pkgdir}/usr/lib/${pkgname}/"
  install -Dm644 package.json "${pkgdir}/usr/lib/${pkgname}/package.json"

  # Copy CLI tool
  install -d "${pkgdir}/usr/lib/${pkgname}/cli"
  install -Dm755 cli/noteflow.js "${pkgdir}/usr/lib/${pkgname}/cli/noteflow.js"

  # Create GUI wrapper
  cat > "${pkgdir}/usr/bin/${pkgname}" << EOF
#!/bin/bash
export NOTEFLOW_NATIVE=1
export ELECTRON_IS_DEV=0
exec electron /usr/lib/${pkgname} "\$@"
EOF
  chmod +x "${pkgdir}/usr/bin/${pkgname}"

  # Link CLI
  ln -s "/usr/lib/${pkgname}/cli/noteflow.js" "${pkgdir}/usr/bin/${pkgname}-cli"

  # Copy icon
  install -Dm644 public/icon.png "${pkgdir}/usr/share/icons/hicolor/512x512/apps/${pkgname}.png"

  # Copy desktop file
  cat > "${pkgdir}/usr/share/applications/${pkgname}.desktop" << EOF
[Desktop Entry]
Name=NoteFlow
Comment=Fast notes for software engineers
Exec=/usr/bin/${pkgname} %U
Icon=${pkgname}
Terminal=false
Type=Application
Categories=Utility;TextEditor;
Keywords=notes;markdown;text;
EOF

  # Copy license
  install -Dm644 LICENSE "${pkgdir}/usr/share/licenses/${pkgname}/LICENSE"
}
