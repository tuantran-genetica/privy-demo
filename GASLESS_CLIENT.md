## Gasless Onchain Client Guide (Privy Embedded Wallet + Smart Accounts)

This guide explains how to build a client that interacts with onchain contracts using your existing setup:

- Privy authentication + embedded wallet
- Smart accounts (EntryPoint v0.7, Simple Account Factory)
- Gas sponsorship via a paymaster and a bundler
- Optional backend signing using the Privy App Wallet (to suppress user prompts)

The code references here align with the current app (`/app/`) and server (`/server/`) in this repo.

### Key Takeaway

- **Most of the boilerplate is handled for you.** Your job is mainly to define _what_ contract function to call and _with what arguments_.
- **Think of `saClient.writeContract()` as your main tool** for sending transactions. It automatically handles gas sponsorship and account abstraction magic.
- **The server is for secure signing.** When you enable "Use App Wallet", the embedded wallet's signature request goes to your backend, avoiding user prompts.
- **Error handling involves checking transaction status** on the bundler and on-chain logs. You can largely reuse the provided `pollUserOperationReceipt` and `checkTransactionStatus` functions.

### Prerequisites

- Frontend runs with Vite and proxies:
  - `/lifeai-rpc` → LifeAI testnet RPC (chain id 94909)
  - `/bundler` → Bundler JSON-RPC
  - `/paymaster` → Paymaster sponsorship endpoint
  - `/api` → Local signing server (backend)
- Smart account config:
  - EntryPoint (v0.7): `0xd308aE59cb31932E8D9305BAda32Fa782d3D5d42`
  - `VITE_SIMPLE_ACCOUNT_FACTORY`: address of your Simple Account factory
- Privy credentials (server-side): `PRIVY_APP_ID`, `PRIVY_CLIENT_ID`, `PRIVY_CLIENT_SECRET`

### Environment

Frontend (`/app/.env`):

```
VITE_PRIVY_APP_ID=...
VITE_PRIVY_CLIENT_ID=...
VITE_SIMPLE_ACCOUNT_FACTORY=0xYourSimpleAccountFactory
VITE_BUNDLER_URL=http://<bundler-host>:3000
VITE_PAYMASTER_URL=http://<paymaster-host>:4337
```

Backend (`/server/.env`):

```
PRIVY_APP_ID=...
PRIVY_CLIENT_ID=...
PRIVY_CLIENT_SECRET=...
PORT=8787
```

### Run services (dev)

```bash
# Terminal 1: backend signer
cd server && npm i && npm run dev

# Terminal 2: frontend
cd app && npm i && npm run dev
```

### Core building blocks

These are the foundational pieces you'll use in your React components or client-side logic. Most of these can be directly copied and reused.

1.  **Get the Privy embedded wallet and chain**

    This block fetches the user's embedded wallet (EOA) and the target chain configured in `App.jsx`.

    ```jsx
    import { useWallets } from "@privy-io/react-auth";

    const { wallets } = useWallets();
    // Find the Privy embedded wallet
    const embedded = wallets.find((w) => w.walletClientType === "privy");
    // The chain is passed as a prop from App.jsx or defined globally
    // For example: const chain = lifeAiTestnet; // from App.jsx
    ```

2.  **Create viem clients and Simple Smart Account**

    This sets up a `publicClient` to read blockchain data and an `owner` wallet client from the embedded wallet. It then uses these to derive or create the user's smart account address. **You generally won't need to modify this block.**

    ```ts
    import { createPublicClient, createWalletClient, http, custom } from "viem";
    import { toSimpleSmartAccount } from "permissionless/accounts";

    // Public client for reading data from the blockchain
    const publicClient = createPublicClient({
      chain,
      transport: http("/lifeai-rpc"), // Proxied to LifeAI testnet RPC
    });

    // Wallet client for the embedded wallet (EOA) as the owner of the smart account
    const owner = createWalletClient({
      account: embedded.address,
      chain,
      transport: custom(await embedded.getEthereumProvider()),
    });

    // The EntryPoint contract address for Account Abstraction (v0.7)
    const entryPoint = {
      address: "0xd308aE59cb31932E8D9305BAda32Fa782d3D5d42",
      version: "0.7",
    };

    // Derive/create the Simple Smart Account for the user
    const account = await toSimpleSmartAccount({
      client: publicClient,
      owner,
      entryPoint,
      factoryAddress: import.meta.env.VITE_SIMPLE_ACCOUNT_FACTORY, // Your deployed factory address
      index: 0n, // Unique identifier for each account, 0n for single account
    });

    console.log("User Smart Account address:", account.address);
    ```

3.  **Create a Smart Account client (bundler + paymaster)**

    This is the core client for sending gasless transactions. It's configured to use your bundler (`/bundler`) and paymaster (`/paymaster`) proxies. **This block is largely boilerplate and can be copied directly.**

    ```ts
    import { createSmartAccountClient } from "permissionless";
    import { http } from "viem";

    // Paymaster configuration for gas sponsorship
    const paymaster = {
      // Stub data to get initial gas estimates
      getPaymasterStubData: async () => ({
        paymaster: "0x86ee2542009532cd6196B7c6d3254Ac9F9E4ABbc", // Example paymaster address
        paymasterData: "0x",
        paymasterVerificationGasLimit: 300000n,
        paymasterPostOpGasLimit: 100n,
        callGasLimit: 400000n,
        verificationGasLimit: 300000n,
        preVerificationGas: 50000n,
      }),
      // Actual call to your paymaster for sponsorship (via Vite proxy)
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
        // The paymaster response includes gas limits and `paymasterData`
        return json.result ?? json;
      },
    };

    // The main client for sending gasless user operations
    const saClient = createSmartAccountClient({
      account, // The smart account created above
      chain,
      bundlerTransport: http("/bundler"), // Proxied to your bundler
      paymaster,
      userOperation: {
        estimateFeesPerGas: async () => ({
          maxFeePerGas: 0x7a5cf70d5n,
          maxPriorityFeePerGas: 0x3b9aca00n,
        }),
      },
    });
    ```

4.  **Optional: Backend signing to avoid user prompts (App Wallet)**

    This advanced pattern delegates the smart account's `signUserOperation` call to your backend server. This means the user will _not_ see a signature prompt from their embedded wallet when transactions are sent. **This block can be copied and used if you've set up your backend signer.**

    Your server exposes `POST /api/wallets/:walletId/rpc` that accepts `x-user-jwt` and performs `personal_sign` via Privy.

    ```ts
    import { getUserOperationHash } from "viem/account-abstraction";
    import { usePrivy } from "@privy-io/react-auth"; // Needed for getAccessToken and user object

    // Add these from usePrivy() hook
    // const { user, getAccessToken } = usePrivy();

    const accountWithBackendSigning = {
      ...account,
      signUserOperation: async (userOperation) => {
        // Compute the UserOperation hash (this is what the backend will sign)
        const uoHash = getUserOperationHash({
          userOperation: { ...userOperation, signature: "0x" },
          entryPointAddress: entryPoint.address,
          entryPointVersion: account.entryPoint.version,
          chainId: chain.id,
        });

        // Get the user's JWT for authorization with your backend
        const jwt = await getAccessToken(); // From Privy React SDK
        const walletId = user?.wallet?.id; // Get the embedded wallet's ID

        if (!walletId)
          throw new Error("No embedded wallet ID found in session.");

        // Call your backend server to sign the user operation hash
        const res = await fetch(`/api/wallets/${walletId}/rpc`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-user-jwt": jwt },
          body: JSON.stringify({
            method: "personal_sign",
            params: { message: uoHash, encoding: "hex" },
          }),
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`Backend signing error ${res.status}: ${errorText}`);
        }

        const { signature } = await res.json();
        if (!signature) throw new Error("Backend did not return a signature.");
        return signature;
      },
    };

    // Use accountWithBackendSigning in createSmartAccountClient
    // const saClient = createSmartAccountClient({ account: accountWithBackendSigning, ... })
    ```

### Read and write: ERC-20 example (transfer)

This demonstrates a typical ERC-20 token transfer, using the `saClient.writeContract()` method. The primary changes you'll make are defining the `address`, `abi`, `functionName`, and `args` for your contract call.

```ts
import { erc20Abi, parseUnits } from "viem";

// 1. Read balance (requires the publicClient, token address, ABI, function name, and args)
//    This part is for displaying information, not for transactions.
const decimals = await publicClient.readContract({
  address: token, // Address of the ERC-20 token contract
  abi: erc20Abi, // The ERC-20 ABI (from viem)
  functionName: "decimals",
});
const balance = await publicClient.readContract({
  address: token,
  abi: erc20Abi,
  functionName: "balanceOf",
  args: [account.address], // The smart account's address
});

// 2. Gasless transfer via smart account client (the core transaction step)
//    This is where you define your onchain interaction.
const value = parseUnits(amount, decimals); // Convert human-readable amount to BigInt with correct decimals
const userOpHash = await saClient.writeContract({
  address: token, // Target contract address (ERC-20 token)
  abi: erc20Abi, // Contract ABI
  functionName: "transfer", // The function to call
  args: [to, value], // Arguments for the function: recipient address, amount
});

console.log("User Operation Hash:", userOpHash);

// 3. Poll bundler for receipt (important for transaction confirmation)
//    You'll want to reuse the `pollUserOperationReceipt` function from `app/src/utils/erc20.js` here.
//    This handles waiting for the transaction to be bundled and mined.
// pollUserOperationReceipt(userOpHash, 0, 'transfer', createCallbacks());
```

### Gasless patterns you can reuse: faucet and stake

The flow is the same: build calldata and submit via `saClient.writeContract()`. The paymaster sponsors gas; the bundler includes your user operation.

1.  **Faucet contract call**

    Assuming a faucet contract exposes `claim()` or `mintTo(address,uint256)`:

    ```ts
    // ABI snippet
    const faucetAbi = [
      {
        name: "claim",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [],
        outputs: [],
      },
      // or: { name: 'mintTo', type: 'function', inputs: [{type: 'address'},{type: 'uint256'}], outputs: [] }
    ];

    // Call the faucet contract using the smart account client
    const faucetUserOpHash = await saClient.writeContract({
      address: faucetAddress, // Address of your faucet contract
      abi: faucetAbi, // ABI of the faucet contract
      functionName: "claim", // Function to call
      args: [], // Arguments for the function
    });
    console.log("Faucet User Operation Hash:", faucetUserOpHash);
    // Remember to poll for receipt!
    ```

2.  **Staking contract call**

    Assuming a staking contract exposes `stake(uint256)` or `deposit(uint256)` and the staked token is the ERC-20 above.

    ```ts
    const stakingAbi = [
      {
        name: "stake",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [{ name: "amount", type: "uint256" }],
        outputs: [],
      },
    ];

    // Optional: ensure allowance in the smart account for the staking contract
    // This is needed if the staking contract will "pull" tokens from the smart account.
    const allowance = await publicClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "allowance",
      args: [account.address, stakingAddress],
    });
    if (allowance < value) {
      // Approve the staking contract to spend tokens from the smart account
      const approveUserOpHash = await saClient.writeContract({
        address: token, // ERC-20 token contract address
        abi: erc20Abi, // ERC-20 ABI
        functionName: "approve", // Approve function
        args: [stakingAddress, value], // Staking contract address, amount to approve
      });
      console.log("Approve User Operation Hash:", approveUserOpHash);
      // Wait for approval to be processed before staking
      // await pollUserOperationReceipt(approveUserOpHash, 0, 'approval', createCallbacks());
    }

    // Stake tokens via the smart account client
    const stakeUserOpHash = await saClient.writeContract({
      address: stakingAddress, // Staking contract address
      abi: stakingAbi, // Staking contract ABI
      functionName: "stake", // Stake function
      args: [value], // Amount to stake
    });
    console.log("Stake User Operation Hash:", stakeUserOpHash);
    // Remember to poll for receipt!
    ```

### What stays the same across all interactions

- **Embedded wallet retrieval**: Get the Privy embedded wallet from `useWallets()` and its provider.
- **Clients**: Create `publicClient` (RPC via `/lifeai-rpc`) and `owner` (wallet client from embedded provider).
- **Smart account**: Compute/create Simple Smart Account using EntryPoint v0.7 and `VITE_SIMPLE_ACCOUNT_FACTORY`.
- **Smart account client**: Initialize once with the same bundler (`/bundler`) and paymaster (`/paymaster`) wiring and fee estimation.
- **Submit call**: Use `saClient.writeContract({...})` to send any onchain interaction.
- **Receipt/polling**: Poll bundler for `eth_getUserOperationReceipt`, and optionally fetch chain receipt; decode AA events for errors.
- **Optional backend signing**: Swap `account.signUserOperation` to call your server, passing the user JWT; the rest is unchanged.

These pieces are identical whether you transfer, approve, stake, claim a faucet, or call any custom contract.

### What changes per interaction

- **Contract details**: `address`, `abi`, `functionName`, `args`.
- **Pre-call checks**: Token `decimals`, balances, and allowances as applicable; any domain-specific validations.
- **Success criteria**: Which events/logs you expect (e.g., `Transfer`, `Approval`, or custom events) and how you present results in UI.
- **Edge-case handling**: For example, approvals before staking, minimum amounts, or specific revert reasons to surface.

### Where things live in this repo

- Frontend smart account + ERC-20 helpers: `app/src/utils/erc20.js`, `app/src/utils/aa.js`
- ERC-20 gasless demo UI: `app/src/components/GaslessErc20.jsx`
- Auth + embedded wallet init: `app/src/components/PrivyAuthUI.jsx`, `app/src/App.jsx`
- Vite proxies for RPC/bundler/paymaster/server: `app/vite.config.js`
- Backend signing endpoint: `server/index.js` (`POST /api/wallets/:walletId/rpc`)
