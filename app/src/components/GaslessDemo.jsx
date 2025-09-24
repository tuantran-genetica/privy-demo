import React, { useMemo, useState } from 'react'
import { useWallets } from '@privy-io/react-auth'
import { encodeFunctionData, createPublicClient, http, concatHex, toHex } from 'viem'
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

  // Gasless deploy via custom AA (EP + bundler + paymaster)
  async function deployGasless() {
    try {
      setError('')
      setBusy(true)
      setTxHash('')
      setDeployHash('')
      const embedded = wallets.find(w => w.walletClientType === 'privy')
      if (!embedded) throw new Error('Embedded wallet not found')
      const owner = await embedded.getEthereumProvider()

      const entryPoint = { address: '0xd308aE59cb31932E8D9305BAda32Fa782d3D5d42', version: '0.6' }
      const bundlerUrl = '/bundler'
      const paymasterUrl = '/paymaster'
      const factory = import.meta.env.VITE_DEPLOY_FACTORY
      if (!factory) throw new Error('Set VITE_DEPLOY_FACTORY to your deployer contract')

      const publicClient = createPublicClient({ chain, transport: http() })
      const account = await toSimpleSmartAccount({ client: publicClient, owner, entryPoint, factoryAddress: '0x0338Dcd5512ae8F3c481c33Eb4b6eEdF632D1d2f' })
      const bundlerTransport = http(bundlerUrl)
      const paymaster = createPimlicoClient({ transport: http(paymasterUrl), entryPoint })
      const saClient = createSmartAccountClient({ account, chain, bundlerTransport, paymaster })

      const data = encodeFunctionData({
        abi: [
          { name: 'deploy', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'bytecode', type: 'bytes' }], outputs: [{ name: 'addr', type: 'address' }] }
        ],
        functionName: 'deploy',
        args: [BOX_BYTECODE]
      })
      const hash = await saClient.sendTransaction({ chain, calls: [{ to: factory, data, value: 0n }] })
      setDeployHash(hash || '')
    } catch (e) {
      setError(e?.message || 'Gasless deploy failed')
    } finally {
      setBusy(false)
    }
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

  // Gasless ERC-20 transfer via AA (bundler + paymaster)
  async function gaslessTransfer() {
    try {
      setError('')
      setBusy(true)
      setTxHash('')
      const embedded = wallets.find(w => w.walletClientType === 'privy')
      if (!embedded) throw new Error('Embedded wallet not found')
      if (!token || !recipient || !amount) throw new Error('Enter token, recipient, and amount')

      const owner = await embedded.getEthereumProvider()
      const entryPoint = { address: '0xd308aE59cb31932E8D9305BAda32Fa782d3D5d42', version: '0.6' }
      const bundlerUrl = '/bundler'
      const paymasterUrl = '/paymaster'

      const publicClient = createPublicClient({ chain, transport: http() })
      const account = await toSimpleSmartAccount({ client: publicClient, owner, entryPoint, factoryAddress: '0x0338Dcd5512ae8F3c481c33Eb4b6eEdF632D1d2f' })
      const bundlerTransport = http(bundlerUrl)
      // Use custom paymaster endpoint that returns sponsorship fields
      const sponsorClient = {
        sponsorUserOperation: async (uoStruct) => {
          const res = await fetch(`${paymasterUrl}/sponsorUserOperation`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ userOperation: uoStruct, entryPoint: entryPoint.address, chainId: chain.id })
          })
          if (!res.ok) throw new Error(`Paymaster error ${res.status}`)
          return await res.json()
        }
      }
      const saClient = createSmartAccountClient({ account, chain, bundlerTransport, paymaster: sponsorClient })

      const value = parseUnits(amount, Number(decimals || '18'))
      const data = encodeFunctionData({
        abi: [
          { name: 'transfer', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }], outputs: [{ name: 'ok', type: 'bool' }] }
        ],
        functionName: 'transfer',
        args: [recipient, value]
      })

      const hash = await saClient.sendTransaction({ chain, calls: [{ to: token, data, value: 0n }] })
      setTxHash(hash || '')
    } catch (e) {
      setError(e?.message || 'Gasless transfer failed')
    } finally {
      setBusy(false)
    }
  }

  async function setValue() {
    try {
      if (!contract) {
        setError('Enter deployed contract address')
        return
      }
      setError('')
      setBusy(true)
      const data = encodeFunctionData({
        abi: [
          { stateMutability: 'nonpayable', type: 'function', name: 'set', inputs: [{ name: '_v', type: 'uint256' }], outputs: [] }
        ],
        functionName: 'set',
        args: [BigInt(42)]
      })
      const embedded = wallets.find(w => w.walletClientType === 'privy')
      if (!embedded) throw new Error('Embedded wallet not found')
      const provider = await embedded.getEthereumProvider()
      const from = embedded.address
      const hash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{ from, to: contract, data, chainId: `0x${chain.id.toString(16)}` }]
      })
      setTxHash(hash || '')
    } catch (e) {
      setError(e?.message || 'Transaction failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <h2 className="h2">EOA ERC-20 transfer + Gasless deploy</h2>
      <div className="label" style={{ marginBottom: 8 }}>
        Chain: {chain?.name} (id {chain?.id})
      </div>
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <input className="input" placeholder="ERC-20 token (0x...)" value={token} onChange={(e) => setToken(e.target.value)} />
        <input className="input" placeholder="Recipient (0x...)" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
        <input className="input" placeholder="Amount (e.g. 1.5)" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <input className="input" placeholder="Decimals (default 18)" value={decimals} onChange={(e) => setDecimals(e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <button className="btn btn-primary" onClick={eoaTransfer} disabled={busy}>Send EOA transfer</button>
        <button className="btn btn-primary" onClick={gaslessTransfer} disabled={busy}>Send gasless transfer</button>
        <button className="btn btn-muted" onClick={deployGasless} disabled={busy}>Deploy Box.sol (gasless)</button>
        <button className="btn btn-muted" onClick={deployWithEOA} disabled={busy}>Deploy with EOA</button>
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


