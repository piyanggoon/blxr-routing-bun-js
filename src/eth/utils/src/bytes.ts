import { hexToBytes } from 'ethereum-cryptography/utils'

type PrefixedHexString = `0x${string}`

const BIGINT_0 = BigInt(0)
const BIGINT_CACHE: bigint[] = []
for (let i = 0; i <= 256 * 256 - 1; i++) {
	BIGINT_CACHE[i] = BigInt(i)
}
const hexByByte = Array.from({ length: 256 }, (v, i) => i.toString(16).padStart(2, '0'))

// todo: padToEven (func)
export const intToHex = (i: number): PrefixedHexString => {
	if (!Number.isSafeInteger(i) || i < 0) {
		throw new Error(`Received an invalid integer type: ${i}`)
	}
	let hex = i.toString(16)
	if (hex.length % 2 !== 0) {
		hex = `0${hex}`
	}
	return `0x${hex}`
}

export const intToBytes = (i: number): Uint8Array => {
	const hex = intToHex(i)
	return hexToBytes(hex)
}

export const bytesToHex = (bytes: Uint8Array): PrefixedHexString => {
	let hex: PrefixedHexString = `0x`
	if (bytes === undefined || bytes.length === 0) return hex
	for (const byte of bytes) {
		hex = `${hex}${hexByByte[byte]}`
	}
	return hex
}

export const bytesToBigInt = (bytes: Uint8Array, littleEndian = false): bigint => {
	if (littleEndian) {
		bytes.reverse()
	}
	const hex = bytesToHex(bytes)
	if (hex === '0x') {
		return BIGINT_0
	}
	if (hex.length === 4) {
		return BIGINT_CACHE[bytes[0]]
	}
	if (hex.length === 6) {
		return BIGINT_CACHE[bytes[0] * 256 + bytes[1]]
	}
	return BigInt(hex)
}

export const bytesToInt = (bytes: Uint8Array): number => {
	const res = Number(bytesToBigInt(bytes))
	if (!Number.isSafeInteger(res)) throw new Error('Number exceeds 53 bits')
	return res
}

export const concatBytes = (...arrays: Uint8Array[]): Uint8Array => {
	if (arrays.length === 1) return arrays[0]
	const length = arrays.reduce((a, arr) => a + arr.length, 0)
	const result = new Uint8Array(length)
	for (let i = 0, pad = 0; i < arrays.length; i++) {
		const arr = arrays[i]
		result.set(arr, pad)
		pad += arr.length
	}
	return result
}
