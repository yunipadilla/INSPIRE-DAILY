#!/bin/sh
# Ensures Vite (and Tailwind's PostCSS config search, which resolves from
# process.cwd()) always runs with this directory as the working directory,
# regardless of how the parent process launches this script.
cd "$(dirname "$0")" || exit 1
exec "$HOME/.local/nodejs/bin/node" node_modules/vite/bin/vite.js
