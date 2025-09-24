import React, { useEffect, useState } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { createPublicClient, http, formatEther } from 'viem'

export function PrivyAuthUI() {
  const { ready, authenticated, user, login, logout } = usePrivy()
  const { wallets } = useWallets()
  const [balance, setBalance] = useState('')
  const [error, setError] = useState('')

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
        const client = createPublicClient({ transport: http() })
        const wei = await client.getBalance({ address: embedded.address })
        setBalance(formatEther(wei))
      } catch {
        setBalance('')
      }
    }
    if (authenticated) fetchBalance()
  }, [authenticated, embedded?.address])

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
      </div>
    </div>
  )
}


