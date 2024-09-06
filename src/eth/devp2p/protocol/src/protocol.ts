import { EventEmitter } from 'events'
import { DISCONNECT_REASON } from '../../types'

import type { Peer } from '../../rlpx'
import type { SendMethod } from '../../types'

type MessageCodes = { [key: number | string]: number | string }

export abstract class Protocol {
	public events: EventEmitter
	protected _peer: Peer
	protected _send: SendMethod
	protected _version: number
	protected _messageCodes: MessageCodes
	protected _statusTimeoutId?: Timer

	constructor(peer: Peer, send: SendMethod, version: number, messageCodes: MessageCodes) {
		this.events = new EventEmitter()
		this._peer = peer
		this._send = send
		this._version = version
		this._messageCodes = messageCodes
		this._statusTimeoutId = setTimeout(() => {
			this._peer.disconnect(DISCONNECT_REASON.TIMEOUT)
		}, 5000) // 5 sec
	}

	abstract _handleMessage(code: number, data: Uint8Array): void
}
