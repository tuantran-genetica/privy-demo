import { createPublicClient, http, parseEventLogs } from 'viem'

// Deployed Counter on LifeAI testnet (chainId 94909)
export const COUNTER_ADDRESS = '0xd04e87711bfaeadd9ea438531cf646cfbb741d27'

// Full ABI (events + functions) for Counter
export const COUNTER_ABI = [
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "caller", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "newValue", "type": "uint256" }
    ],
    "name": "Decrement",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "caller", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "newValue", "type": "uint256" }
    ],
    "name": "Increment",
    "type": "event"
  },
  { "inputs": [], "name": "alwaysRevert", "outputs": [], "stateMutability": "pure", "type": "function" },
  { "inputs": [], "name": "decrease", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [], "name": "increase", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  {
    "inputs": [],
    "name": "value",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  }
]

export async function readCounterValue(chain, address = COUNTER_ADDRESS) {
  const client = createPublicClient({ chain, transport: http('/lifeai-rpc') })
  return await client.readContract({ address, abi: COUNTER_ABI, functionName: 'value' })
}

// Preflight simulate a counter call to catch immediate reverts
// fnName: 'increase' | 'decrease' | 'alwaysRevert'
export async function preflightCounterCall(publicClient, fromAddress, counterAddress, fnName) {
  try {
    await publicClient.simulateContract({
      account: fromAddress,
      address: counterAddress,
      abi: COUNTER_ABI,
      functionName: fnName,
      args: []
    })
    return { ok: true }
  } catch (e) {
    const reason = e?.shortMessage || e?.message || 'Simulation failed'
    return { ok: false, reason }
  }
}

// Check transaction status for counter operations by decoding Increment/Decrement events
export async function checkCounterTransactionStatus(txHash, _type = 'counter', counterAddress, chain, callbacks = {}) {
  const { setChecking, setFailureReason, setTxStatus, analyzeTransactionFailure } = callbacks

  try {
    if (setChecking) setChecking(true)
    if (setFailureReason) setFailureReason('')
    const publicClient = createPublicClient({ chain, transport: http('/lifeai-rpc') })

    // Wait briefly for indexing
    await new Promise(resolve => setTimeout(resolve, 2000))

    const [receipt] = await Promise.all([
      publicClient.getTransactionReceipt({ hash: txHash })
    ])

    if (receipt.status === 'success') {
      // Parse for Counter events
      let hasCounterEvent = false
      try {
        const parsed = parseEventLogs({
          abi: COUNTER_ABI,
          logs: (receipt?.logs || []).map(l => ({ ...l, blockHash: l.blockHash || '0x' })),
          eventName: undefined
        })
        hasCounterEvent = parsed.some(l =>
          (l.eventName === 'Increment' || l.eventName === 'Decrement') && l.address?.toLowerCase() === counterAddress?.toLowerCase()
        )
      } catch { }

      if (hasCounterEvent) {
        if (setTxStatus) setTxStatus('success')
      } else {
        if (analyzeTransactionFailure) {
          await analyzeTransactionFailure(publicClient, receipt, txHash, 'counter')
        }
        if (setTxStatus) setTxStatus('failed')
      }
    } else {
      if (setTxStatus) setTxStatus('failed')
      if (setFailureReason) setFailureReason('Transaction reverted')
    }
    return receipt
  } catch (e) {
    if (setTxStatus) setTxStatus('pending')
    setTimeout(() => {
      if (txHash) checkCounterTransactionStatus(txHash, 'counter', counterAddress, chain, callbacks)
    }, 5000)
    return null
  } finally {
    if (setChecking) setChecking(false)
  }
}



