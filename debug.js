import { keccak256, encodePacked } from "viem"

const user = "0x8A97066C220648B97618354f1d7770cD4131C526"      // same input you send to contract
const isCorrect = true    // or false
const epoch = 1n
const nonce = 27005136642881061657166582652271258250987822458781338828329735620410979354916n

// msgHash = keccak256(abi.encodePacked(...))
const msgHash = keccak256(
  encodePacked(["address","bool","uint256","uint256"], [user, isCorrect, epoch, nonce])
)

// ethMsgHash = keccak256("\x19Ethereum Signed Message:\n32" + msgHash)
const ethMsgHash = keccak256(
  encodePacked(["string","bytes32"], ["\x19Ethereum Signed Message:\n32", msgHash])
)

console.log("msgHash", msgHash)
console.log("ethSignedMessageHash", ethMsgHash)
