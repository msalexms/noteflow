#!/bin/bash
# Post-install: create 'noteflow' CLI symlink
CLI_PATH="/opt/NoteFlow/resources/cli/noteflow.js"
if [ -f "$CLI_PATH" ]; then
  chmod +x "$CLI_PATH"
  ln -sf "$CLI_PATH" /usr/local/bin/noteflow
fi
