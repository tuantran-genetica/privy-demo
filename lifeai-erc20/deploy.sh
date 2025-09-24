#!/usr/bin/env bash
set -euo pipefail

: "${PRIVATE_KEY:?Set PRIVATE_KEY}"
: "${RPC_URL:?Set RPC_URL}"

export TOKEN_NAME="${TOKEN_NAME:-LifeAI Test Token}"
export TOKEN_SYMBOL="${TOKEN_SYMBOL:-LIFE}"
export TOTAL_SUPPLY="${TOTAL_SUPPLY:-1000000000000000000000000}"

forge script script/DeploySimpleERC20.s.sol:DeploySimpleERC20 \
  --rpc-url "$RPC_URL" --broadcast --private-key "$PRIVATE_KEY" -vvvv
