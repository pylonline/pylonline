#!/usr/bin/env bash
exec /home/asta/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome --no-sandbox --disable-setuid-sandbox "$@"
