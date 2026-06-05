# Installing NoteFlow on CachyOS

NoteFlow works perfectly on CachyOS (Arch-based Linux distribution). Here are several installation methods:

## Method 1: Using the Prebuilt Pacman Package (Recommended)

Download and install the prebuilt package from GitHub Releases:

```bash
# Download the latest package (replace version with actual latest)
wget https://github.com/yagoid/noteflow/releases/latest/download/noteflow-1.5.6-x86_64.pkg.tar.zst

# Install using pacman
sudo pacman -U noteflow-1.5.6-x86_64.pkg.tar.zst
```

## Method 2: Using AppImage (Universal)

The AppImage format works on any Linux distribution including CachyOS:

```bash
# Download the AppImage
wget https://github.com/yagoid/noteflow/releases/latest/download/NoteFlow-1.5.6-x86_64.AppImage

# Make it executable
chmod +x NoteFlow-1.5.6-x86_64.AppImage

# Run it
./NoteFlow-1.5.6-x86_64.AppImage

# Optionally, integrate with your system
./NoteFlow-1.5.6-x86_64.AppImage --appimage-extract
sudo mv squashfs-root /opt/NoteFlow
sudo ln -s /opt/NoteFlow/AppRun /usr/local/bin/noteflow
```

## Method 3: Build from Source

Build NoteFlow from source:

```bash
# Clone the repository
git clone https://github.com/yagoid/noteflow.git
cd noteflow

# Install dependencies
sudo pacman -S nodejs npm git python3
npm install

# Build for Linux
npm run dist

# Install the generated package
sudo pacman -U release/noteflow-*.pkg.tar.zst
```

## Method 4: From AUR (If Available)

If NoteFlow is submitted to the AUR, you can install it using your favorite AUR helper:

```bash
# Using paru
paru -S noteflow

# Using yay
yay -S noteflow

# Manually from AUR
git clone https://aur.archlinux.org/noteflow.git
cd noteflow
makepkg -si
```

## Dependencies

NoteFlow requires the following dependencies (automatically installed with the package):

- `gtk3` - GTK toolkit
- `libnotify` - Desktop notifications
- `nss` - Network Security Services
- `libxscrnsaver` - X11 Screen Saver extension
- `libxtst` - X11 Test extension
- `xdg-utils` - XDG utilities
- `at-spi2-core` - Assistive Technology Service Provider Interface
- `libdrm` - Direct Rendering Manager
- `libgbm` - Generic Buffer Manager
- `libxkbcommon` - XKB common library
- `electron` - Electron framework

## CachyOS-Specific Notes

CachyOS being Arch-based, you get all the benefits of:
- Rolling updates with the latest features
- Access to the AUR ecosystem
- Performance optimizations specific to CachyOS

The notes are stored in `~/.local/share/noteflow-notes` following the XDG Base Directory Specification.

## Troubleshooting

### Global Shortcut Not Working

If the global shortcut (Ctrl+Shift+Space) doesn't work, check if another application is using it:

```bash
# Check running applications that might capture the shortcut
# Try changing the shortcut in NoteFlow settings
```

### Wayland Considerations

On Wayland (default in many CachyOS setups), some Electron features may have limitations. NoteFlow handles most Wayland quirks automatically.

## Uninstallation

```bash
sudo pacman -R noteflow
```

Your notes in `~/.local/share/noteflow-notes` are preserved and can be manually deleted if desired.
