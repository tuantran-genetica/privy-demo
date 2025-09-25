// Shared AA/Paymaster helpers extracted from GaslessDemo

// Keep parseUnits simple and deterministic
export function parseUnits(value, decs) {
  const [intPart, fracRaw] = String(value).split('.')
  const frac = (fracRaw || '').slice(0, Number(decs)).padEnd(Number(decs), '0')
  const whole = (intPart || '0') + frac
  return BigInt(whole.replace(/^0+(?=\d)/, ''))
}

// Convert BigInt & bytes for Go server while preserving AA 0.7 layout
export function serializeUserOperation(uo) {
  const serialized = { ...uo }

  Object.keys(serialized).forEach(key => {
    if (typeof serialized[key] === 'bigint') {
      const value = serialized[key]
      serialized[key] = value.toString(10)
    }
  })

  if (!serialized.paymaster) serialized.paymaster = '0x0000000000000000000000000000000000000000'
  if (!serialized.paymasterData) serialized.paymasterData = '0x'

  if (!serialized.factory || serialized.factory === '0x0000000000000000000000000000000000000000') delete serialized.factory
  if (!serialized.factoryData || serialized.factoryData === '0x') delete serialized.factoryData

  if ((!serialized.initCode || serialized.initCode === '0x') && serialized.factory && serialized.factoryData) {
    try {
      const concatenated = '0x' + String(serialized.factory).replace(/^0x/,'') + String(serialized.factoryData).replace(/^0x/,'')
      serialized.initCode = concatenated
    } catch {}
  } else if (!serialized.initCode || serialized.initCode === '0x') {
    delete serialized.initCode
  }

  const byteFields = ['callData', 'paymasterData', 'factoryData', 'initCode']
  byteFields.forEach(field => {
    if (!serialized[field] || typeof serialized[field] !== 'string') serialized[field] = '0x'
    if (!serialized[field].startsWith('0x')) serialized[field] = '0x' + serialized[field]
    if (serialized[field] === '0x') {
      serialized[field] = null
    } else {
      try {
        const hex = serialized[field].slice(2)
        const evenHex = hex.length % 2 ? '0' + hex : hex
        const bytes = new Uint8Array(evenHex.match(/.{2}/g).map(b => parseInt(b, 16)))
        serialized[field] = btoa(String.fromCharCode.apply(null, bytes))
      } catch {
        serialized[field] = null
      }
    }
  })

  const expected = [
    'sender','nonce','callData','callGasLimit','verificationGasLimit','preVerificationGas','maxFeePerGas','maxPriorityFeePerGas','paymaster','paymasterData','paymasterVerificationGasLimit','paymasterPostOpGasLimit','factory','factoryData','initCode'
  ]
  const out = {}
  expected.forEach(f => { if (serialized[f] !== undefined) out[f] = serialized[f] })
  delete out.signature
  return out
}

// Normalize sponsor response to viem 0.7 fields
export function normalizeSponsorship(resp) {
  const r = resp?.result ?? resp?.data ?? resp
  if (!r || typeof r !== 'object') return {}
  const gas = r.gas || r.gasLimits || r
  const out = {}
  if (r.paymaster) out.paymaster = r.paymaster
  if (r.paymasterData) out.paymasterData = r.paymasterData

  const maybe = (val) => {
    if (typeof val === 'string') return val.startsWith('0x') ? BigInt(val) : BigInt(val)
    if (typeof val === 'number') return BigInt(val)
    return val
  }
  if (gas.preVerificationGas != null) out.preVerificationGas = maybe(gas.preVerificationGas)
  if (gas.verificationGasLimit != null) out.verificationGasLimit = maybe(gas.verificationGasLimit)
  if (gas.callGasLimit != null) out.callGasLimit = maybe(gas.callGasLimit)
  if (r.maxFeePerGas != null) out.maxFeePerGas = maybe(r.maxFeePerGas)
  if (r.maxPriorityFeePerGas != null) out.maxPriorityFeePerGas = maybe(r.maxPriorityFeePerGas)
  if (r.paymasterVerificationGasLimit != null) out.paymasterVerificationGasLimit = maybe(r.paymasterVerificationGasLimit)
  if (r.paymasterPostOpGasLimit != null) out.paymasterPostOpGasLimit = maybe(r.paymasterPostOpGasLimit)
  console.log('out', out)
  return out
}

// Build JSON-RPC body for Go server with unquoted big.Int fields
export function buildPaymasterBody(userOp, entryPointAddress) {
  const payload = {
    jsonrpc: '2.0',
    method: 'pm_sponsorUserOperation',
    params: [serializeUserOperation(userOp), entryPointAddress],
    id: 1
  }
  let jsonStr = JSON.stringify(payload)
  const numericKeys = [
    'nonce','callGasLimit','verificationGasLimit','preVerificationGas','maxFeePerGas','maxPriorityFeePerGas','paymasterVerificationGasLimit','paymasterPostOpGasLimit'
  ]
  numericKeys.forEach((key) => {
    const re = new RegExp(`"${key}":"(\\d+)"`, 'g')
    jsonStr = jsonStr.replace(re, `"${key}":$1`)
  })
  return jsonStr
}


