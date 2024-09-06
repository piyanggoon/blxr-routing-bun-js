import { concatBytes } from '../utils'

export type Input = string | number | bigint | Uint8Array | Array<Input> | null | undefined
export type NestedUint8Array = Array<Uint8Array | NestedUint8Array>

export interface Decoded {
	data: Uint8Array | NestedUint8Array
	remainder: Uint8Array
}

export function encode(input: Input): Uint8Array {
	if (Array.isArray(input)) {
		const output: Uint8Array[] = []
		let outputLength = 0
		for (let i = 0; i < input.length; i++) {
			const encoded = encode(input[i])
			output.push(encoded)
			outputLength += encoded.length
		}
		return concatBytes(encodeLength(outputLength, 192), ...output)
	}
	const inputBuf = toBytes(input)
	if (inputBuf.length === 1 && inputBuf[0] < 128) {
		return inputBuf
	}
	return concatBytes(encodeLength(inputBuf.length, 128), inputBuf)
}

function safeSlice(input: Uint8Array, start: number, end: number) {
	if (end > input.length) {
		throw new Error('invalid RLP (safeSlice): end slice of Uint8Array out-of-bounds')
	}
	return input.slice(start, end)
}

function decodeLength(v: Uint8Array): number {
	if (v[0] === 0) {
		throw new Error('invalid RLP: extra zeros')
	}
	return parseHexByte(bytesToHex(v))
}

function encodeLength(len: number, offset: number): Uint8Array {
	if (len < 56) {
		return Uint8Array.from([len + offset])
	}
	const hexLength = numberToHex(len)
	const lLength = hexLength.length / 2
	const firstByte = numberToHex(offset + 55 + lLength)
	return Uint8Array.from(hexToBytes(firstByte + hexLength))
}

export function decode(input: Input, stream?: false): Uint8Array | NestedUint8Array
export function decode(input: Input, stream?: true): Decoded
export function decode(input: Input, stream = false): Uint8Array | NestedUint8Array | Decoded {
	if (typeof input === 'undefined' || input === null || (input as any).length === 0) {
		return Uint8Array.from([])
	}
	const inputBytes = toBytes(input)
	const decoded = _decode(inputBytes)
	if (stream) {
		return {
			data: decoded.data,
			remainder: decoded.remainder.slice(),
		}
	}
	if (decoded.remainder.length !== 0) {
		throw new Error('invalid RLP: remainder must be zero')
	}
	return decoded.data
}

function _decode(input: Uint8Array): Decoded {
	let length: number, lLength: number, data: Uint8Array, innerRemainder: Uint8Array, d: Decoded
	const decoded = []
	const firstByte = input[0]

	if (firstByte <= 0x7f) {
		return {
			data: input.slice(0, 1),
			remainder: input.subarray(1),
		}
	} else if (firstByte <= 0xb7) {
		length = firstByte - 0x7f

		if (firstByte === 0x80) {
			data = Uint8Array.from([])
		} else {
			data = safeSlice(input, 1, length)
		}

		if (length === 2 && data[0] < 0x80) {
			throw new Error('invalid RLP encoding: invalid prefix, single byte < 0x80 are not prefixed')
		}

		return {
			data,
			remainder: input.subarray(length),
		}
	} else if (firstByte <= 0xbf) {
		lLength = firstByte - 0xb6
		if (input.length - 1 < lLength) {
			throw new Error('invalid RLP: not enough bytes for string length')
		}
		length = decodeLength(safeSlice(input, 1, lLength))
		if (length <= 55) {
			throw new Error('invalid RLP: expected string length to be greater than 55')
		}
		data = safeSlice(input, lLength, length + lLength)

		return {
			data,
			remainder: input.subarray(length + lLength),
		}
	} else if (firstByte <= 0xf7) {
		length = firstByte - 0xbf
		innerRemainder = safeSlice(input, 1, length)
		while (innerRemainder.length) {
			d = _decode(innerRemainder)
			decoded.push(d.data)
			innerRemainder = d.remainder
		}

		return {
			data: decoded,
			remainder: input.subarray(length),
		}
	} else {
		lLength = firstByte - 0xf6
		length = decodeLength(safeSlice(input, 1, lLength))
		if (length < 56) {
			throw new Error('invalid RLP: encoded list too short')
		}
		const totalLength = lLength + length
		if (totalLength > input.length) {
			throw new Error('invalid RLP: total length is larger than the data')
		}

		innerRemainder = safeSlice(input, lLength, totalLength)

		while (innerRemainder.length) {
			d = _decode(innerRemainder)
			decoded.push(d.data)
			innerRemainder = d.remainder
		}

		return {
			data: decoded,
			remainder: input.subarray(totalLength),
		}
	}
}

const cachedHexes = Array.from({ length: 256 }, (_v, i) => i.toString(16).padStart(2, '0'))
function bytesToHex(uint8a: Uint8Array): string {
	let hex = ''
	for (let i = 0; i < uint8a.length; i++) {
		hex += cachedHexes[uint8a[i]]
	}
	return hex
}

function parseHexByte(hexByte: string): number {
	const byte = Number.parseInt(hexByte, 16)
	if (Number.isNaN(byte)) throw new Error('Invalid byte sequence')
	return byte
}

function hexToBytes(hex: string): Uint8Array {
	if (typeof hex !== 'string') {
		throw new TypeError('hexToBytes: expected string, got ' + typeof hex)
	}
	if (hex.length % 2) throw new Error('hexToBytes: received invalid unpadded hex')
	const array = new Uint8Array(hex.length / 2)
	for (let i = 0; i < array.length; i++) {
		const j = i * 2
		array[i] = parseHexByte(hex.slice(j, j + 2))
	}
	return array
}

declare const TextEncoder: any

function utf8ToBytes(utf: string): Uint8Array {
	return new TextEncoder().encode(utf)
}

function numberToHex(integer: number | bigint): string {
	if (integer < 0) {
		throw new Error('Invalid integer as argument, must be unsigned!')
	}
	const hex = integer.toString(16)
	return hex.length % 2 ? `0${hex}` : hex
}

function padToEven(a: string): string {
	return a.length % 2 ? `0${a}` : a
}

function isHexString(str: string): boolean {
	return str.length >= 2 && str[0] === '0' && str[1] === 'x'
}

function stripHexPrefix(str: string): string {
	if (typeof str !== 'string') {
		return str
	}
	return isHexString(str) ? str.slice(2) : str
}

function toBytes(v: Input): Uint8Array {
	if (v instanceof Uint8Array) {
		return v
	}
	if (typeof v === 'string') {
		if (isHexString(v)) {
			return hexToBytes(padToEven(stripHexPrefix(v)))
		}
		return utf8ToBytes(v)
	}
	if (typeof v === 'number' || typeof v === 'bigint') {
		if (!v) {
			return Uint8Array.from([])
		}
		return hexToBytes(numberToHex(v))
	}
	if (v === null || v === undefined) {
		return Uint8Array.from([])
	}
	throw new Error('toBytes: received unsupported type ' + typeof v)
}

export const utils = {
	bytesToHex,
	concatBytes,
	hexToBytes,
	utf8ToBytes,
}

export const RLP = { encode, decode }
