import React, { useMemo, useState } from 'react'
import { useWallets } from '@privy-io/react-auth'
import { encodeFunctionData, createPublicClient, http, concatHex, toHex, createWalletClient, custom } from 'viem'
import { createSmartAccountClient } from 'permissionless'
import { toSimpleSmartAccount } from 'permissionless/accounts'
import { createPimlicoClient } from 'permissionless/clients/pimlico'

// Minimal demo contract: stores a single uint256 value
// pragma solidity ^0.8.24; contract Box { uint256 public v; function set(uint256 _v) external { v = _v; } }
// Precompiled bytecode for the above (from solidity 0.8.x, no constructor)
// For demo only – any EVM-compatible chain can deploy it.
// If bytecode fails on your chain/compiler version, replace with your own compiled bytecode.
const BOX_BYTECODE =
  '0x6080604052348015600f57600080fd5b5061010a8061001f6000396000f3fe608060405260043610601c5760003560e01c80632fbebd38146021578063f2c9ecd814603b575b600080fd5b60276049565b60405190815260200160405180910390f35b60416051565b005b60005481565b60005556fea2646970667358221220f2b1a8d6a1c29a8a2b6d9d932f5e7f9a9c8f3c1c1a8d5b7f0a1a23b0d9d1a59e64736f6c63430008180033'

export default function GaslessDemo({ chain }) {
  const { wallets } = useWallets()
  const [deployHash, setDeployHash] = useState('')
  const [txHash, setTxHash] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [token, setToken] = useState('')
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [decimals, setDecimals] = useState('18')
  
  // New state for approve function
  const [spender, setSpender] = useState('')
  const [approveAmount, setApproveAmount] = useState('')

  const explorerBase = useMemo(() => {
    // Provided explorer for LifeAI testnet
    if (chain?.id === 12345) return 'https://explorer-test.avax.network/lifeaitest'
    return undefined
  }, [chain?.id])

  // Helpers
  function parseUnits(value, decs) {
    const [intPart, fracRaw] = String(value).split('.')
    const frac = (fracRaw || '').slice(0, Number(decs)).padEnd(Number(decs), '0')
    const whole = (intPart || '0') + frac
    return BigInt(whole.replace(/^0+(?=\d)/, ''))
  }

  // Helper function to make JSON-RPC calls to the paymaster service
  async function callJsonRpc(method, params) {
    const response = await fetch('/paymaster', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: method,
        params: params,
        id: Date.now()
      })
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()
    
    if (data.error) {
      throw new Error(`JSON-RPC error: ${data.error.message} (${data.error.code})`)
    }

    return data.result
  }

  async function deployWithEOA() {
    try {
      setError('')
      setBusy(true)
      setTxHash('')
      setDeployHash('')
      const embedded = wallets.find(w => w.walletClientType === 'privy')
      if (!embedded) throw new Error('Embedded wallet not found')
      const provider = await embedded.getEthereumProvider()
      const from = embedded.address
      const hash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{ from, data: BOX_BYTECODE, chainId: `0x${chain.id.toString(16)}` }]
      })
      setDeployHash(hash || '')
    } catch (e) {
      setError(e?.message || 'Deploy with EOA failed')
    } finally {
      setBusy(false)
    }
  }

  async function eoaTransfer() {
    try {
      setError('')
      setBusy(true)
      setTxHash('')
      const embedded = wallets.find(w => w.walletClientType === 'privy')
      if (!embedded) throw new Error('Embedded wallet not found')
      if (!token || !recipient || !amount) throw new Error('Enter token, recipient, and amount')
      const provider = await embedded.getEthereumProvider()
      const from = embedded.address
      const value = parseUnits(amount, Number(decimals || '18'))
      const data = encodeFunctionData({
        abi: [
          { name: 'transfer', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }], outputs: [{ name: 'ok', type: 'bool' }] }
        ],
        functionName: 'transfer',
        args: [recipient, value]
      })
      const hash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{ from, to: token, data, chainId: `0x${chain.id.toString(16)}` }]
      })
      setTxHash(hash || '')
    } catch (e) {
      setError(e?.message || 'Transfer failed')
    } finally {
      setBusy(false)
    }
  }

  // Helper function to create smart account client
  async function createSmartAccountClientHelper() {
    const embedded = wallets.find(w => w.walletClientType === 'privy')
    if (!embedded) throw new Error('Embedded wallet not found')

    const provider = await embedded.getEthereumProvider()
    const ownerAddress = embedded.address
    
    if (!ownerAddress) throw new Error('Owner address not found')

    const entryPoint = { address: '0xd308aE59cb31932E8D9305BAda32Fa782d3D5d42', version: '0.6' }
    const bundlerUrl = '/bundler'
    const publicClient = createPublicClient({ chain, transport: http() })
    
    const walletClient = createWalletClient({
      chain,
      transport: custom(provider)
    })
    
    const factoryAddress = '0x0338Dcd5512ae8F3c481c33Eb4b6eEdF632D1d2f'
    
    console.log('Using factory:', factoryAddress)
    console.log('EntryPoint:', entryPoint.address)
    console.log('Chain:', chain.id)

    const account = await toSimpleSmartAccount({ 
      client: publicClient, 
      owner: walletClient,
      entryPoint, 
      factoryAddress,
      salt: 0n
    })

    console.log('Smart Account Address:', account.address)
    
    if (!account.address || account.address === '0x0000000000000000000000000000000000000000') {
      throw new Error('Failed to create smart account - invalid factory or owner')
    }

    const customPaymaster = {
      sponsorUserOperation: async (userOperation) => {
        console.log('Sponsoring UserOperation:', userOperation)
        
        if (!userOperation.sender || userOperation.sender === '0x0000000000000000000000000000000000000000') {
          throw new Error('Invalid sender address in user operation')
        }
        
        const result = await callJsonRpc('pm_sponsorUserOperation', [userOperation, entryPoint.address])
        console.log('Paymaster Response:', result)
        return result
      }
    }

    const bundlerTransport = http(bundlerUrl)
    const saClient = createSmartAccountClient({ 
      account, 
      chain, 
      bundlerTransport, 
      paymaster: customPaymaster,
      userOperationSimulateTimeout: 30000
    })

    return saClient
  }

  // Gasless ERC-20 transfer via AA (bundler + paymaster)
  async function gaslessTransfer() {
    try {
      setError('')
      setBusy(true)
      setTxHash('')
      
      if (!token || !recipient || !amount) throw new Error('Enter token, recipient, and amount')

      const saClient = await createSmartAccountClientHelper()
      const value = parseUnits(amount, Number(decimals || '18'))
      const data = encodeFunctionData({
        abi: [
          { name: 'transfer', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }], outputs: [{ name: 'success', type: 'bool' }] }
        ],
        functionName: 'transfer',
        args: [recipient, value]
      })

      console.log('Sending gasless transfer to token:', token)
      console.log('Transfer data:', data)

      const hash = await saClient.sendTransaction({ 
        to: token,
        data,
        value: 0n
      })
      
      console.log('Transaction hash:', hash)
      setTxHash(hash || '')
    } catch (e) {
      console.error('Transfer error:', e)
      setError(e?.message || 'Gasless transfer failed')
    } finally {
      setBusy(false)
    }
  }

  // NEW: Gasless ERC-20 approve via AA (bundler + paymaster)
  async function gaslessApprove() {
    try {
      setError('')
      setBusy(true)
      setTxHash('')
      
      if (!token || !spender || !approveAmount) throw new Error('Enter token, spender, and approve amount')

      const saClient = await createSmartAccountClientHelper()
      const value = parseUnits(approveAmount, Number(decimals || '18'))
      const data = encodeFunctionData({
        abi: [
          { name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: 'success', type: 'bool' }] }
        ],
        functionName: 'approve',
        args: [spender, value]
      })

      console.log('Sending gasless approve to token:', token)
      console.log('Spender:', spender)
      console.log('Amount:', value.toString())
      console.log('Approve data:', data)

      const hash = await saClient.sendTransaction({ 
        to: token,
        data,
        value: 0n
      })
      
      console.log('Approve transaction hash:', hash)
      setTxHash(hash || '')
    } catch (e) {
      console.error('Approve error:', e)
      setError(e?.message || 'Gasless approve failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <h2 className="h2">EOA ERC-20 transfer + Gasless interactions</h2>
      <div className="label" style={{ marginBottom: 8 }}>
        Chain: {chain?.name} (id {chain?.id})
      </div>
      
      {/* Transfer Section */}
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 8 }}>Transfer</h3>
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <input className="input" placeholder="ERC-20 token (0x...)" value={token} onChange={(e) => setToken(e.target.value)} />
          <input className="input" placeholder="Recipient (0x...)" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
          <input className="input" placeholder="Amount (e.g. 1.5)" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <input className="input" placeholder="Decimals (default 18)" value={decimals} onChange={(e) => setDecimals(e.target.value)} />
        </div>
      </div>

      {/* Approve Section */}
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 8 }}>Approve</h3>
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <input className="input" placeholder="Token (use same as above)" value={token} disabled style={{ opacity: 0.7 }} />
          <input className="input" placeholder="Spender address (0x...)" value={spender} onChange={(e) => setSpender(e.target.value)} />
          <input className="input" placeholder="Approve amount (e.g. 1000)" value={approveAmount} onChange={(e) => setApproveAmount(e.target.value)} />
          <input className="input" placeholder="Decimals (same as above)" value={decimals} disabled style={{ opacity: 0.7 }} />
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <button className="btn btn-primary" onClick={eoaTransfer} disabled={busy}>Send EOA transfer</button>
        <button className="btn btn-primary" onClick={gaslessTransfer} disabled={busy}>Send gasless transfer</button>
        <button className="btn btn-success" onClick={gaslessApprove} disabled={busy}>Send gasless approve</button>
        <button className="btn btn-muted" onClick={deployWithEOA} disabled={busy}>Deploy with EOA</button>
      </div>

      {/* Results */}
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
      {txHash && (
        <div style={{ marginTop: 8 }}>
          <strong>Tx:</strong>{' '}
          {explorerBase ? (
            <a href={`${explorerBase}/tx/${txHash}`} target="_blank" rel="noreferrer">{txHash}</a>
          ) : (
            <span>{txHash}</span>
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