# Gasless Onchain Client Guide (Privy Embedded Wallet + Smart Accounts)

## Important Details First

- Main lever: saClient.writeContract() — use this for all contract calls (transfer, approve, stake, faucet, custom).
- Gasless by default: Bundler + paymaster handle submission and sponsorship. You don’t pay gas.
- Smart Account creation: Always through EntryPoint v0.7 and your SimpleAccountFactory. No manual setup required.
- Error handling: Use the provided pollUserOperationReceipt and checkTransactionStatus helpers to confirm execution.
- Backend signing: Only required if you want to suppress wallet prompts for a smoother UX. Skip otherwise.

---

## Boilerplate

### Retrieve embedded wallet

import { useWallets } from "@privy-io/react-auth";

const { wallets } = useWallets();
const embedded = wallets.find((w) => w.walletClientType === "privy");

### Create clients and smart account

import { createPublicClient, createWalletClient, http, custom } from "viem";
import { toSimpleSmartAccount } from "permissionless/accounts";

const publicClient = createPublicClient({
  chain,
  transport: http("/lifeai-rpc"),
});

const owner = createWalletClient({
  account: embedded.address,
  chain,
  transport: custom(await embedded.getEthereumProvider()),
});

const entryPoint = {
  address: "0xd308aE59cb31932E8D9305BAda32Fa782d3D5d42",
  version: "0.7",
};

const account = await toSimpleSmartAccount({
  client: publicClient,
  owner,
  entryPoint,
  factoryAddress: import.meta.env.VITE_SIMPLE_ACCOUNT_FACTORY,
  index: 0n,
});

### Smart Account client (bundler + paymaster)

import { createSmartAccountClient } from "permissionless";
import { http } from "viem";

const paymaster = {
  getPaymasterStubData: async () => ({
    paymaster: "0x86ee2542009532cd6196B7c6d3254Ac9F9E4ABbc",
    paymasterData: "0x",
    paymasterVerificationGasLimit: 300000n,
    paymasterPostOpGasLimit: 100n,
    callGasLimit: 400000n,
    verificationGasLimit: 300000n,
    preVerificationGas: 50000n,
  }),
  getPaymasterData: async (userOperation) => {
    const res = await fetch("/paymaster", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "pm_sponsorUserOperation",
        params: [userOperation, entryPoint.address],
      }),
    });
    const json = await res.json();
    return json.result ?? json;
  },
};

const saClient = createSmartAccountClient({
  account,
  chain,
  bundlerTransport: http("/bundler"),
  paymaster,
  userOperation: {
    estimateFeesPerGas: async () => ({
      maxFeePerGas: 0x7a5cf70d5n,
      maxPriorityFeePerGas: 0x3b9aca00n,
    }),
  },
});

---

## Backend signing (required only for better UX)

Use if you want to remove wallet prompts. Skip if prompts are acceptable.

import { getUserOperationHash } from "viem/account-abstraction";
import { usePrivy } from "@privy-io/react-auth";

const { user, getAccessToken } = usePrivy();

const accountWithBackendSigning = {
  ...account,
  signUserOperation: async (userOperation) => {
    const uoHash = getUserOperationHash({
      userOperation: { ...userOperation, signature: "0x" },
      entryPointAddress: entryPoint.address,
      entryPointVersion: account.entryPoint.version,
      chainId: chain.id,
    });

    const jwt = await getAccessToken();
    const walletId = user?.wallet?.id;
    if (!walletId) throw new Error("No embedded wallet ID found.");

    const res = await fetch(`/api/wallets/${walletId}/rpc`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-user-jwt": jwt },
      body: JSON.stringify({
        method: "personal_sign",
        params: { message: uoHash, encoding: "hex" },
      }),
    });

    if (!res.ok) throw new Error(`Backend signing failed ${res.status}`);

    const { signature } = await res.json();
    if (!signature) throw new Error("No signature returned");
    return signature;
  },
};

---

## Example: ERC-20 transfer

import { erc20Abi, parseUnits } from "viem";

const decimals = await publicClient.readContract({
  address: token,
  abi: erc20Abi,
  functionName: "decimals",
});

const balance = await publicClient.readContract({
  address: token,
  abi: erc20Abi,
  functionName: "balanceOf",
  args: [account.address],
});

const value = parseUnits(amount, decimals);

const userOpHash = await saClient.writeContract({
  address: token,
  abi: erc20Abi,
  functionName: "transfer",
  args: [to, value],
});

console.log("User Operation Hash:", userOpHash);

---

## Example: Faucet contract call

const faucetAbi = [
  {
    name: "claim",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
];

const faucetUserOpHash = await saClient.writeContract({
  address: faucetAddress,
  abi: faucetAbi,
  functionName: "claim",
  args: [],
});

console.log("Faucet User Operation Hash:", faucetUserOpHash);

---

## Example: Staking contract call

const stakingAbi = [
  {
    name: "stake",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
];

const allowance = await publicClient.readContract({
  address: token,
  abi: erc20Abi,
  functionName: "allowance",
  args: [account.address, stakingAddress],
});

if (allowance < value) {
  const approveUserOpHash = await saClient.writeContract({
    address: token,
    abi: erc20Abi,
    functionName: "approve",
    args: [stakingAddress, value],
  });
  console.log("Approve User Operation Hash:", approveUserOpHash);
}

const stakeUserOpHash = await saClient.writeContract({
  address: stakingAddress,
  abi: stakingAbi,
  functionName: "stake",
  args: [value],
});

console.log("Stake User Operation Hash:", stakeUserOpHash);

---

## What Stays the Same

- Embedded wallet retrieval
- Clients (publicClient, owner)
- Smart Account setup
- Smart Account client init
- Submit via saClient.writeContract
- Poll receipts
- Optional backend signing

---

## What Changes Per Interaction

- Contract details: address, abi, functionName, args
- Pre-call checks: balances, decimals, allowances
- Success criteria: logs, events
- Edge cases: approvals, minimums, reverts
