// Usage:
//   node test.js \
//     --user 0xYourUserAddress \
//     --correct true|false \
//     --epoch 123 \
//     --nonce 456 \
//     --pk 0xYourPrivateKey
//
// Output: 0x... (65-byte signature that WorkScoreTracker._verifyQuizSignature accepts)

import { keccak256, encodePacked, hexToBytes } from "viem"
import { privateKeyToAccount } from "viem/accounts"

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

function ensureHexAddress(addr) {
  if (typeof addr !== 'string' || !addr.startsWith('0x') || addr.length !== 42) {
    throw new Error(`Invalid address: ${addr}`)
  }
  return addr
}

function ensureHexPrivateKey(pk) {
  if (typeof pk !== 'string' || !pk.startsWith('0x')) throw new Error('Private key must be 0x-prefixed')
  const hex = pk.slice(2)
  if (!(hex.length === 64 || hex.length === 66)) throw new Error('Private key must be 32 bytes hex')
  return pk
}

async function main() {
  const args = parseArgs(process.argv)

  const user = ensureHexAddress(args.user || args.address)
  const isCorrect = toBool(args.correct ?? args.isCorrect)
  const epoch = BigInt(args.epoch ?? args.epochNumber)
  const nonce = BigInt(args.nonce)
  const pk = ensureHexPrivateKey(args.pk || args.privkey || process.env.PRIVATE_KEY)

  // messageHash = keccak256(abi.encodePacked(user, isCorrect, epochNumber, nonce))
  const messageHash = keccak256(
    encodePacked(
      ["address", "bool", "uint256", "uint256"],
      [user, isCorrect, epoch, nonce]
    )  )

  // EIP-191 personal_sign over 32-byte message (matches Solidity's "\x19Ethereum Signed Message:\n32" + hash)
  const account = privateKeyToAccount(pk)
  console.log("account.address =", account.address)
  
  const signature = await account.signMessage({
    message: { raw: hexToBytes(messageHash) }, // ensures it interprets as a 32-byte hash
  })
  // Convert to bytes
let sigBytes = hexToBytes(signature)
let v = sigBytes[64]
console.log("v", v)

// Normalize v to {27, 28}
if (v < 27) {
  sigBytes[64] = v + 27
}

// Back to hex string
let sig = `0x${Buffer.from(sigBytes).toString("hex")}`

console.log(sig)
}

main().catch((err) => {
  console.error('Error:', err?.message || err)
  process.exit(1)
})


