import { createHash } from 'node:crypto'
import { ecdh } from 'ethereum-cryptography/secp256k1-compat'
import { concatBytes } from '~/eth/utils'

export function ecdhX(publicKey: Uint8Array, privateKey: Uint8Array) {
	function hashfn(x: Uint8Array, y: Uint8Array) {
		const pubKey = new Uint8Array(33)
		pubKey[0] = (y[31] & 1) === 0 ? 0x02 : 0x03
		pubKey.set(x, 1)
		return pubKey.subarray(1)
	}
	return ecdh(publicKey, privateKey, { hashfn }, new Uint8Array(32))
}

export function concatKDF(keyMaterial: Uint8Array, keyLength: number) {
	const bytes = []
	const SHA256BlockSize = 64
	const reps = ((keyLength + 7) * 8) / (SHA256BlockSize * 8)
	for (let counter = 0, tmp = new Uint8Array(4); counter <= reps; ) {
		counter += 1
		new DataView(tmp.buffer).setUint32(0, counter)
		bytes.push(Uint8Array.from(createHash('sha256').update(tmp).update(keyMaterial).digest()))
	}
	return concatBytes(...bytes).subarray(0, keyLength)
}
