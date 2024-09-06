import { secp256k1 } from 'ethereum-cryptography/secp256k1'
import { publicKeyConvert } from 'ethereum-cryptography/secp256k1-compat'
import { bytesToHex, equalsBytes } from 'ethereum-cryptography/utils'
import { RLP } from '../rlp'
import { concatBytes } from '../utils'

type assertInput = Uint8Array | Uint8Array[] | number | null

export function genPrivateKey(): Uint8Array {
	const privateKey = secp256k1.utils.randomPrivateKey()
	return secp256k1.utils.isValidPrivateKey(privateKey) === true ? privateKey : genPrivateKey()
}

export function pk2id(pk: Uint8Array): Uint8Array {
	if (pk.length === 33) {
		pk = publicKeyConvert(pk, false)
	}
	return pk.subarray(1)
}

export function id2pk(id: Uint8Array): Uint8Array {
	return concatBytes(Uint8Array.from([0x04]), id)
}

export function zfill(bytes: Uint8Array, size: number, leftpad = true): Uint8Array {
	if (bytes.length >= size) return bytes
	if (leftpad === undefined) leftpad = true
	const pad = new Uint8Array(size - bytes.length).fill(0x00)
	return leftpad ? concatBytes(pad, bytes) : concatBytes(bytes, pad)
}

export function xor(a: Uint8Array, b: any): Uint8Array {
	const length = Math.min(a.length, b.length)
	const bytes = new Uint8Array(length)
	for (let i = 0; i < length; ++i) bytes[i] = a[i] ^ b[i]
	return bytes
}

export function assertEq(expected: assertInput, actual: assertInput, msg: string): void {
	if (expected instanceof Uint8Array && actual instanceof Uint8Array) {
		if (equalsBytes(expected, actual)) return
		throw new Error(`${msg}: ${bytesToHex(expected)} / ${bytesToHex(actual)}`)
	}
	if (expected === actual) return
	throw new Error(`${msg}: ${expected} / ${actual}`)
}

export function unstrictDecode(value: Uint8Array) {
	return RLP.decode(value, true).data
}
