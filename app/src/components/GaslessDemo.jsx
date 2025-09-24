import React, { useMemo, useState } from 'react'
import { useWallets } from '@privy-io/react-auth'
import { encodeFunctionData, createPublicClient, createWalletClient, http, custom, concatHex, toHex } from 'viem'
import { createSmartAccountClient } from 'permissionless'
import { prepareUserOperation as viemPrepareUserOperation } from 'viem/account-abstraction'
import { getUserOperationHash } from 'viem/account-abstraction'
import { toSimpleSmartAccount } from 'permissionless/accounts'
import { createPimlicoClient } from 'permissionless/clients/pimlico'

export default function GaslessDemo({ chain }) {
  const { wallets } = useWallets()
  const [deployHash, setDeployHash] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const explorerBase = useMemo(() => {
    // Provided explorer for LifeAI testnet
    if (chain?.id === 94909) return 'https://explorer-test.avax.network/lifeaitest'
    return undefined
  }, [chain?.id])

  // Helpers
  function parseUnits(value, decs) {
    const [intPart, fracRaw] = String(value).split('.')
    const frac = (fracRaw || '').slice(0, Number(decs)).padEnd(Number(decs), '0')
    const whole = (intPart || '0') + frac
    return BigInt(whole.replace(/^0+(?=\d)/, ''))
  }


  // Convert BigInt values for JSON serialization that Go can parse
  function serializeUserOperation(uo) {
    const serialized = { ...uo }
    
    // Convert BigInt values for Go *big.Int parsing
    // Go's *big.Int expects decimal strings, not hex or numbers
    Object.keys(serialized).forEach(key => {
      if (typeof serialized[key] === 'bigint') {
        const value = serialized[key]
        // Always convert to decimal string - this is what Go's *big.Int JSON unmarshaling expects
        serialized[key] = value.toString(10)
      }
    })
    
    // Ensure paymaster fields have defaults if not set (ERC-4337 v0.7)
    if (!serialized.paymaster) {
      serialized.paymaster = '0x0000000000000000000000000000000000000000'
    }
    if (!serialized.paymasterData) {
      serialized.paymasterData = '0x'
    }
    
    // Handle factory/initCode for account deployment - only include if they exist
    // Don't set defaults - let the account abstraction library handle deployment
    if (!serialized.factory || serialized.factory === '0x0000000000000000000000000000000000000000') {
      delete serialized.factory
    }
    if (!serialized.factoryData || serialized.factoryData === '0x') {
      delete serialized.factoryData
    }
    // For EntryPoint v0.7, initCode is derived from factory + factoryData. Provide it for server hashing.
    if ((!serialized.initCode || serialized.initCode === '0x') && serialized.factory && serialized.factoryData) {
      try {
        const factoryHex = String(serialized.factory)
        const fdHex = String(serialized.factoryData)
        const concatenated = '0x' + factoryHex.replace(/^0x/, '') + fdHex.replace(/^0x/, '')
        serialized.initCode = concatenated
        console.log('Derived initCode from factory & factoryData for paymaster:', serialized.initCode)
      } catch {}
    } else if (!serialized.initCode || serialized.initCode === '0x') {
      delete serialized.initCode
    }
    
    // Convert byte fields to base64 for Go []byte unmarshaling
    // Do NOT include 'signature' – paymaster should not depend on account signature
    const byteFields = ['callData', 'paymasterData', 'factoryData', 'initCode']
    byteFields.forEach(field => {
      // Ensure field exists and is a string
      if (!serialized[field] || typeof serialized[field] !== 'string') {
        serialized[field] = '0x'
      }
      // Ensure it's a proper hex string
      if (!serialized[field].startsWith('0x')) {
        serialized[field] = '0x' + serialized[field]
      }
      
      // Convert hex to base64 for Go []byte fields
      if (serialized[field] === '0x' || serialized[field] === '' || !serialized[field]) {
        // Empty data - use null for Go []byte which handles empty slices
        serialized[field] = null
      } else {
        try {
          // Convert hex to base64
          const hex = serialized[field].startsWith('0x') ? serialized[field].slice(2) : serialized[field]
          if (hex.length === 0) {
            serialized[field] = null
          } else {
            // Ensure even length
            const evenHex = hex.length % 2 ? '0' + hex : hex
            // Convert hex to bytes then to base64
            const bytes = new Uint8Array(evenHex.match(/.{2}/g).map(byte => parseInt(byte, 16)))
            serialized[field] = btoa(String.fromCharCode.apply(null, bytes))
            console.log(`Converted ${field} to base64:`, serialized[field])
          }
        } catch (e) {
          console.warn(`Failed to convert ${field} to base64:`, e)
          // Use null if conversion fails - Go can handle null []byte
          serialized[field] = null
        }
      }
    })
    
    // Remove any fields that Go struct doesn't expect (ERC-4337 v0.7 structure)
    const expectedFields = [
      'sender', 'nonce', 'callData', 'callGasLimit', 'verificationGasLimit', 
      'preVerificationGas', 'maxFeePerGas', 'maxPriorityFeePerGas', 'signature',
      'paymaster', 'paymasterData', 'paymasterVerificationGasLimit', 'paymasterPostOpGasLimit',
      'factory', 'factoryData', 'initCode'
    ]
    
    const cleanedSerialized = {}
    expectedFields.forEach(field => {
      if (serialized[field] !== undefined) {
        cleanedSerialized[field] = serialized[field]
      }
    })
    
    // Remove signature entirely from payload to paymaster (not required for sponsorship)
    delete cleanedSerialized.signature
    console.log('Final serialized user operation for paymaster:', cleanedSerialized)
    
    return cleanedSerialized
  }

  // Normalize various custom paymaster response schemas into standard fields
  function normalizeSponsorship(resp) {
    const r = resp?.result ?? resp?.data ?? resp
    if (!r || typeof r !== 'object') return {}
    // Some servers nest gas under gas or gasLimits
    const gas = r.gas || r.gasLimits || r
    const out = {}
    
    // Handle separate paymaster fields for ERC-4337 v0.7
    if (r.paymaster) {
      out.paymaster = r.paymaster
    }
    if (r.paymasterData) {
      out.paymasterData = r.paymasterData
    }
    
    const maybe = (val) => {
      if (typeof val === 'string') {
        // Handle hex strings
        if (val.startsWith('0x')) {
          return BigInt(val)
        }
        // Handle decimal strings
        return BigInt(val)
      }
      // Handle numbers
      if (typeof val === 'number') {
        return BigInt(val)
      }
      // Return as-is for other types
      return val
    }
    if (gas.preVerificationGas != null) out.preVerificationGas = maybe(gas.preVerificationGas)
    if (gas.verificationGasLimit != null) out.verificationGasLimit = maybe(gas.verificationGasLimit)
    if (gas.callGasLimit != null) out.callGasLimit = maybe(gas.callGasLimit)
    if (r.maxFeePerGas != null) out.maxFeePerGas = maybe(r.maxFeePerGas)
    if (r.maxPriorityFeePerGas != null) out.maxPriorityFeePerGas = maybe(r.maxPriorityFeePerGas)
    
    // Handle paymaster-specific gas limits (ensure field names match Go struct)
    if (r.paymasterVerificationGasLimit != null) out.paymasterVerificationGasLimit = maybe(r.paymasterVerificationGasLimit)
    if (r.paymasterPostOpGasLimit != null) out.paymasterPostOpGasLimit = maybe(r.paymasterPostOpGasLimit)
    
    return out
  }




  // Fund the paymaster by depositing ETH into EntryPoint
  async function fundPaymaster() {
    try {
      setError('')
      setBusy(true)
      const embedded = wallets.find(w => w.walletClientType === 'privy')
      if (!embedded) throw new Error('Embedded wallet not found')

      const provider = await embedded.getEthereumProvider()
      const owner = createWalletClient({ account: embedded.address, chain, transport: custom(provider) })
      const entryPoint = { address: '0xd308aE59cb31932E8D9305BAda32Fa782d3D5d42', version: '0.7' }
      const paymasterAddress = '0x86ee2542009532cd6196B7c6d3254Ac9F9E4ABbc' // Your paymaster address

      // Call depositTo on EntryPoint to fund the paymaster
      const hash = await owner.writeContract({
        address: entryPoint.address,
        abi: [
          {
            name: 'depositTo',
            type: 'function',
            stateMutability: 'payable',
            inputs: [{ name: 'account', type: 'address' }],
            outputs: []
          }
        ],
        functionName: 'depositTo',
        args: [paymasterAddress],
        value: parseUnits('0.1', 18) // Deposit 0.1 ETH
      })

      console.log('Paymaster funding transaction:', hash)
      alert(`Paymaster funded! Tx: ${hash}`)
    } catch (e) {
      setError(e?.message || 'Paymaster funding failed')
    } finally {
      setBusy(false)
    }
  }

  // Force-deploy smart wallet with a no-op call (gasless)
  async function deploySmartWallet() {
    try {
      setError('')
      setBusy(true)
      setDeployHash('')
      const embedded = wallets.find(w => w.walletClientType === 'privy')
      if (!embedded) throw new Error('Embedded wallet not found')

      const provider = await embedded.getEthereumProvider()
      const owner = createWalletClient({ account: embedded.address, chain, transport: custom(provider) })
      const entryPoint = { address: '0xd308aE59cb31932E8D9305BAda32Fa782d3D5d42', version: '0.7' }
      const bundlerUrl = '/bundler'
      const paymasterBase = '/paymaster'

      const publicClient = createPublicClient({ chain, transport: http('/lifeai-rpc') })
      const accountFactory = import.meta.env.VITE_SIMPLE_ACCOUNT_FACTORY
      if (!accountFactory) throw new Error('Set VITE_SIMPLE_ACCOUNT_FACTORY to your SimpleAccount factory')
      
      console.log('Creating smart account with:')
      console.log('- Owner:', embedded.address)
      console.log('- EntryPoint:', entryPoint)
      console.log('- Factory:', accountFactory)
      console.log('- Chain ID:', chain.id)
      
      const account = await toSimpleSmartAccount({ 
        client: publicClient, 
        owner, 
        entryPoint, 
        factoryAddress: accountFactory,
        index: 0n  // Explicitly set index (salt) to match PrivyAuthUI.jsx
      })
      const bundlerTransport = http(bundlerUrl)

      // Simplified paymaster that doesn't interfere with signature
      const customPaymaster = {
        getPaymasterStubData: async (userOperation) => {
          console.log('getPaymasterStubData called with userOperation:', userOperation)
          
          // Return minimal stub data for gas estimation
          return {
            paymaster: '0x86ee2542009532cd6196B7c6d3254Ac9F9E4ABbc',
            paymasterData: '0x',
            paymasterVerificationGasLimit: 300000n,
            paymasterPostOpGasLimit: 100n,
            callGasLimit: 150000n,
            verificationGasLimit: 300000n,
            preVerificationGas: 50000n
          }
        },
        getPaymasterData: async (userOperation) => {
          console.log('getPaymasterData called with userOperation:', userOperation)
          
          // Call paymaster for final sponsorship data
          const tempUO = {
            ...userOperation,
            callGasLimit: userOperation.callGasLimit || 150000n,
            verificationGasLimit: userOperation.verificationGasLimit || 300000n,
            preVerificationGas: userOperation.preVerificationGas || 50000n,
            maxFeePerGas: userOperation.maxFeePerGas || 0x7A5CF70D5n,
            maxPriorityFeePerGas: userOperation.maxPriorityFeePerGas || 0x3B9ACA00n
          }
          
          const res = await fetch(paymasterBase, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: (() => {
              const payload = {
                jsonrpc: '2.0',
                method: 'pm_sponsorUserOperation',
                params: [serializeUserOperation(tempUO), entryPoint.address],
                id: 1
              }
              let jsonStr = JSON.stringify(payload)
              // Safely unquote specific numeric fields for Go *big.Int
              const numericKeys = [
                'nonce',
                'callGasLimit',
                'verificationGasLimit',
                'preVerificationGas',
                'maxFeePerGas',
                'maxPriorityFeePerGas',
                'paymasterVerificationGasLimit',
                'paymasterPostOpGasLimit'
              ]
              numericKeys.forEach((key) => {
                const re = new RegExp(`"${key}":"(\\d+)"`, 'g')
                jsonStr = jsonStr.replace(re, `"${key}":$1`)
              })
              return jsonStr
            })()
          })
          
          if (!res.ok) {
            const errorText = await res.text()
            throw new Error(`Paymaster error ${res.status}: ${errorText}`)
          }
          
          const raw = await res.json()
          if (raw.error) {
            throw new Error(`Paymaster JSON-RPC error: ${raw.error.message}`)
          }
          
          const result = normalizeSponsorship(raw.result || raw)
          console.log('getPaymasterData returning:', result)
          return result
        }
      }

      // Create smart account client with simplified paymaster
      const saClient = createSmartAccountClient({
        account,
        chain,
        bundlerTransport,
        paymaster: customPaymaster,
        userOperation: {
          prepareUserOperation: async (client, args) => {
            const req = await viemPrepareUserOperation(client, args)
            try {
              const hash = getUserOperationHash({
                userOperation: { ...req, signature: '0x' },
                entryPointAddress: account.entryPoint.address,
                entryPointVersion: account.entryPoint.version,
                chainId: chain.id
              })
              console.log('Prepared UserOperation:', req)
              console.log('Locally computed userOpHash:', hash)
            } catch (e) {
              console.warn('Failed to compute local userOpHash:', e)
            }
            return req
          },
          estimateFeesPerGas: async () => {
            return {
              maxFeePerGas: 0x7A5CF70D5n,
              maxPriorityFeePerGas: 0x3B9ACA00n
            }
          }
        }
      })

      // No-op call to the EOA owner (CALL to EOA succeeds and does nothing)
      console.log('About to send transaction with saClient...')
      console.log('Chain ID:', chain.id)
      console.log('EntryPoint:', entryPoint)
      console.log('Smart account address:', account.address)
      console.log('Owner address:', embedded.address)
      console.log('Account factory:', accountFactory)
      
      // Simple no-op call to deploy the account
      try {
        const hash = await saClient.sendTransaction({ 
          calls: [{ to: embedded.address, data: '0x', value: 0n }] 
        })
        console.log('Account deployment successful, hash:', hash)
        setDeployHash(hash || '')
      } catch (error) {
        console.error('Account deployment failed:', error)
        console.error('Error details:', error.details)
        throw error
      }
    } catch (e) {
      setError(e?.message || 'Smart wallet deploy failed')
    } finally {
      setBusy(false)
    }
  }



  return (
    <div>
      <h2 className="h2">Gasless Smart Wallet Demo</h2>
      <div className="label" style={{ marginBottom: 8 }}>
        Chain: {chain?.name} (id {chain?.id})
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <button className="btn btn-secondary" onClick={fundPaymaster} disabled={busy}>Fund Paymaster (0.1 ETH)</button>
        <button className="btn btn-primary" onClick={deploySmartWallet} disabled={busy}>Deploy smart wallet (gasless)</button>
      </div>
      {deployHash && (
        <div style={{ marginTop: 12 }}>
          <strong>Deploy tx:</strong>{' '}
          {explorerBase ? (
            <a href={`${explorerBase}/tx/${deployHash}`} target="_blank" rel="noreferrer">{deployHash}</a>
          ) : (
            <span>{deployHash}</span>
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


