#!/bin/bash

# Script to mine blocks on the local Bitcoin Regtest network
# Usage: ./scripts/mine.sh [number_of_blocks]
# Default: 1 block

BLOCKS=${1:-1}
RPC_USER="ark"
RPC_PASS="ark"
RPC_URL="http://127.0.0.1:18443/"
WALLET_NAME="default"

echo "Mining $BLOCKS block(s)..."

# 1. Try to create a wallet (ignore error if it already exists)
# This ensures we have a place to store the mining rewards
curl -s --user $RPC_USER:$RPC_PASS -X POST \
  -H "Content-Type: application/json" \
  -d "{\"jsonrpc\": \"1.0\", \"id\": \"init\", \"method\": \"createwallet\", \"params\": [\"$WALLET_NAME\"]}" \
  "$RPC_URL" > /dev/null

# 2. Get a new address for mining
# We explicitly ask for a 'bech32' address to ensure modern SegWit compatibility
ADDRESS_JSON=$(curl -s --user $RPC_USER:$RPC_PASS -X POST \
  -H "Content-Type: application/json" \
  -d "{\"jsonrpc\": \"1.0\", \"id\": \"mine\", \"method\": \"getnewaddress\", \"params\": [\"\", \"bech32\"]}" \
  "$RPC_URL")

# Parse the address safely
ADDRESS=$(echo "$ADDRESS_JSON" | grep -o '"result":"[^"]*"' | cut -d'"' -f4)

if [ -z "$ADDRESS" ]; then
  echo "Error: Failed to get a new address."
  echo "Raw Response from Bitcoin Core:"
  echo "$ADDRESS_JSON"
  exit 1
fi

# 3. Mine blocks to the address
RESULT=$(curl -s --user $RPC_USER:$RPC_PASS -X POST \
  -H "Content-Type: application/json" \
  -d "{\"jsonrpc\": \"1.0\", \"id\": \"mine\", \"method\": \"generatetoaddress\", \"params\": [$BLOCKS, \"$ADDRESS\"]}" \
  "$RPC_URL")

# Check if the request was successful
if echo "$RESULT" | grep -q '"error":null'; then
  echo "Success! Mined $BLOCKS blocks to $ADDRESS"
  if command -v jq &> /dev/null; then
    echo "$RESULT" | jq '.result'
  else
    echo "$RESULT"
  fi
else
  echo "Error mining blocks:"
  echo "$RESULT"
  exit 1
fi