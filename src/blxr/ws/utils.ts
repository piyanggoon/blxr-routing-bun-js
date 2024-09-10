import { hexToBytes } from 'ethereum-cryptography/utils'

export function blxrHex(data: string) {
	if (data && data !== '0x0') {
		let hex = data.startsWith('0x') ? data.slice(2) : data
		if (hex.length % 2 !== 0) {
			hex = `0${hex}`
		}
		return hexToBytes(`0x${hex}`)
	}
	return new Uint8Array(0)
}
