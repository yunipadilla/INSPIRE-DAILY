#!/bin/sh
cd "$(dirname "$0")" || exit 1
exec "$HOME/.local/nodejs/bin/node" --env-file=.env src/index.js
