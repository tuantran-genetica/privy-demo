import { createPublicClient, http } from 'viem'

const client = createPublicClient({ transport: http("https://subnets.avax.network/lifeaitest/testnet/rpc") })
const factory = '0xD421D8470b577f6A64992132D04906EfE51F1dE3'

await client.getCode({ address: factory }) // must NOT be '0x'
let address = await client.readContract({
  address: factory,
  abi: [
    { name: 'getAddress', type: 'function', stateMutability: 'view',
      inputs: [{ name: 'owner', type: 'address' }, { name: 'salt', type: 'uint256' }],
      outputs: [{ name: 'addr', type: 'address' }] }
  ],
  functionName: 'getAddress',
  args: ['0x1583f7ea246e5D70693DEb7233340AE3718397C3', 0n]
})
console.log(address)