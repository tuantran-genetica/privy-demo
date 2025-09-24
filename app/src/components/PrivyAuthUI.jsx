import React, { useEffect, useState } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { createPublicClient, createWalletClient, http, custom, formatEther } from 'viem'
import { toSimpleSmartAccount } from 'permissionless/accounts'

export function PrivyAuthUI({ chain }) {
  const { ready, authenticated, user, login, logout } = usePrivy()
  const { wallets } = useWallets()
  const [balance, setBalance] = useState('')
  const [error, setError] = useState('')
  const [smartAddress, setSmartAddress] = useState('')
  const [saError, setSaError] = useState('')

  // Find the embedded wallet using Privy's recommended approach
  const embedded = wallets.find(wallet => 
    wallet.walletClientType === 'privy'
  )
  
  // Debug logging to understand wallet structure
  useEffect(() => {
    if (authenticated && wallets.length > 0) {
      console.log('Available wallets:', wallets)
      console.log('Embedded wallet found:', embedded)
      wallets.forEach((wallet, index) => {
        console.log(`Wallet ${index}:`, {
          walletClientType: wallet.walletClientType,
          address: wallet.address,
          type: wallet.type
        })
      })
    }
  }, [authenticated, wallets, embedded])

  useEffect(() => {
    async function fetchBalance() {
      try {
        if (!embedded?.address) {
          setBalance('')
          return
        }
        const client = createPublicClient({ chain, transport: http('/lifeai-rpc') })
        const wei = await client.getBalance({ address: embedded.address })
        setBalance(formatEther(wei))
      } catch {
        setBalance('')
      }
    }
    if (authenticated) fetchBalance()
  }, [authenticated, embedded?.address])

  // Initialize a Simple Smart Account on login using factory address
  useEffect(() => {
    async function initSmartWallet() {
      try {
        setSaError('')
        setSmartAddress('')
        if (!authenticated) return
        if (!embedded?.address) return
        if (!chain?.id) return
        const accountFactory = import.meta.env.VITE_SIMPLE_ACCOUNT_FACTORY
        if (!accountFactory) {
          setSaError('Missing VITE_SIMPLE_ACCOUNT_FACTORY')
          return
        }
        const provider = await embedded.getEthereumProvider()
        const walletClient = createWalletClient({ account: embedded.address, chain, transport: custom(provider) })
        const owner = walletClient
        const entryPoint = { address: '0xd308aE59cb31932E8D9305BAda32Fa782d3D5d42', version: '0.7' }
        const client = createPublicClient({ chain, transport: http('/lifeai-rpc') })
        const account = await toSimpleSmartAccount({ client, owner, entryPoint, factoryAddress: accountFactory, index: 0n })
        let computed = account.address
        if (!computed || computed === '0x0000000000000000000000000000000000000000') {
          // Fallback: compute via factory directly
          const simpleFactoryAbi = [
            { name: 'getAddress', type: 'function', stateMutability: 'view', inputs: [ { name: 'owner', type: 'address' }, { name: 'salt', type: 'uint256' } ], outputs: [ { name: 'addr', type: 'address' } ] }
          ]
          // Verify factory has code (not EOA and not empty)
          const code = await client.getBytecode({ address: accountFactory })
          if (!code || code === '0x') throw new Error('Factory not deployed on this chain')
          try {
            computed = await client.readContract({ address: accountFactory, abi: simpleFactoryAbi, functionName: 'getAddress', args: [embedded.address, 0n] })
          } catch (readErr) {
            throw new Error('Factory getAddress reverted. Verify factory address & ABI')
          }
        }
        setSmartAddress(computed)
      } catch (e) {
        setSaError(e?.message || 'Smart wallet init failed')
      }
    }
    initSmartWallet()
  }, [authenticated, embedded?.address, chain?.id])

  const info = (
    <div>
      <div className="label" style={{ marginBottom: 8 }}>
        <strong>Status:</strong> {authenticated ? 'Authenticated' : 'Logged out'}
      </div>
      {authenticated && (
        <div style={{ lineHeight: 1.6 }}>
          <div><strong>User ID:</strong> {user?.id}</div>
          <div><strong>Email:</strong> {user?.email?.address || '—'}</div>
          <div><strong>Twitter:</strong> {user?.twitter?.username || '—'}</div>
          <div><strong>Wallets Found:</strong> {wallets.length}</div>
          <div><strong>Embedded Wallet:</strong> {embedded?.address || '—'} (Sepolia)</div>
          {embedded && (
            <div style={{ fontSize: '0.9em', color: '#666' }}>
              <strong>Wallet Type:</strong> {embedded.walletClientType || embedded.type || 'unknown'}
            </div>
          )}
          <div><strong>Smart Wallet (Simple):</strong> {smartAddress || '—'}</div>
          <div><strong>Sepolia Balance:</strong> {balance ? `${balance} ETH` : '—'}</div>
          {authenticated && wallets.length === 0 && (
            <div style={{ color: '#666', fontSize: '0.9em', marginTop: 8 }}>
              Creating embedded wallet...
            </div>
          )}
        </div>
      )}
    </div>
  )

  return (
    <div>
      <h2 className="h2">Auth + Wallet</h2>
      {ready ? info : <div>Loading…</div>}
      <div style={{ marginTop: 12 }}>
        {ready && (
          !authenticated ? (
            <button 
              onClick={async () => {
                try {
                  setError('')
                  await login({
                    loginMethods: ['email','google','sms'],
                  })
                } catch (err) {
                  console.error('Login error:', err)
                  setError('Login failed. Please check your Privy dashboard configuration.')
                }
              }} 
              className="btn btn-primary"
            >
              Log in (email / Twitter / wallet)
            </button>
          ) : (
            <button onClick={() => logout()} className="btn btn-muted">Log out</button>
          )
        )}
        {error && (
          <div style={{ marginTop: 12, padding: 12, background: '#ffebee', border: '1px solid #f44336', borderRadius: 4, color: '#d32f2f' }}>
            <strong>Error:</strong> {error}
          </div>
        )}
        {saError && (
          <div style={{ marginTop: 12, padding: 12, background: '#fff8e1', border: '1px solid #ffb300', borderRadius: 4, color: '#795548' }}>
            <strong>Smart Wallet:</strong> {saError}
          </div>
        )}
      </div>
    </div>
  )
}


