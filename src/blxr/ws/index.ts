import { env } from 'bun'
import { EventEmitter } from 'node:events'
import { WebSocket } from 'ws'
import { blxrHex } from './utils'
import { intToBytes } from '~/eth/utils'
import { Common, Hardfork } from '@ethereumjs/common'
import { loadKZG } from 'kzg-wasm'
import * as TX from '@ethereumjs/tx'

import type { Block } from './types'

const EIP = {
	'0x1': TX.AccessListEIP2930Transaction,
	'0x2': TX.FeeMarketEIP1559Transaction,
	'0x3': TX.BlobEIP4844Transaction
}
const TYPES = ['0x0', '0x1', '0x2', '0x3']
const common = Common.custom({ chainId: 56 }, { hardfork: Hardfork.Cancun, customCrypto: { kzg: await loadKZG() } })

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

	async handleMessage(msg: any) {
		const json = JSON.parse(msg)
		if (json.params && json.params.result) {
			const { header, transactions } = json.params.result as Block
			if (header.blobGasUsed !== '0x0') return

			const headers = [
				blxrHex(header.parentHash),
				blxrHex(header.sha3Uncles),
				blxrHex(header.miner),
				blxrHex(header.stateRoot),
				blxrHex(header.transactionsRoot),
				blxrHex(header.receiptsRoot),
				blxrHex(header.logsBloom),
				blxrHex(header.difficulty),
				blxrHex(header.number),
				blxrHex(header.gasLimit),
				blxrHex(header.gasUsed),
				blxrHex(header.timestamp),
				blxrHex(header.extraData),
				blxrHex(header.mixHash),
				blxrHex(header.nonce),
				header.baseFeePerGas > 0 ? intToBytes(header.baseFeePerGas) : new Uint8Array(0),
				blxrHex(header.withdrawalsRoot),
				blxrHex(header.blobGasUsed),
				blxrHex(header.excessBlobGas)
			]

			const txs = await Promise.all(
				transactions
					.filter((v) => TYPES.includes(v.type))
					.map((v) => {
						if (v.type === '0x0') {
							return Promise.resolve([
								blxrHex(v.nonce),
								blxrHex(v.gasPrice),
								blxrHex(v.gas),
								blxrHex(v.to),
								blxrHex(v.value),
								blxrHex(v.input),
								blxrHex(v.v),
								blxrHex(v.r),
								blxrHex(v.s)
							])
						} else {
							const tx = { ...v, data: v.input, gasLimit: v.gas } as any
							const eip = EIP[tx.type as keyof typeof EIP]
							return Promise.resolve(eip.fromTxData(tx, { common }).serialize())
						}
					})
			)

			this.events.emit('block', [[headers, txs, [], []], 0, []])
		}
	}
}
