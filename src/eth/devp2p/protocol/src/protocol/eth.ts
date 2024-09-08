import * as snappy from 'snappyjs'
import { RLP } from '~/eth/rlp'
import { Protocol } from '../protocol'
import { bytesToInt } from '~/eth/utils'

import type { Input } from '~/eth/rlp'

export class ETH extends Protocol {
	static eth68 = {
		name: 'eth',
		version: 68,
		length: 17,
		constructor: ETH
	}

	getMsgPrefix(msgCode: ETH.MESSAGE_CODES): string {
		return ETH.MESSAGE_CODES[msgCode]
	}

	_handleMessage(code: ETH.MESSAGE_CODES, data: Uint8Array) {
		const payload = RLP.decode(data)
		switch (code) {
			case ETH.MESSAGE_CODES.STATUS:
				if (this._statusTimeoutId) {
					clearTimeout(this._statusTimeoutId)
				}
				this.sendMessage(ETH.MESSAGE_CODES.STATUS, payload)
				const version = bytesToInt(payload[0] as Uint8Array)
				if (version >= 66) {
					this.sendMessage(ETH.MESSAGE_CODES.UPGRADE_STATUS, [[1]])
				}
				break
			case ETH.MESSAGE_CODES.GET_BLOCK_HEADERS:
				this.sendMessage(ETH.MESSAGE_CODES.BLOCK_HEADERS, [payload[0], []])
				break
			case ETH.MESSAGE_CODES.GET_BLOCK_BODIES:
				this.sendMessage(ETH.MESSAGE_CODES.BLOCK_BODIES, [payload[0], []])
				break
		}
		this.events.emit('message', code, payload)
	}

	sendMessage(code: ETH.MESSAGE_CODES, payload: Input) {
		payload = RLP.encode(payload)
		if (this._peer._isSnappy()) {
			payload = snappy.compress(payload)
		}
		this._send(code, payload)
	}
}

export namespace ETH {
	export interface StatusMsg extends Array<Uint8Array | Uint8Array[]> {}

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

		// eth66 (BSC)
		UPGRADE_STATUS = 0x0b
	}
}
