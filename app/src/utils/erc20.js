import { createPublicClient, createWalletClient, http, custom, formatUnits, parseUnits, decodeEventLog, decodeFunctionData, parseEventLogs } from 'viem'
import { erc20Abi } from 'viem'
import { getUserOperationHash, entryPoint07Abi } from 'viem/account-abstraction'
import { createSmartAccountClient } from 'permissionless'
import { toSimpleSmartAccount } from 'permissionless/accounts'
import { buildPaymasterBody, normalizeSponsorship } from './aa'


// Create reusable clients
export async function createClients(embedded, chain) {
  const provider = await embedded.getEthereumProvider()
  const publicClient = createPublicClient({ chain, transport: http('/lifeai-rpc') })
  const owner = createWalletClient({ account: embedded.address, chain, transport: custom(provider) })
  
  return { publicClient, owner }
}

// Create smart account
export async function createSmartAccount(publicClient, owner, chain) {
  const entryPoint = { address: '0xd308aE59cb31932E8D9305BAda32Fa782d3D5d42', version: '0.7' }
  const accountFactory = import.meta.env.VITE_SIMPLE_ACCOUNT_FACTORY
  if (!accountFactory) throw new Error('Missing VITE_SIMPLE_ACCOUNT_FACTORY')
  
  return await toSimpleSmartAccount({ 
    client: publicClient, 
    owner, 
    entryPoint, 
    factoryAddress: accountFactory, 
    index: 0n 
  })
}

// Get token info
export async function getTokenInfo(publicClient, tokenAddress) {
  try {
    const [decimals, symbol, name] = await Promise.allSettled([
      publicClient.readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'decimals' }),
      publicClient.readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'symbol' }),
      publicClient.readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'name' })
    ])
    
    return {
      decimals: decimals.status === 'fulfilled' ? decimals.value : 18,
      symbol: symbol.status === 'fulfilled' ? symbol.value : 'TOKEN',
      name: name.status === 'fulfilled' ? name.value : 'Unknown Token'
    }
  } catch (e) {
    return { decimals: 18, symbol: 'TOKEN', name: 'Unknown Token' }
  }
}

// Get token balance
export async function getTokenBalance(publicClient, tokenAddress, accountAddress, decimals = 18) {
  try {
    const balance = await publicClient.readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [accountAddress]
    })
    return formatUnits(balance, decimals)
  } catch (e) {
    return 'Error'
  }
}


// Create smart account client with paymaster
export function createSmartAccountClientWithPaymaster(account, chain) {
  const customPaymaster = {
    getPaymasterStubData: async () => ({
      paymaster: '0x86ee2542009532cd6196B7c6d3254Ac9F9E4ABbc',
      paymasterData: '0x',
      paymasterVerificationGasLimit: 300000n,
      paymasterPostOpGasLimit: 100n,
      callGasLimit: 400000n,
      verificationGasLimit: 300000n,
      preVerificationGas: 50000n
    }),
    getPaymasterData: async (userOperation) => {
      const tempUO = {
        ...userOperation,
        callGasLimit: userOperation.callGasLimit || 400000n,
        verificationGasLimit: userOperation.verificationGasLimit || 300000n,
        preVerificationGas: userOperation.preVerificationGas || 50000n,
        maxFeePerGas: userOperation.maxFeePerGas || 0x7A5CF70D5n,
        maxPriorityFeePerGas: userOperation.maxPriorityFeePerGas || 0x3B9ACA00n
      }
      const res = await fetch('/paymaster', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: buildPaymasterBody(tempUO, '0xd308aE59cb31932E8D9305BAda32Fa782d3D5d42')
      })
      if (!res.ok) throw new Error(`Paymaster error ${res.status}: ${await res.text()}`)
      const raw = await res.json()
      if (raw.error) throw new Error(raw.error.message)
      return normalizeSponsorship(raw.result || raw)
    }
  }

  return createSmartAccountClient({
    account,
    chain,
    bundlerTransport: http('/bundler'),
    paymaster: customPaymaster,
    userOperation: {
      estimateFeesPerGas: async () => ({ maxFeePerGas: 0x7A5CF70D5n, maxPriorityFeePerGas: 0x3B9ACA00n })
    }
  })
}

// Poll user operation receipt from bundler
export async function pollUserOperationReceipt(uoHash, attempts = 0, type = 'transfer', callbacks = {}) {
  const { 
    setChecking, 
    setTxStatus, 
    setApprovalStatus, 
    setPollAttempts, 
    setFailureReason, 
    setBundledTxHash,
    checkTransactionStatus,
    fetchTokenBalance,
    fetchEoaTokenBalance
  } = callbacks

  try {
    if (setChecking) setChecking(true)
    if (type === 'approval' && setApprovalStatus) {
      setApprovalStatus('pending')
    } else if (setTxStatus) {
      setTxStatus('pending')
    }
    if (setPollAttempts) setPollAttempts(attempts)
    
    const res = await fetch('/bundler', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getUserOperationReceipt', params: [uoHash] })
    })
    
    if (!res.ok) {
      console.error('Bundler receipt error:', res.status, await res.text())
      throw new Error(`Bundler receipt error ${res.status}`)
    }
    
    const response = await res.json()
    
    if (response.error) {
      console.error('Bundler JSON-RPC error:', response.error)
      if (setFailureReason) setFailureReason(`Bundler error: ${response.error.message}`)
      if (type === 'approval' && setApprovalStatus) {
        setApprovalStatus('failed')
      } else if (setTxStatus) {
        setTxStatus('failed')
      }
      return
    }
    
    const { result } = response
    if (!result) {
      // Switch to direct chain lookup sooner if bundler doesn't know the op
      if (attempts >= 2) {
        console.log('UserOp receipt still null, trying direct chain lookup...')
        if (checkTransactionStatus) await checkTransactionStatus(uoHash)
        return
      }
      
      // UserOp receipt not ready yet, retrying...
      setTimeout(() => pollUserOperationReceipt(uoHash, attempts + 1, type, callbacks), 3000)
      return
    }
    
    // UserOp receipt received
    const txHash = result?.receipt?.transactionHash || result?.transactionHash
    if (txHash && setBundledTxHash) {
      setBundledTxHash(txHash)
    }

    // Parse AA logs for success / revert reason
    try {
      const aaParsed = parseEventLogs({
        abi: entryPoint07Abi,
        logs: (result?.receipt?.logs || []).map(l => ({ ...l, blockHash: l.blockHash || '0x' })),
        eventName: undefined
      })
      const uoEvent = aaParsed.find(l => l.eventName === 'UserOperationEvent')
      const postOp = aaParsed.find(l => l.eventName === 'PostOpRevertReason')
      const uoRevert = aaParsed.find(l => l.eventName === 'UserOperationRevertReason')
      const revertBytes = postOp?.args?.revertReason || uoRevert?.args?.revertReason
      if (revertBytes) {
        const decoded = tryDecodeRevertReason(revertBytes)
        if (decoded && setFailureReason) {
          setFailureReason(decoded)
        }
      }
      if (uoEvent && uoEvent.args && uoEvent.args.success === false) {
        if (type === 'approval' && setApprovalStatus) {
          setApprovalStatus('failed')
        } else if (setTxStatus) {
          setTxStatus('failed')
        }
      }
    } catch {}

    if (result?.success === false) {
      const reason = result?.reason || ''
      if (reason && setFailureReason) setFailureReason(reason)
      if (type === 'approval' && setApprovalStatus) {
        setApprovalStatus('failed')
      } else if (setTxStatus) {
        setTxStatus('failed')
      }
      return
    }

    // Success – now fetch chain receipt & decode events
    if (txHash) {
      if (type === 'approval') {
        // For approvals, we don't need to check ERC20 transfer events, just mark as success
        if (setApprovalStatus) setApprovalStatus('success')
        // Refresh both balances after successful approval
        setTimeout(() => {
          if (fetchTokenBalance) fetchTokenBalance()
          if (fetchEoaTokenBalance) fetchEoaTokenBalance()
        }, 1000)
      } else {
        if (checkTransactionStatus) await checkTransactionStatus(txHash)
      }
    } else {
      if (type === 'approval' && setApprovalStatus) {
        setApprovalStatus('success')
        setTimeout(() => {
          if (fetchTokenBalance) fetchTokenBalance()
          if (fetchEoaTokenBalance) fetchEoaTokenBalance()
        }, 1000)
      } else if (setTxStatus) {
        setTxStatus('success')
        setTimeout(() => {
          if (fetchTokenBalance) fetchTokenBalance()
          if (fetchEoaTokenBalance) fetchEoaTokenBalance()
        }, 1000)
      }
    }
  } catch (e) {
    console.error('Error polling userOp receipt:', e)
    // Keep polling on transient errors, but add a fallback after some attempts
    if (!e.message.includes('Bundler receipt error') && !e.message.includes('AA33') && attempts < 10) {
      setTimeout(() => pollUserOperationReceipt(uoHash, attempts + 1, type, callbacks), 3000)
    } else {
      // If bundler is consistently failing, try direct chain lookup
      console.log('Bundler failed, trying direct chain lookup...')
      setTimeout(() => {
        // Try to use the userOp hash as a transaction hash (some bundlers return tx hash instead)
        if (checkTransactionStatus) checkTransactionStatus(uoHash)
      }, 2000)
    }
  } finally {
    if (setChecking) setChecking(false)
  }
}

// Check transaction status and verify ERC20 transfer with detailed failure analysis
export async function checkTransactionStatus(txHash, type = 'transfer', token, chain, callbacks = {}) {
  const {
    setChecking,
    setFailureReason,
    setTxStatus,
    analyzeTransactionFailure,
    fetchTokenBalance,
    fetchEoaTokenBalance
  } = callbacks

  try {
    if (setChecking) setChecking(true)
    if (setFailureReason) setFailureReason('')
    const publicClient = createPublicClient({ chain, transport: http('/lifeai-rpc') })
    
    // Wait a bit for transaction to be mined
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // Get transaction receipt and transaction data
    const [receipt, transaction] = await Promise.all([
      publicClient.getTransactionReceipt({ hash: txHash }),
      publicClient.getTransaction({ hash: txHash })
    ])
    
    console.log('Transaction receipt:', receipt)
    console.log('Transaction data:', transaction)
    

    // If logs exist but none from token, surface which contracts emitted them for clarity
    const tokenLower = token?.toLowerCase()
    const nonTokenLogs = receipt.logs.filter(l => (l.address || '').toLowerCase() !== tokenLower)
    if (nonTokenLogs.length > 0 && !receipt.logs.some(l => (l.address || '').toLowerCase() === tokenLower)) {
      const uniqueContracts = Array.from(new Set(nonTokenLogs.map(l => l.address))).slice(0, 5)
      if (setFailureReason) {
        setFailureReason(prev => prev || `No logs from token; logs emitted by: ${uniqueContracts.join(', ')}`)
      }
    }
    
    if (receipt.status === 'success') {
      // Check for both Transfer and Approval events
      const transferEventSignature = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' // Transfer(address,address,uint256)
      
      const transferEvents = receipt.logs.filter(log => {
        return log.topics[0] === transferEventSignature && 
               log.address.toLowerCase() === tokenLower
      })
      
      // For regular transfers, just check transfer events
      if (transferEvents.length > 0) {
        if (setTxStatus) setTxStatus('success')
      } else {
        if (analyzeTransactionFailure) {
          await analyzeTransactionFailure(publicClient, receipt, txHash, type)
        }
      }
      
      // Refresh balances after any transaction
      if (transferEvents.length > 0) {
        setTimeout(() => {
          if (fetchTokenBalance) fetchTokenBalance()
          if (fetchEoaTokenBalance) fetchEoaTokenBalance()
        }, 1000)
      }
    } else {
      // Transaction reverted - get revert reason
      if (setTxStatus) {
        setTxStatus('failed')
      }
      try {
        // Try to get the transaction to see revert reason
        const tx = await publicClient.getTransaction({ hash: txHash })
        console.log('Failed transaction:', tx)
        if (setFailureReason) {
          setFailureReason('Transaction reverted on-chain. Check gas limits and account balance.')
        }
      } catch (txError) {
        if (setFailureReason) {
          setFailureReason('Transaction failed on-chain (status: reverted)')
        }
      }
    }
    
    return receipt
  } catch (e) {
    console.log('Transaction still pending or not found, will retry...')
    if (setTxStatus) {
      setTxStatus('pending')
    }
    
    // Retry after a delay
    setTimeout(() => {
      if (txHash) checkTransactionStatus(txHash, type, token, chain, callbacks)
    }, 5000)
    
    return null
  } finally {
    if (setChecking) setChecking(false)
  }
}

// Detailed analysis of why the transaction succeeded but no transfer occurred
export async function analyzeTransactionFailure(publicClient, receipt, txHash, type = 'transfer', token, callbacks = {}) {
  const { setTxStatus, setFailureReason } = callbacks

  if (setTxStatus) {
    setTxStatus('failed')
  }
  let reason = 'Transaction succeeded but no ERC20 transfer occurred. Possible reasons:\n\n'
  
  try {
    // Check if token contract exists
    const tokenCode = await publicClient.getBytecode({ address: token })
    if (!tokenCode || tokenCode === '0x') {
      reason += `❌ Token contract not found at ${token}\n`
      reason += '• Verify the token address is correct\n'
      reason += '• Make sure the token is deployed on this network\n\n'
    } else {
      reason += `✅ Token contract exists at ${token}\n\n`
    }

    // Check if any logs were emitted at all
    if (receipt.logs.length === 0) {
      reason += '❌ No events were emitted by this transaction\n'
      reason += '• The transaction may have been a simple ETH transfer\n'
      reason += '• Contract call may have failed silently\n\n'
    } else {
      reason += `✅ Transaction emitted ${receipt.logs.length} events\n`
      
      // Check if any logs came from the token contract
      const tokenLogs = receipt.logs.filter(log => 
        log.address.toLowerCase() === token.toLowerCase()
      )
      
      if (tokenLogs.length === 0) {
        reason += `❌ No events from token contract ${token}\n`
        reason += '• The transaction may not have interacted with this token\n'
        reason += '• Check if you\'re calling the correct contract\n\n'
      } else {
        reason += `✅ Found ${tokenLogs.length} events from token contract\n`
        
        // Check for other ERC20 events
        const approvalEvents = tokenLogs.filter(log =>
          log.topics[0] === '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925' // Approval event
        )
        
        if (approvalEvents.length > 0) {
          reason += `• Found ${approvalEvents.length} Approval events instead of Transfer\n`
          reason += '• This might have been an approval transaction, not a transfer\n\n'
        } else {
          reason += '• Events found but none were Transfer or Approval events\n'
          reason += '• Check the transaction logs for other event types\n\n'
        }
      }
    }

    // Check gas usage
    const gasUsedPercent = (Number(receipt.gasUsed) / Number(receipt.gasLimit || 300000n)) * 100
    if (gasUsedPercent > 95) {
      reason += '❌ Transaction used >95% of gas limit\n'
      reason += '• Transaction may have run out of gas\n'
      reason += '• Try increasing gas limits\n\n'
    }

    // Check for common ERC20 transfer failures
    reason += 'Common ERC20 transfer failure causes:\n'
    reason += '• Insufficient token balance in sender account\n'
    reason += '• Token contract has transfer restrictions\n'
    reason += '• Recipient address is invalid or blocked\n'
    reason += '• Token is paused or frozen\n'
    reason += '• Smart wallet not properly deployed\n'

  } catch (analysisError) {
    reason += `Analysis error: ${analysisError.message}`
  }

  if (setFailureReason) setFailureReason(reason)
  console.log('❌ Transfer failure analysis:', reason)
}
