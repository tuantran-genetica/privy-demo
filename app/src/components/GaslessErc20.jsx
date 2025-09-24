import React, { useMemo, useState } from 'react'
import { useWallets, usePrivy } from '@privy-io/react-auth'
import { createPublicClient, createWalletClient, http, custom } from 'viem'
import { getUserOperationHash } from 'viem/account-abstraction'
import { createSmartAccountClient } from 'permissionless'
import { toSimpleSmartAccount } from 'permissionless/accounts'
import { buildPaymasterBody, normalizeSponsorship, parseUnits } from '../utils/aa'

const erc20Abi = [
  { name: 'transfer', type: 'function', stateMutability: 'nonpayable', inputs: [ { name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' } ], outputs: [ { name: '', type: 'bool' } ] },
]

export default function GaslessErc20({ chain }) {
  const { wallets } = useWallets()
  const { user } = usePrivy()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [hash, setHash] = useState('')
  const [token, setToken] = useState('')
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [useAppWallet, setUseAppWallet] = useState(false)

  const explorerBase = useMemo(() => {
    if (chain?.id === 94909) return 'https://explorer-test.avax.network/lifeaitest'
    return undefined
  }, [chain?.id])

  async function send() {
    try {
      setBusy(true)
      setError('')
      setHash('')
      if (!token || !to || !amount) throw new Error('Fill token, to, amount')

      const embedded = wallets.find(w => w.walletClientType === 'privy')
      if (!embedded) throw new Error('Embedded wallet not found')

      const provider = await embedded.getEthereumProvider()
      const owner = createWalletClient({ account: embedded.address, chain, transport: custom(provider) })
      const entryPoint = { address: '0xd308aE59cb31932E8D9305BAda32Fa782d3D5d42', version: '0.7' }
      const publicClient = createPublicClient({ chain, transport: http('/lifeai-rpc') })
      const accountFactory = import.meta.env.VITE_SIMPLE_ACCOUNT_FACTORY
      if (!accountFactory) throw new Error('Missing VITE_SIMPLE_ACCOUNT_FACTORY')

      let account = await toSimpleSmartAccount({ client: publicClient, owner, entryPoint, factoryAddress: accountFactory, index: 0n })

      // Optional: use App Wallet (backend signing) to avoid user prompts
      if (useAppWallet) {
        account = {
          ...account,
          // Delegate signing to backend App Wallet
          signUserOperation: async (userOperation) => {
            // Compute EP 0.7 userOp hash (EIP-191 raw hash)
            const hash = getUserOperationHash({
              userOperation: { ...userOperation, signature: '0x' },
              entryPointAddress: entryPoint.address,
              entryPointVersion: account.entryPoint.version,
              chainId: chain.id
            })
            // Resolve current App Wallet ID from session (linked_accounts)
            let appWalletId = import.meta.env.VITE_PRIVY_APP_WALLET_ID
            if (!appWalletId) {
              const linked = (user?.linkedAccounts || user?.linked_accounts || [])
              const appWallet = linked.find((a) => (a?.type === 'wallet' || a?.type === 'embedded_wallet' || a?.wallet_client === 'privy' || a?.walletClient === 'privy'))
              appWalletId = appWallet?.id
            }
            if (!appWalletId) throw new Error('No App Wallet ID available in session')
            const res = await fetch(`/app-wallet-sign/v1/wallets/${appWalletId}/rpc`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ method: 'personal_sign', params: { message: hash, encoding: 'hex' } })
            })
            if (!res.ok) throw new Error(`App wallet sign error ${res.status}: ${await res.text()}`)
            const data = await res.json()
            const sig = data?.data?.signature || data?.signature
            if (!sig) throw new Error('App wallet did not return signature')
            return sig
          }
        }
      }

      const bundlerTransport = http('/bundler')
      const paymasterBase = '/paymaster'

      const customPaymaster = {
        getPaymasterStubData: async () => ({
          paymaster: '0x86ee2542009532cd6196B7c6d3254Ac9F9E4ABbc',
          paymasterData: '0x',
          paymasterVerificationGasLimit: 300000n,
          paymasterPostOpGasLimit: 100n,
          callGasLimit: 200000n,
          verificationGasLimit: 300000n,
          preVerificationGas: 50000n
        }),
        getPaymasterData: async (userOperation) => {
          const tempUO = {
            ...userOperation,
            callGasLimit: userOperation.callGasLimit || 200000n,
            verificationGasLimit: userOperation.verificationGasLimit || 300000n,
            preVerificationGas: userOperation.preVerificationGas || 50000n,
            maxFeePerGas: userOperation.maxFeePerGas || 0x7A5CF70D5n,
            maxPriorityFeePerGas: userOperation.maxPriorityFeePerGas || 0x3B9ACA00n
          }
          const res = await fetch(paymasterBase, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: buildPaymasterBody(tempUO, entryPoint.address)
          })
          if (!res.ok) throw new Error(`Paymaster error ${res.status}: ${await res.text()}`)
          const raw = await res.json()
          if (raw.error) throw new Error(raw.error.message)
          return normalizeSponsorship(raw.result || raw)
        }
      }

      const saClient = createSmartAccountClient({
        account,
        chain,
        bundlerTransport,
        paymaster: customPaymaster,
        userOperation: {
          estimateFeesPerGas: async () => ({ maxFeePerGas: 0x7A5CF70D5n, maxPriorityFeePerGas: 0x3B9ACA00n })
        }
      })

      const value = parseUnits(amount, 18)
      const txHash = await saClient.writeContract({
        address: token,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [to, value]
      })
      setHash(txHash || '')
    } catch (e) {
      setError(e?.message || 'ERC20 transfer failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <h2 className="h2">Gasless ERC-20 Transfer</h2>
      <div style={{ display: 'grid', gap: 8, maxWidth: 560 }}>
        <input className="input" placeholder="Token address" value={token} onChange={(e) => setToken(e.target.value)} />
        <input className="input" placeholder="Recipient address" value={to} onChange={(e) => setTo(e.target.value)} />
        <input className="input" placeholder="Amount (decimals 18)" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={useAppWallet} onChange={(e) => setUseAppWallet(e.target.checked)} />
          Use App Wallet (no prompts)
        </label>
        <button className="btn btn-primary" onClick={send} disabled={busy}>Send gasless transfer</button>
      </div>
      {hash && (
        <div style={{ marginTop: 12 }}>
          <strong>Tx:</strong>{' '}
          {explorerBase ? (
            <a href={`${explorerBase}/tx/${hash}`} target="_blank" rel="noreferrer">{hash}</a>
          ) : (
            <span>{hash}</span>
          )}
        </div>
      )}
      {error && (
        <div style={{ marginTop: 12, padding: 12, background: '#ffebee', border: '1px solid #f44336', borderRadius: 4, color: '#d32f2f' }}>
          <strong>Error:</strong> {error}
        </div>
      )}
    </div>
  )
}


