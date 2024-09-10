import { env } from 'bun'
import { EventEmitter } from 'node:events'
import { WebSocket } from 'ws'
import { blxrHex } from './utils'
import { intToBytes } from '~/eth/utils'
import { Common, Hardfork } from '@ethereumjs/common'
import { loadKZG } from 'kzg-wasm'
import * as TX from '@ethereumjs/tx'

import type { Block } from './types'

const common = Common.custom({ chainId: 56 }, { hardfork: Hardfork.Cancun, customCrypto: { kzg: await loadKZG() } })
const EIP = {
	'0x1': TX.AccessListEIP2930Transaction,
	'0x2': TX.FeeMarketEIP1559Transaction,
	'0x3': TX.BlobEIP4844Transaction
}

export class BlxrWS {
	public events: EventEmitter
	protected ws: WebSocket

	constructor() {
		this.events = new EventEmitter()
		this.ws = new WebSocket(env.BLXR_WS_URL || '', {
			headers: {
				authorization: env.BLXR_AUTHORIZATION || ''
			}
		})
		this.ws.on('open', this.handleOpen.bind(this))
		this.ws.on('message', this.handleMessage.bind(this))
	}

	handleOpen() {
		this.ws.send(
			JSON.stringify({
				id: 1,
				jsonrpc: '2.0',
				method: 'subscribe',
				params: ['bdnBlocks', { include: ['header', 'transactions'] }]
			})
		)
	}

	handleMessage(msg: any) {
		const json = JSON.parse(msg)
		if (json.params && json.params.result) {
			const data = json.params.result as Block
			const header = [
				blxrHex(data.header.parentHash),
				blxrHex(data.header.sha3Uncles),
				blxrHex(data.header.miner),
				blxrHex(data.header.stateRoot),
				blxrHex(data.header.transactionsRoot),
				blxrHex(data.header.receiptsRoot),
				blxrHex(data.header.logsBloom),
				blxrHex(data.header.difficulty),
				blxrHex(data.header.number),
				blxrHex(data.header.gasLimit),
				blxrHex(data.header.gasUsed),
				blxrHex(data.header.timestamp),
				blxrHex(data.header.extraData),
				blxrHex(data.header.mixHash),
				blxrHex(data.header.nonce),
				data.header.baseFeePerGas > 0 ? intToBytes(data.header.baseFeePerGas) : new Uint8Array(0),
				blxrHex(data.header.withdrawalsRoot),
				blxrHex(data.header.blobGasUsed),
				blxrHex(data.header.excessBlobGas)
			]

			const txs = []
			for (const val of data.transactions) {
				if (val.type === '0x0') {
					txs.push([
						blxrHex(val.nonce),
						blxrHex(val.gasPrice),
						blxrHex(val.gas),
						blxrHex(val.to),
						blxrHex(val.value),
						blxrHex(val.input),
						blxrHex(val.v),
						blxrHex(val.r),
						blxrHex(val.s)
					])
				} else {
					const tx = { ...val, data: val.input, gasLimit: val.gas } as any
					const eip = EIP[tx.type as keyof typeof EIP]
					if (eip) {
						txs.push(eip.fromTxData(tx, { common }).serialize())
					}
				}
			}
			this.events.emit('block', [[header, txs, [], []], 0, []])
		}
	}
}
