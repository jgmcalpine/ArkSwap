#!/bin/bash

# Script to get blockchain info from the local Bitcoin Regtest network
# Usage: ./scripts/get-info.sh

# Credentials must match docker-compose.yml
RPC_USER="ark"
RPC_PASS="ark"
RPC_URL="http://127.0.0.1:18443/"

# -u adds authentication
# Removed -s so we can see connection errors if they happen
RESULT=$(curl --user $RPC_USER:$RPC_PASS \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "1.0", "id": "getinfo", "method": "getblockchaininfo", "params": []}' \
  "$RPC_URL")

echo "Response from Bitcoin Core:"
echo "---------------------------"

# Check if we got an empty response (connection failed)
if [ -z "$RESULT" ]; then
  echo "Error: No response. Is Docker running? Is the port correct?"
  exit 1
fi

# Print the result (using jq if available for colors, otherwise raw)
if command -v jq &> /dev/null; then
  echo "$RESULT" | jq '.result'
else
  echo "$RESULT"
fi