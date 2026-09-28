#!/bin/bash
# Double-click to install Think First so it runs in the background and starts at login.
cd "$(dirname "$0")"
python3 thinkfirst.py --install && open "http://127.0.0.1:47321"
echo
echo "You can close this window."
