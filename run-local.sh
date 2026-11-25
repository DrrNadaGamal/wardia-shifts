#!/bin/sh
# Starts the local server, runs a command against it, stops the server. Usage: ./run-local.sh node e2e/e2e.mjs http://localhost:3100
PORT=3100 node dev-server.mjs & S=$!; sleep 1.5; "$@"; R=$?; kill $S; exit $R
