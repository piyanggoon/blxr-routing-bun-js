import { platform, arch } from 'os'
import { EventEmitter } from 'node:events'
import { Peer } from './peer'
import { pk2id } from '~/eth/devp2p/utils'
import { secp256k1 } from 'ethereum-cryptography/secp256k1'
import { bytesToHex, bytesToUtf8, utf8ToBytes } from 'ethereum-cryptography/utils'

import type { Capabilities, RLPxOptions, SocketData } from '~/eth/devp2p/types'
import type { Socket, TCPSocketListener } from 'bun'

export class RLPx {
	public events: EventEmitter
	public readonly id: Uint8Array
	public readonly clientId: Uint8Array

	protected _server: TCPSocketListener | null
	protected _listenHost: string
	protected _listenPort: number
	protected _capabilities: Capabilities[]
	protected _privateKey: Uint8Array

	constructor(privateKey: Uint8Array, options: RLPxOptions) {
		const self = this

		this.events = new EventEmitter()
		this._privateKey = privateKey
		this.id = pk2id(secp256k1.getPublicKey(this._privateKey, false))
		this.clientId = utf8ToBytes(`blxr-routing/${platform()}-${arch()}/bun-js`)
		this._capabilities = options.capabilities

		this._listenHost = options.listenHost
		this._listenPort = options.listenPort
		this._server = Bun.listen<SocketData>({
			hostname: options.listenHost,
			port: options.listenPort,
			socket: {
				open(socket) {
					self._onConnect(socket, null)
				},
				close(socket) {
					socket.data.peer.events.emit('socket:close')
					socket.data.closed = true
				},
				data(socket, data) {
					socket.data.peer.events.emit('socket:data', data)
				},
			},
		})
	}

	getEnode() {
		return `enode://${bytesToHex(this.id)}@${this._listenHost}:${this._listenPort}`
	}

	getClientID() {
		return bytesToUtf8(this.clientId)
	}

	_onConnect(socket: Socket<SocketData>, peerId: Uint8Array | null) {
		const peer: Peer = new Peer({
			socket,
			port: this._listenPort,
			id: this.id,
			clientId: this.clientId,
			remoteId: peerId,
			privateKey: this._privateKey,
			capabilities: this._capabilities,
			timeout: 10000, // 10 sec
		})
		socket.data = { closed: false, peer }

		peer.events.on('error', (err) => {
			this.events.emit('peer:error', peer, err)
		})

		peer.events.once('connect', () => {
			const id = peer.getId()
			if (id) {
				this.events.emit('peer:connect', peer)
			}
		})

		peer.events.once('close', (reason, disconnectWe) => {
			const id = peer.getId()
			if (id) {
				this.events.emit('peer:close', peer, reason, disconnectWe)
			}
		})
	}
}
