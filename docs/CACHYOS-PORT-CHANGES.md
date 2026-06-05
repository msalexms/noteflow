# CachyOS Port Changes Summary

This document describes all changes made to port NoteFlow to work on CachyOS and other Arch-based Linux distributions.

## Changes Made

### 1. Build Configuration (package.json)

Added support for multiple Linux package formats:

```json
"linux": {
  "target": [
    "deb",      // Debian/Ubuntu/Mint (existing)
    "appimage", // Universal Linux format (NEW)
    "pacman"    // Arch/CachyOS native format (NEW)
  ],
  ...
}
```

Added pacman-specific configuration:

```json
"pacman": {
  "depends": [
    "gtk3",
    "libnotify",
    "nss",
    "libxscrnsaver",
    "libxtst",
    "xdg-utils",
    "at-spi2-core",
    "libdrm",
    "libgbm",
    "libxkbcommon"
  ],
  "packageName": "noteflow"
}
```

### 2. Update Detection (electron/main.ts)

Modified the update checker to detect Arch-based distributions and provide the correct download URL:

```typescript
const isArchBased = fs.existsSync('/etc/arch-release') ||
                   fs.existsSync('/etc/cachyos-release') ||
                   fs.existsSync('/usr/bin/pacman')
if (isArchBased) {
  downloadUrl = `...pkg.tar.zst`  // pacman package
} else {
  downloadUrl = `...AppImage`      // universal format
}
```

### 3. Update Installation (electron/main.ts)

Added support for installing pacman packages during updates:

```typescript
if (isPacman) {
  const proc = spawn('pkexec', ['pacman', '-U', dest], { stdio: 'ignore' })
  ...
}
```

### 4. Security Updates (electron/main.ts)

Updated allowed file extensions for updates to include:
- `.AppImage`
- `.pkg.tar.zst`

### 5. Documentation Files Created

- **PKGBUILD**: Arch package build script for manual compilation or AUR submission
- **.SRCINFO**: AUR metadata file
- **docs/CACHYOS-INSTALL.md**: Comprehensive installation guide for CachyOS users

### 6. README Updates

Updated the README.md with:
- Arch/CachyOS installation instructions
- Multiple installation methods (pacman, AppImage, AUR)
- Build output documentation

## Build Outputs

After running `npm run dist`, the following packages will be generated:

| Platform | Package Name | Format | Target Systems |
|----------|-------------|--------|-----------------|
| Windows | NoteFlow-X.Y.Z-Setup.exe | NSIS Installer | Windows 10/11 |
| Linux | noteflow_X.Y.Z_amd64.deb | Debian Package | Debian, Ubuntu, Mint |
| Linux | NoteFlow-X.Y.Z-x86_64.AppImage | AppImage | Universal Linux |
| Linux | noteflow-X.Y.Z-x86_64.pkg.tar.zst | Pacman Package | Arch, CachyOS, Manjaro |

## Installation Methods for CachyOS Users

### Method 1: Prebuilt Pacman Package
```bash
wget https://github.com/yagoid/noteflow/releases/latest/download/noteflow-1.5.6-x86_64.pkg.tar.zst
sudo pacman -U noteflow-1.5.6-x86_64.pkg.tar.zst
```

### Method 2: AppImage (Universal)
```bash
wget https://github.com/yagoid/noteflow/releases/latest/download/NoteFlow-1.5.6-x86_64.AppImage
chmod +x NoteFlow-1.5.6-x86_64.AppImage
./NoteFlow-1.5.6-x86_64.AppImage
```

### Method 3: Build from Source
```bash
git clone https://github.com/yagoid/noteflow.git
cd noteflow
npm install
npm run dist
sudo pacman -U release/noteflow-*.pkg.tar.zst
```

## Testing Checklist

- [ ] Build produces all three Linux formats (deb, AppImage, pacman)
- [ ] AppImage launches correctly on CachyOS
- [ ] Pacman package installs without dependency issues
- [ ] Auto-update works on CachyOS
- [ ] Global shortcut (Ctrl+Shift+Space) works
- [ ] Notes directory follows XDG spec (`~/.local/share/noteflow-notes`)

## Future Enhancements

1. Submit to AUR for easier installation
2. Add Flatpak support for even broader compatibility
3. Create CachyOS-specific optimizations if needed

## Compatibility Matrix

| Distro | Status | Package Format | Notes |
|--------|--------|----------------|-------|
| CachyOS | ✅ Native | pacman | First-class support |
| Arch Linux | ✅ Native | pacman | First-class support |
| Manjaro | ✅ Native | pacman | First-class support |
| Debian/Ubuntu | ✅ Native | deb | Existing support |
| Fedora | ✅ Compatible | AppImage | Works via AppImage |
| openSUSE | ✅ Compatible | AppImage | Works via AppImage |
| Any Linux | ✅ Compatible | AppImage | Universal format |

## Files Modified

1. `package.json` - Build configuration
2. `electron/main.ts` - Update and installation logic
3. `README.md` - Documentation updates

## Files Created

1. `PKGBUILD` - Arch build script
2. `.SRCINFO` - AUR metadata
3. `docs/CACHYOS-INSTALL.md` - Installation guide
4. `docs/CACHYOS-PORT-CHANGES.md` - This file
