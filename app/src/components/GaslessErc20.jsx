import React, { useMemo, useState } from 'react'
import { useWallets, usePrivy } from '@privy-io/react-auth'
import { createPublicClient, createWalletClient, http, custom, formatUnits, parseUnits, erc20Abi } from 'viem'
import { getUserOperationHash, entryPoint07Abi } from 'viem/account-abstraction'
import { toSimpleSmartAccount } from 'permissionless/accounts'
import { createSmartAccountClient } from 'permissionless'
import { buildPaymasterBody, normalizeSponsorship } from '../utils/aa'
import { 
  createClients, 
  createSmartAccount, 
  getTokenInfo, 
  getTokenBalance, 
  createSmartAccountClientWithPaymaster, 
  tryDecodeRevertReason,
  pollUserOperationReceipt,
  checkTransactionStatus,
  analyzeTransactionFailure,
  decodeContractInteraction
} from '../utils/erc20'


export default function GaslessErc20({ chain }) {
  const { wallets } = useWallets()
  const { user, getAccessToken } = usePrivy()
  // UI state
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [token, setToken] = useState('0xf5793007d688D27a5359d42F2469B275B6f0863d')
  const [to, setTo] = useState('0x1583f7ea246e5D70693DEb7233340AE3718397C3')
  const [amount, setAmount] = useState('1')
  const [useAppWallet, setUseAppWallet] = useState(false)

  // Transaction state
  const [txStatus, setTxStatus] = useState(null) // 'pending', 'success', 'failed'
  const [checking, setChecking] = useState(false)
  const [failureReason, setFailureReason] = useState('')
  const [userOpHash, setUserOpHash] = useState('')
  const [bundledTxHash, setBundledTxHash] = useState('')
  const [pollAttempts, setPollAttempts] = useState(0)

  // Token info state
  const [tokenBalance, setTokenBalance] = useState('0')
  const [tokenSymbol, setTokenSymbol] = useState('')
  const [tokenDecimals, setTokenDecimals] = useState(18)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [eoaTokenBalance, setEoaTokenBalance] = useState('0')
  const [eoaBalanceLoading, setEoaBalanceLoading] = useState(false)

  const explorerBase = useMemo(() => {
    if (chain?.id === 94909) return 'https://explorer-test.avax.network/lifeaitest'
    return undefined
  }, [chain?.id])

  // Create callback object for transaction monitoring
  const createCallbacks = () => ({
    // Status updates
    setChecking,
    setTxStatus,
    setPollAttempts,
    setFailureReason,
    setBundledTxHash,
    
    // Transaction checks
    checkTransactionStatus: (txHash, type = 'transfer') => 
      checkTransactionStatus(txHash, type, token, chain, createCallbacks()),
    analyzeTransactionFailure: (publicClient, receipt, txHash, type) =>
      analyzeTransactionFailure(publicClient, receipt, txHash, type, token, createCallbacks()),
    
    // Balance updates
    fetchTokenBalance,
    fetchEoaTokenBalance
  })



  // Fetch EOA (embedded wallet) ERC20 token balance
  async function fetchEoaTokenBalance() {
    if (!token || !wallets.length) return
    
    try {
      setEoaBalanceLoading(true)
      
      const embedded = wallets.find(w => w.walletClientType === 'privy')
      if (!embedded) return
      
      const publicClient = createPublicClient({ chain, transport: http('/lifeai-rpc') })
      
      // Get token info and balance
      const { decimals, symbol } = await getTokenInfo(publicClient, token)
      const balance = await getTokenBalance(publicClient, token, embedded.address, decimals)
      
      setEoaTokenBalance(balance)
      setTokenDecimals(decimals)
      setTokenSymbol(symbol)
      
    } catch (e) {
      console.error('Error fetching EOA token balance:', e)
      setEoaTokenBalance('Error')
    } finally {
      setEoaBalanceLoading(false)
    }
  }

  // Fetch ERC20 token balance and metadata
  async function fetchTokenBalance() {
    if (!token || !wallets.length) return
    
    try {
      setBalanceLoading(true)
      setError('')
      
      const embedded = wallets.find(w => w.walletClientType === 'privy')
      if (!embedded) return
      
      // Create clients and smart account
      const { publicClient, owner } = await createClients(embedded, chain)
      const account = await createSmartAccount(publicClient, owner, chain)
      
      // Get token info and balance
      const { decimals, symbol } = await getTokenInfo(publicClient, token)
      const balance = await getTokenBalance(publicClient, token, account.address, decimals)
      
      setTokenBalance(balance)
      setTokenDecimals(decimals)
      setTokenSymbol(symbol)
      
    } catch (e) {
      console.error('Error fetching token balance:', e)
      setTokenBalance('Error')
      setTokenSymbol('TOKEN')
    } finally {
      setBalanceLoading(false)
    }
  }



  async function send() {
    try {
      // Reset all state
      setBusy(true)
      setError('')
      setTxStatus(null)
      setFailureReason('')
      setUserOpHash('')
      setBundledTxHash('')
      setPollAttempts(0)

      // Validate inputs
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
           
            let walletId = user?.wallet?.id
          if(!walletId) throw new Error('No Wallet ID available in session')
            // Attach user's JWT per Privy docs to authorize on-behalf-of signing
            const jwt = await getAccessToken()?.catch(() => null)
            const res = await fetch(`/api/wallets/${walletId}/rpc`, {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                ...(jwt ? { 'x-user-jwt': jwt } : {}),
              },
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

      // Preflight: get token decimals and sender balance to surface clear error early
      let tokenDecimals = 18
      try {
        tokenDecimals = await publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'decimals' })
      } catch {}
      // Convert amount to token units with decimals
      const value = parseUnits(amount, tokenDecimals)

      // Check smart wallet balance
      let senderBalance = 0n
      try {
        senderBalance = await publicClient.readContract({ 
          address: token, 
          abi: erc20Abi, 
          functionName: 'balanceOf', 
          args: [account.address] 
        })
      } catch {}
      if (senderBalance < value) {
        throw new Error(`Insufficient token balance in smart wallet ${account.address}. Have ${formatUnits(senderBalance, tokenDecimals)}, need ${amount}.`)
      }

      // Send the transfer transaction
      const uoHash = await saClient.writeContract({
        address: token,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [to, value]
      })
      setUserOpHash(uoHash || '')
      
      // Automatically check user operation receipt
      if (uoHash) {
        setTxStatus('pending')
        pollUserOperationReceipt(uoHash, 0, 'transfer', createCallbacks())
      }
    } catch (e) {
      console.error('ERC20 transfer error:', e)
      
      // Simplified error handling for common cases
      let errorMessage = e?.message || 'Transfer failed'
      
      // Clean up technical details from error message
      errorMessage = errorMessage
        .replace(/^(paymaster|bundler|useroperation|factory|rpc).*error:?\s*/i, '')
        .replace(/^error:?\s*/i, '')
        .replace(/\s*\{[^}]*\}/g, '') // Remove JSON-like details
        .trim()

      // Add user-friendly prefix based on error type
      if (errorMessage.toLowerCase().includes('insufficient')) {
        errorMessage = `💰 Balance too low: ${errorMessage}`
      } else if (errorMessage.toLowerCase().includes('network') || errorMessage.toLowerCase().includes('connection')) {
        errorMessage = `🌐 Network issue: ${errorMessage}`
      } else if (errorMessage.toLowerCase().includes('sign')) {
        errorMessage = `✍️ Signing failed: ${errorMessage}`
      } else {
        errorMessage = `❌ ${errorMessage}`
      }
      
      setError(errorMessage)
    } finally {
      setBusy(false)
    }
  }



  return (
    <div>
      <h2 className="h2">Gasless ERC-20 Transfer</h2>
      <div style={{ display: 'grid', gap: 8, maxWidth: 560 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input 
            className="input" 
            placeholder="Token address" 
            value={token} 
            onChange={(e) => setToken(e.target.value)}
            style={{ flex: 1 }}
          />
          <button 
            className="btn btn-secondary" 
            onClick={() => {
              fetchTokenBalance()
              fetchEoaTokenBalance()
            }} 
            disabled={balanceLoading || eoaBalanceLoading || !token}
            style={{ minWidth: '140px', fontSize: '0.9em' }}
          >
            {(balanceLoading || eoaBalanceLoading) ? 'Loading...' : '🔄 Get Balances'}
          </button>
        </div>
        
        {/* Token Balance Display */}
        {(tokenBalance || eoaTokenBalance || tokenSymbol || balanceLoading || eoaBalanceLoading) && (
          <div style={{ 
            padding: 12, 
            background: '#f8f9fa', 
            border: '1px solid #dee2e6', 
            borderRadius: 4,
            fontSize: '0.95em'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                {/* Smart Account Balance */}
                <div style={{ marginBottom: 12 }}>
                  <strong>🏦 Smart Account Balance:</strong>
                  <br/>
                  <span style={{ 
                    fontSize: '1.1em', 
                    fontWeight: 'bold', 
                    color: tokenBalance === 'Error' ? '#d32f2f' : 
                           (tokenBalance === '0' || tokenBalance === '0.0') ? '#f57c00' : '#2e7d32' 
                  }}>
                    {balanceLoading ? 'Loading...' : `${tokenBalance} ${tokenSymbol}`}
                  </span>
                  {(tokenBalance === '0' || tokenBalance === '0.0') && !balanceLoading && tokenBalance !== 'Error' && (
                    <div style={{ fontSize: '0.8em', color: '#f57c00', marginTop: 2, fontStyle: 'italic' }}>
                      ⚠️ Smart account has no tokens. Transfer tokens to your smart account first.
                    </div>
                  )}
                </div>

                {/* EOA Balance */}
                <div style={{ marginBottom: 8 }}>
                  <strong>👤 Embedded Wallet (EOA) Balance:</strong>
                  <br/>
                  <span style={{ 
                    fontSize: '1.1em', 
                    fontWeight: 'bold', 
                    color: eoaTokenBalance === 'Error' ? '#d32f2f' : 
                           (eoaTokenBalance === '0' || eoaTokenBalance === '0.0') ? '#f57c00' : '#2e7d32' 
                  }}>
                    {eoaBalanceLoading ? 'Loading...' : `${eoaTokenBalance} ${tokenSymbol}`}
                  </span>
                  {(eoaTokenBalance === '0' || eoaTokenBalance === '0.0') && !eoaBalanceLoading && eoaTokenBalance !== 'Error' && (
                    <div style={{ fontSize: '0.8em', color: '#f57c00', marginTop: 2, fontStyle: 'italic' }}>
                      ⚠️ EOA has no tokens.
                    </div>
                  )}
                </div>

                {tokenBalance !== 'Error' && eoaTokenBalance !== 'Error' && !balanceLoading && !eoaBalanceLoading && (
                  <div style={{ fontSize: '0.85em', color: '#666', marginTop: 8, paddingTop: 8, borderTop: '1px solid #eee' }}>
                    <strong>Token Info:</strong> {tokenSymbol || 'Unknown'} • Decimals: {tokenDecimals}
                    <br/>
                    <strong>EOA Address:</strong> {wallets.find(w => w.walletClientType === 'privy')?.address?.slice(0, 10)}...
                  </div>
                )}
              </div>
              <button 
                className="btn btn-secondary" 
                onClick={() => {
                  fetchTokenBalance()
                  fetchEoaTokenBalance()
                }} 
                disabled={balanceLoading || eoaBalanceLoading || !token}
                style={{ fontSize: '0.8em', padding: '4px 8px', marginLeft: '8px' }}
              >
                🔄
              </button>
            </div>
          </div>
        )}
        
        
        <input className="input" placeholder="Recipient address" value={to} onChange={(e) => setTo(e.target.value)} />
        <input className="input" placeholder={`Amount (decimals ${tokenDecimals})`} value={amount} onChange={(e) => setAmount(e.target.value)} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={useAppWallet} onChange={(e) => setUseAppWallet(e.target.checked)} />
          Use App Wallet (no prompts)
        </label>
        <button className="btn btn-primary" onClick={send} disabled={busy}>Send gasless transfer</button>
        {userOpHash && (
          <button 
            className="btn btn-secondary" 
            onClick={() => pollUserOperationReceipt(userOpHash, 0, 'transfer', createCallbacks())} 
            disabled={checking}
            style={{ marginLeft: 8 }}
          >
            {checking ? 'Checking...' : 'Check Transfer Status'}
          </button>
        )}
      </div>
      {userOpHash && bundledTxHash && explorerBase && (
        <div style={{ marginTop: 12, padding: 12, background: '#fff3e0', border: '1px solid #ff9800', borderRadius: 4, color: '#e65100' }}>
          <strong>📤 Transaction Submitted</strong><br/>
          <a href={`${explorerBase}/tx/${bundledTxHash}`} target="_blank" rel="noreferrer" style={{ color: '#1976d2', textDecoration: 'underline' }}>
            View on Explorer
          </a>
        </div>
      )}
      
      {/* Transaction Status Display */}
      {txStatus === 'pending' && (
        <div style={{ marginTop: 8, padding: 12, background: '#fff8e1', border: '1px solid #ffb300', borderRadius: 4, color: '#f57c00' }}>
          <strong>⏳ Processing Transaction...</strong>
          <br/>
          <small>Please wait while your transaction is being confirmed.</small>
        </div>
      )}
      
      {/* Transaction Results */}
      {txStatus === 'success' && (
        <div style={{ marginTop: 8, padding: 12, background: '#e8f5e8', border: '1px solid #4caf50', borderRadius: 4, color: '#2e7d32' }}>
          <strong>✅ Transfer Successful!</strong><br/>
          <small style={{ color: '#666' }}>The {amount} tokens have been transferred to {to}</small>
        </div>
      )}
      
      {txStatus === 'failed' && (
        <div style={{ marginTop: 8, padding: 12, background: '#ffebee', border: '1px solid #f44336', borderRadius: 4, color: '#d32f2f' }}>
          <strong>❌ Transfer Failed</strong><br/>
          <small style={{ color: '#666' }}>The transfer was not completed. Please try again.</small>
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


