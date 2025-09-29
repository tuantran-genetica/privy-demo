import React, { useState } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { createPublicClient, createWalletClient, http, custom } from 'viem'

// Minimal ABI for WorkScoreTracker.submitQuizResult(bool,uint256,bytes)
const workScoreTrackerAbi = [
  {
    type: 'function',
    name: 'submitQuizResult',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'isCorrect', type: 'bool' },
      { name: 'nonce', type: 'uint256' },
      { name: 'signature', type: 'bytes' }
    ],
    outputs: []
  }
]

const CONTRACT_ADDRESS = '0xD56373220aC322D632E1114d25c3B5746519aB6f'

export default function QuizSubmit({ chain }) {
  const { authenticated } = usePrivy()
  const { wallets = [] } = useWallets()

  const [isCorrect, setIsCorrect] = useState(true)
  const [nonce, setNonce] = useState('')
  const [signature, setSignature] = useState('')
  const [sending, setSending] = useState(false)
  const [txHash, setTxHash] = useState('')
  const [error, setError] = useState('')

  async function onSubmit(e) {
    e.preventDefault()
    try {
      setSending(true)
      setError('')
      setTxHash('')

      if (!authenticated) throw new Error('Please log in first')
      const embedded = wallets.find(w => w.walletClientType === 'privy')
      // Fallback to injected/external wallet if embedded not found
      const injectedFromPrivy = wallets.find(w => w.walletClientType && w.walletClientType !== 'privy')

      let accountAddress
      let provider

      if (embedded) {
        provider = await embedded.getEthereumProvider()
        accountAddress = embedded.address
      } else if (injectedFromPrivy) {
        provider = await injectedFromPrivy.getEthereumProvider()
        accountAddress = injectedFromPrivy.address
      } else if (typeof window !== 'undefined' && window.ethereum) {
        provider = window.ethereum
        const accounts = await provider.request({ method: 'eth_requestAccounts' })
        accountAddress = accounts?.[0]
        if (!accountAddress) throw new Error('No injected accounts available')
      } else {
        throw new Error('No wallet found (embedded or injected)')
      }

      const walletClient = createWalletClient({ account: accountAddress, chain, transport: custom(provider) })
      const publicClient = createPublicClient({ chain, transport: http('/lifeai-rpc') })

      const txHashLocal = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: workScoreTrackerAbi,
        functionName: 'submitQuizResult',
        args: [Boolean(isCorrect), BigInt(nonce), signature]
      })

      setTxHash(txHashLocal)
      await publicClient.waitForTransactionReceipt({ hash: txHashLocal })
    } catch (err) {
      setError(err?.message || String(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <div>
      <h3>Submit Quiz Result</h3>
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12, maxWidth: 640 }}>
        <label>
          <div>isCorrect:</div>
          <select value={String(isCorrect)} onChange={e => setIsCorrect(e.target.value === 'true')}>
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        </label>

        <label>
          <div>nonce:</div>
          <input
            type="text"
            placeholder="e.g. 4763..."
            value={nonce}
            onChange={e => setNonce(e.target.value)}
            required
          />
        </label>

        <label>
          <div>signature:</div>
          <textarea
            placeholder="0x..."
            value={signature}
            onChange={e => setSignature(e.target.value)}
            rows={3}
            required
          />
        </label>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button type="submit" disabled={sending}>
            {sending ? 'Sending...' : 'Submit Quiz'}
          </button>
          {txHash && (
            <span style={{ fontSize: 12 }}>tx: {txHash}</span>
          )}
        </div>
      </form>
      {error && (
        <div style={{ marginTop: 8, color: 'crimson' }}>{error}</div>
      )}
    </div>
  )
}


