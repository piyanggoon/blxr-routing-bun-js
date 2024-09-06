import { RLP } from '~/eth/rlp'
import { Protocol } from './protocol'

import type { Input } from '~/eth/rlp'

export class ETH extends Protocol {
	protected _status: ETH.StatusMsg | null = null
	protected _peerStatus: ETH.StatusMsg | null = null

	static eth68 = {
		name: 'eth',
		version: 68,
		length: 17,
		constructor: ETH,
	}

	getMsgPrefix(msgCode: ETH.MESSAGE_CODES): string {
		return ETH.MESSAGE_CODES[msgCode]
	}

	_handleMessage(code: ETH.MESSAGE_CODES, data: Uint8Array) {
		const payload = RLP.decode(data)
		console.log(`Received ${this.getMsgPrefix(code)} message from ${this._peer['_socket'].remoteAddress}`)
	}

	sendMessage(code: ETH.MESSAGE_CODES, payload: Input) {
		const messageName = this.getMsgPrefix(code)
		console.log(`Send ${messageName} message to ${this._peer['_socket'].remoteAddress}`)
	}
}

export namespace ETH {
	export interface StatusMsg extends Array<Uint8Array | Uint8Array[]> {}

	export type StatusOpts = {
		td: Uint8Array
		bestHash: Uint8Array
		latestBlock?: Uint8Array
		genesisHash: Uint8Array
	}

	export enum MESSAGE_CODES {
		// eth62
		STATUS = 0x00,
		NEW_BLOCK_HASHES = 0x01,
		TX = 0x02,
		GET_BLOCK_HEADERS = 0x03,
		BLOCK_HEADERS = 0x04,
		GET_BLOCK_BODIES = 0x05,
		BLOCK_BODIES = 0x06,
		NEW_BLOCK = 0x07,

		// eth63
		GET_NODE_DATA = 0x0d,
		NODE_DATA = 0x0e,
		GET_RECEIPTS = 0x0f,
		RECEIPTS = 0x10,

		// eth65
		NEW_POOLED_TRANSACTION_HASHES = 0x08,
		GET_POOLED_TRANSACTIONS = 0x09,
		POOLED_TRANSACTIONS = 0x0a,
	}
}
