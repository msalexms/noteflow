<div align="center">
  <img src="docs/screenshots/app-main-midnightblue.png" alt="NoteFlow Screenshot" width="800">

  # NoteFlow

  **Fast notes for Windows & Linux developers.**
  *Local files, optional private GitHub sync. No telemetry. Just you and your thoughts.*

  [![GitHub Release](https://img.shields.io/github/v/release/yagoid/noteflow?style=flat-square&color=3de8c2)](https://github.com/yagoid/noteflow/releases/latest)
  [![License](https://img.shields.io/github/license/yagoid/noteflow?style=flat-square)](LICENSE)

</div>

---

## What is NoteFlow?

NoteFlow is a keyboard-first, lightweight note-taking application for **Windows and Linux**.

It was built specifically for software engineers, power users, or anyone simply tired of the clunky, pre-installed Windows Sticky Notes apps and looking for something faster than heavy tools like Notion.

If you just need to scratch down a quick task list, jot down some code snippets, or drop a quick markdown heading—this is the tool for you.

## Features

- **Markdown-first editor**: Write with full Markdown support—headings, bold, italic, inline code, and code blocks.
- **Interactive Task Lists**: Add checkboxes to any note, check them off, and keep track of your daily sprint or tasks.
- **Multi-tab workflow**: Open multiple notes at once in tabs and switch context instantly without losing your place.
- **Instant Search**: Find any note by title or content in milliseconds.
- **Private by design**: Notes are stored as plain `.md` files on your machine. Optionally sync to a **private GitHub repository you own** — no third-party cloud, no shared servers, no tracking.
- **GitHub Sync**: Connect your GitHub account once and all notes automatically push to a private repository. Pull changes on startup to keep notes in sync across devices.
- **Developer Aesthetic**: 4 built-in themes (Carbon, Midnight Blue, Tokyo Night, Arctic Day), monospace font (JetBrains Mono), and minimal chrome that feels at home next to your IDE.

## Download

Ready to focus? Download the latest `.exe` installer for Windows 10/11 directly from the [Releases page](https://github.com/yagoid/noteflow/releases/latest).

*[View the official landing page](https://yagoid.github.io/noteflow/)*

## Development

NoteFlow is built with React, TypeScript, Vite, and Electron.

To run the app locally:

```bash
# Clone the repository
git clone https://github.com/yagoid/noteflow.git
cd noteflow

# Install dependencies
npm install

# Start the development server
npm run dev
```

To build the installers:

```bash
npm run dist
# Generates: NoteFlow-X.Y.Z-Setup.exe (Windows) and noteflow_X.Y.Z_amd64.deb (Linux)
```

## License

This project is licensed under the MIT License.
