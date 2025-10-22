import React, { useMemo, useState, useEffect, useRef } from 'react'
import { useWallets } from '@privy-io/react-auth'
import {
  createClients,
  createSmartAccount,
  createSmartAccountClientWithPaymaster,
  pollUserOperationReceipt,
  analyzeTransactionFailure,
} from '../utils/onchain'
import {
  COUNTER_ADDRESS,
  COUNTER_ABI,
  preflightCounterCall,
  checkCounterTransactionStatus,
  readCounterValue
} from '../utils/counter'


export default function StatusPollingDemo({ chain }) {
  const { wallets } = useWallets()

  // Counter address (default to deployed Counter)
  const [counterAddress, setCounterAddress] = useState(COUNTER_ADDRESS)

  // Basic UI state
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Transaction state + polling
  const [txStatus, setTxStatus] = useState(null) // 'pending' | 'success' | 'failed'
  const [checking, setChecking] = useState(false)
  const [failureReason, setFailureReason] = useState('')
  const [userOpHash, setUserOpHash] = useState('')
  const [bundledTxHash, setBundledTxHash] = useState('')
  const [pollAttempts, setPollAttempts] = useState(0)

  // Track latest status to allow polling guards to stop after settlement
  const txStatusRef = useRef(null)

  const updateTxStatus = (status) => {
    setTxStatus(status)
    txStatusRef.current = status
  }

  // Local counter updated on success only
  const [counter, setCounter] = useState(0)
  const [pendingDelta, setPendingDelta] = useState(null) // +1 | -1 | null

  const explorerBase = useMemo(() => {
    if (chain?.id === 94909) return 'https://explorer-test.avax.network/lifeaitest'
    return undefined
  }, [chain?.id])

  // Apply counter change only when tx definitively succeeds
  useEffect(() => {
    if (txStatus === 'success' && pendingDelta != null) {
      setCounter(prev => prev + pendingDelta)
      setPendingDelta(null)
    }
    if (txStatus === 'failed' && pendingDelta != null) {
      // Do not change counter on failure
      setPendingDelta(null)
    }
  }, [txStatus, pendingDelta])

  // Fetch counter from contract whenever address or chain changes
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        if (!chain?.id || !counterAddress) return
        const value = await readCounterValue(chain, counterAddress)
        if (!cancelled) setCounter(Number(value))
      } catch (e) {
        // keep UI usable; surface a light error message
        if (!cancelled) {
          console.warn('Failed to read counter:', e)
        }
      }
    }
    load()
    return () => { cancelled = true }
  }, [chain?.id, counterAddress])

  // After a successful tx, refresh the value from chain to ensure accuracy
  useEffect(() => {
    let cancelled = false
    async function refreshOnSuccess() {
      try {
        if (txStatus !== 'success' || !chain?.id || !counterAddress) return
        const value = await readCounterValue(chain, counterAddress)
        if (!cancelled) setCounter(Number(value))
      } catch (e) {
        if (!cancelled) {
          console.warn('Failed to refresh counter after success:', e)
        }
      }
    }
    refreshOnSuccess()
    return () => { cancelled = true }
  }, [txStatus, chain?.id, counterAddress])

  const createCallbacks = () => ({
    setChecking,
    setTxStatus: updateTxStatus,
    setPollAttempts,
    setFailureReason,
    setBundledTxHash,
    getTxStatus: () => txStatusRef.current,
    checkTransactionStatus: (txHash, type = 'counter') =>
      checkCounterTransactionStatus(txHash, type, counterAddress, chain, createCallbacks()),
    analyzeTransactionFailure: (publicClient, receipt, txHash, type) =>
      analyzeTransactionFailure(publicClient, receipt, txHash, type, undefined, createCallbacks()),
  })

  async function sendCounterCall(fnName) {
    try {
      setBusy(true)
      setError('')
      updateTxStatus(null)
      setFailureReason('')
      setUserOpHash('')
      setBundledTxHash('')
      setPollAttempts(0)

      const embedded = wallets.find(w => w.walletClientType === 'privy')
      if (!embedded) throw new Error('Embedded wallet not found')

      const { publicClient, owner } = await createClients(embedded, chain)
      const account = await createSmartAccount(publicClient, owner, chain)
      const saClient = createSmartAccountClientWithPaymaster(account, chain)

      // Preflight simulation to catch immediate reverts and fail fast without polling
      const sim = await preflightCounterCall(publicClient, account.address, counterAddress, fnName)
      if (!sim.ok) {
        setTxStatus('failed')
        setFailureReason(sim.reason || 'Simulation failed')
        return
      }

      const uoHash = await saClient.writeContract({
        address: counterAddress,
        abi: COUNTER_ABI,
        functionName: fnName,
        args: []
      })
      setUserOpHash(uoHash || '')

      if (uoHash) {
        updateTxStatus('pending')
        pollUserOperationReceipt(uoHash, 0, 'counter', createCallbacks())
      }
    } catch (e) {
      console.error('StatusPollingDemo send error:', e)
      setError(e?.message || 'Send failed')
    } finally {
      setBusy(false)
    }
  }

  async function triggerSuccess(delta) {
    try {
      setPendingDelta(delta)
      await sendCounterCall(delta > 0 ? 'increase' : 'decrease')
    } catch (e) {
      setPendingDelta(null)
      setError(e?.message || 'Failed to start success call')
    }
  }

  async function triggerRevert() {
    try {
      setPendingDelta(null)
      setError('')

      // Call a function that always reverts to demonstrate failure handling
      await sendCounterCall('alwaysRevert')
    } catch (e) {
      setError(e?.message || 'Failed to start revert call')
    }
  }

  return (
    <div>
      <h2 className="h2">Status Polling Demo (EP v0.7)</h2>
      <div style={{ fontSize: '0.9em', color: '#666', marginBottom: 8 }}>
        EntryPoint v0.7: callData failures do not revert the user operation. Reverts are observed on eth_estimateUserOperationGas; runtime failures are surfaced via logs and status. This demo updates the counter only on finalized success.
      </div>

      <div style={{ display: 'grid', gap: 8, maxWidth: 560 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            className="input"
            placeholder="Counter address"
            value={counterAddress}
            onChange={(e) => setCounterAddress(e.target.value)}
            style={{ flex: 1 }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ padding: '8px 12px', background: '#f8f9fa', border: '1px solid #dee2e6', borderRadius: 4 }}>
            <strong>Counter:</strong> {counter}
          </div>
          <button className="btn btn-secondary" onClick={() => triggerSuccess(+1)} disabled={busy}>
            ✅ Success: Increment
          </button>
          <button className="btn btn-secondary" onClick={() => triggerSuccess(-1)} disabled={busy}>
            ✅ Success: Decrement
          </button>
          <button className="btn btn-primary" onClick={triggerRevert} disabled={busy}>
            ❌ Trigger Revert
          </button>
        </div>

        {userOpHash && (
          <div style={{ fontSize: '0.9em', color: '#555' }}>
            <div><strong>UserOp Hash:</strong> {userOpHash}</div>
            {bundledTxHash && explorerBase && (
              <div>
                <strong>Bundled Tx:</strong>{' '}
                <a href={`${explorerBase}/tx/${bundledTxHash}`} target="_blank" rel="noreferrer" style={{ color: '#1976d2', textDecoration: 'underline' }}>
                  View on Explorer
                </a>
              </div>
            )}
            <div><strong>Poll Attempts:</strong> {pollAttempts}</div>
          </div>
        )}

        {txStatus === 'pending' && (
          <div style={{ marginTop: 8, padding: 12, background: '#fff8e1', border: '1px solid #ffb300', borderRadius: 4, color: '#f57c00' }}>
            <strong>⏳ Processing...</strong>
            <br />
            <small>Waiting for confirmation.</small>
          </div>
        )}

        {txStatus === 'success' && (
          <div style={{ marginTop: 8, padding: 12, background: '#e8f5e8', border: '1px solid #4caf50', borderRadius: 4, color: '#2e7d32' }}>
            <strong>✅ Success</strong>
            <br />
            <small>Counter updated.</small>
          </div>
        )}

        {txStatus === 'failed' && (
          <div style={{ marginTop: 8, padding: 12, background: '#ffebee', border: '1px solid #f44336', borderRadius: 4, color: '#d32f2f' }}>
            <strong>❌ Failed</strong>
            <br />
            <small style={{ color: '#666' }}>{failureReason || 'Operation failed.'}</small>
          </div>
        )}

        {error && (
          <div style={{ marginTop: 8, padding: 12, background: '#ffebee', border: '1px solid #f44336', borderRadius: 4, color: '#d32f2f' }}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {userOpHash && (
          <button
            className="btn btn-secondary"
            onClick={() => pollUserOperationReceipt(userOpHash, 0, 'counter', createCallbacks())}
            disabled={checking}
            style={{ marginTop: 4 }}
          >
            {checking ? 'Checking...' : 'Check Status'}
          </button>
        )}
      </div>
    </div>
  )
}


