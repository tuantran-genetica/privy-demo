import { erc20Abi, formatUnits } from 'viem'
import { tryDecodeRevertReason } from './onchain.js'

// Preflight simulate an ERC-20 transfer from the smart account address.
// Returns { ok: boolean, reason?: string }
export async function preflightErc20Transfer(publicClient, fromAddress, tokenAddress, toAddress, amount) {
  try {
    await publicClient.simulateContract({
      account: fromAddress,
      address: tokenAddress,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [toAddress, amount]
    })
    return { ok: true }
  } catch (e) {
    const revertData = e?.data || e?.cause?.data || ''
    const decoded = tryDecodeRevertReason(revertData)
    const reason = decoded || e?.shortMessage || e?.message || 'Simulation failed'
    return { ok: false, reason }
  }
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
