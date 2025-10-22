#!/usr/bin/env node
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import solc from 'solc'
import { createWalletClient, createPublicClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

function assertEnv(name) {
  const val = process.env[name]
  if (!val) throw new Error(`Missing env ${name}`)
  return val
}

async function main() {
  const rpcUrl = assertEnv('RPC_URL')
  const pk = assertEnv('PRIVATE_KEY')
  const chainId = Number(process.env.CHAIN_ID || 94909)

  const contractPath = path.resolve(process.cwd(), 'contracts/Counter.sol')
  if (!fs.existsSync(contractPath)) throw new Error('Counter.sol not found')
  const source = fs.readFileSync(contractPath, 'utf8')

  const input = {
    language: 'Solidity',
    sources: { 'Counter.sol': { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } }
    }
  }

  const output = JSON.parse(solc.compile(JSON.stringify(input)))
  if (output.errors?.length) {
    const hasError = output.errors.some(e => e.severity === 'error')
    output.errors.forEach(e => console.error(e.formattedMessage || e.message))
    if (hasError) throw new Error('Solidity compilation failed')
  }

  const contract = output.contracts['Counter.sol']['Counter']
  const abi = contract.abi
  const bytecode = '0x' + contract.evm.bytecode.object

  const account = privateKeyToAccount(pk.startsWith('0x') ? pk : `0x${pk}`)
  const walletClient = createWalletClient({ account, chain: { id: chainId }, transport: http(rpcUrl) })
  const publicClient = createPublicClient({ chain: { id: chainId }, transport: http(rpcUrl) })

  console.log('Deploying Counter…')
  const hash = await walletClient.deployContract({ abi, bytecode })
  console.log('Tx sent:', hash)

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error('Deploy transaction failed')

  const address = receipt.contractAddress
  if (!address) throw new Error('No contract address in receipt')

  console.log('Counter deployed at:', address)
  // Write out minimal artifact
  const outDir = path.resolve(process.cwd(), 'server/deploy/artifacts')
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'Counter.json'), JSON.stringify({ address, abi, txHash: hash, chainId }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})


