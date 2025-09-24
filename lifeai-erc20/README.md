# LifeAI ERC-20 Deploy (Foundry)

Deploy a simple ERC-20 and mint the entire supply to the deployer address derived from your PRIVATE_KEY.

## Prereqs

- Foundry installed (curl -L https://foundry.paradigm.xyz | bash && foundryup)

## Files

- src/SimpleERC20.sol — minimal ERC-20 (OpenZeppelin)
- script/DeploySimpleERC20.s.sol — deployment script

## Env

```
export PRIVATE_KEY=0xYOUR_PRIVATE_KEY
export RPC_URL=https://subnets.avax.network/lifeaitest/testnet/rpc
# Optional
export TOKEN_NAME="LifeAI Test Token"
export TOKEN_SYMBOL="LIFE"
export TOTAL_SUPPLY=$(cast --to-wei 1000000 ether)
```

## Deploy

```
forge script script/DeploySimpleERC20.s.sol:DeploySimpleERC20 \
  --rpc-url $RPC_URL --broadcast --private-key $PRIVATE_KEY -vvvv
```

## Verify

```
cast wallet address --private-key $PRIVATE_KEY
cast call <TOKEN_ADDRESS> "balanceOf(address)(uint256)" <BENEFICIARY> --rpc-url $RPC_URL
```
