// Usage:
//   node verify.js \
//     --user 0xUser \
//     --correct true|false \
//     --epoch 123 \
//     --nonce 456 \
//     --sig 0xSignature \
//     --auth 0xAuthorizedSigner
//
// Exits 0 on valid (recovered == authorized). Prints recovered address and status.

import { keccak256, encodePacked } from "viem"
import { recoverMessageAddress } from "viem/accounts"

function parseArgs(argv) {
  const out = {}
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) continue
    const key = arg.slice(2)
    const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true'
    out[key] = val
  }
  return out
}

function toBool(input) {
  if (typeof input === 'boolean') return input
  const s = String(input).toLowerCase().trim()
  if (s === 'true' || s === '1') return true
  if (s === 'false' || s === '0') return false
  throw new Error(`Invalid boolean: ${input}`)
}

function ensureHexAddress(addr, label = 'address') {
  if (typeof addr !== 'string' || !addr.startsWith('0x') || addr.length !== 42) {
    throw new Error(`Invalid ${label}: ${addr}`)
  }
  return addr
}

function ensureHexSig(sig) {
  if (typeof sig !== 'string' || !sig.startsWith('0x')) throw new Error('Signature must be 0x-prefixed')
  if (sig.length !== 132 && sig.length !== 130) throw new Error('Signature must be 65 bytes')
  return sig
}

async function main() {
  const args = parseArgs(process.argv)

  const user = ensureHexAddress(args.user || args.address, 'user')
  const isCorrect = toBool(args.correct ?? args.isCorrect)
  const epoch = BigInt(args.epoch ?? args.epochNumber)
  const nonce = BigInt(args.nonce)
  const signature = ensureHexSig(args.sig || args.signature)
  const authorized = ensureHexAddress(args.auth || args.authorized || args.authorizedSigner, 'authorized signer')

  // messageHash = keccak256(abi.encodePacked(user, isCorrect, epochNumber, nonce))
  const messageHash = keccak256(
    encodePacked(
      ["address", "bool", "uint256", "uint256"],
      [user, isCorrect, epoch, nonce]
    )
  )

  // Recover signer from EIP-191 prefixed message
  const recovered = await recoverMessageAddress({ message: { raw: messageHash }, signature })

  const ok = recovered.toLowerCase() === authorized.toLowerCase()

  console.log(JSON.stringify({
    user,
    isCorrect,
    epoch: epoch.toString(),
    nonce: nonce.toString(),
    messageHash,
    recovered,
    authorized,
    valid: ok
  }, null, 2))

  if (!ok) process.exit(2)
}

main().catch((err) => {
  console.error('Error:', err?.message || err)
  process.exit(1)
})


