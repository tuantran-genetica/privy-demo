import { createPublicClient, createWalletClient, http, custom, formatUnits, parseUnits, decodeEventLog, decodeFunctionData, parseEventLogs } from 'viem'
import { erc20Abi } from 'viem'
import { getUserOperationHash, entryPoint07Abi } from 'viem/account-abstraction'
import { createSmartAccountClient } from 'permissionless'
import { toSimpleSmartAccount } from 'permissionless/accounts'
import { buildPaymasterBody, normalizeSponsorship } from './aa'

const ERROR_STRING_SELECTOR = '0x08c379a0'
const PANIC_SELECTOR = '0x4e487b71'

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
        fetchEoaTokenBalance,
        getTxStatus
    } = callbacks

    try {
        const settled = typeof getTxStatus === 'function' && (getTxStatus() === 'success' || getTxStatus() === 'failed')
        if (settled) return

        if (setChecking) setChecking(true)
        if (type === 'approval' && setApprovalStatus) {
            setApprovalStatus('pending')
        } else if (setTxStatus && !settled) {
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
            const maxAttempts = 10

            // Early fallback: if bundler returns null on first try, immediately attempt chain receipt
            if (attempts === 0) {
                const isSettled = typeof getTxStatus === 'function' && (getTxStatus() === 'success' || getTxStatus() === 'failed')
                if (!isSettled && checkTransactionStatus) {
                    // Some bundlers return tx hash instead of userOp hash; try treating uoHash as tx hash
                    try { checkTransactionStatus(uoHash, type) } catch { }
                }
            }

            if (attempts >= maxAttempts) {
                // Bundler still has no receipt; try direct chain lookup as fallback
                setTimeout(() => {
                    const isSettled = typeof getTxStatus === 'function' && (getTxStatus() === 'success' || getTxStatus() === 'failed')
                    if (!isSettled && checkTransactionStatus) checkTransactionStatus(uoHash, type)
                }, 500)
                return
            }
            setTimeout(() => {
                const isSettled = typeof getTxStatus === 'function' && (getTxStatus() === 'success' || getTxStatus() === 'failed')
                if (!isSettled) pollUserOperationReceipt(uoHash, attempts + 1, type, callbacks)
            }, 1500)
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
        } catch { }

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


        const tokenLower = token?.toLowerCase()

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
                // No ERC-20 Transfer detected; treat as failure (AA revert or no-op)
                if (setTxStatus) setTxStatus('failed')
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
                    setFailureReason('Transaction reverted')
                }
            } catch (txError) {
                if (setFailureReason) {
                    setFailureReason('Transaction reverted')
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

// Decode common EVM revert encodings to a concise string.
// - Error(string): 0x08c379a0
// - Panic(uint256): 0x4e487b71
export function tryDecodeRevertReason(revertData) {
    try {
        if (!revertData || revertData === '0x') return ''
        const data = revertData.toLowerCase()
        const selector = data.slice(0, 10)

        // Error(string)
        if (selector === ERROR_STRING_SELECTOR && data.length >= 10 + 64 + 64) {
            // selector (4 bytes) | offset (32) | length (32) | bytes
            const lengthHex = data.slice(10 + 64, 10 + 64 + 64)
            const length = parseInt(lengthHex, 16)
            const start = 10 + 64 + 64
            const end = start + length * 2
            const strHex = data.slice(start, end)
            const bytes = new Uint8Array(strHex.match(/.{1,2}/g).map((b) => parseInt(b, 16)))
            return new TextDecoder().decode(bytes)
        }

        // Panic(uint256)
        if (selector === PANIC_SELECTOR && data.length >= 10 + 64) {
            const codeHex = data.slice(10 + 64 - 8, 10 + 64) // last 4 bytes of the 32-byte word
            return `Panic(0x${codeHex})`
        }

        // Unknown/custom error; return formatted string
        const params = data.slice(10);
        return `Custom revert (selector: ${selector}): ${params}`;
    } catch {
        return revertData || ''
    }
}

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

// Decode and surface only the raw revert reason if available
export async function analyzeTransactionFailure(publicClient, receipt, txHash, type = 'transfer', token, callbacks = {}) {
    const { setFailureReason } = callbacks

    try {
        const aaParsed = parseEventLogs({
            abi: entryPoint07Abi,
            logs: (receipt?.logs || []).map(l => ({ ...l, blockHash: l.blockHash || '0x' })),
            eventName: undefined
        })
        const postOp = aaParsed.find(l => l.eventName === 'PostOpRevertReason')
        const uoRevert = aaParsed.find(l => l.eventName === 'UserOperationRevertReason')
        const revertBytes = postOp?.args?.revertReason || uoRevert?.args?.revertReason
        const decoded = revertBytes ? tryDecodeRevertReason(revertBytes) : ''
        if (decoded && setFailureReason) setFailureReason(decoded)
    } catch (e) {
        // Swallow; no humanized fallback
    }
}
