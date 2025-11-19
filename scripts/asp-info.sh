#!/bin/bash

# Script to get ASP status from the local Ark Service Provider
# Usage: ./scripts/asp-info.sh

ASP_URL="http://localhost:7070/v1/info"

echo "Querying ASP status..."
echo "---------------------------"

# Query the ASP info endpoint
RESULT=$(curl -s -f "$ASP_URL")

# Check if we got an empty response or if curl failed
if [ $? -ne 0 ] || [ -z "$RESULT" ]; then
  echo "Error: Failed to connect to ASP. Is Docker running? Is the ASP service up?"
  echo "URL: $ASP_URL"
  exit 1
fi

# Print the result (using jq if available for formatting, otherwise raw)
if command -v jq &> /dev/null; then
  echo "$RESULT" | jq '.'
else
  echo "$RESULT"
fi

