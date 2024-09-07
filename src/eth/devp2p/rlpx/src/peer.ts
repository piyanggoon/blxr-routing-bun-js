import * as snappy from 'snappyjs'
import { EventEmitter } from 'node:events'
import { bytesToUtf8, equalsBytes, hexToBytes, utf8ToBytes } from 'ethereum-cryptography/utils'
import { ECIES } from './ecies'
import { bytesToInt, concatBytes, intToBytes } from '~/eth/utils'
import { DISCONNECT_REASON } from '~/eth/devp2p/types'
import { RLP } from '~/eth/rlp'

import type { Socket } from 'bun'
import type { Capabilities, PeerOptions, SocketData } from '~/eth/devp2p/types'
import type { Protocol } from '../../protocol/src/protocol'

enum PREFIXES {
	HELLO = 0x00,
	DISCONNECT = 0x01,
	PING = 0x02,
	PONG = 0x03
}

type HelloMsg = {
	0: Uint8Array
	1: Uint8Array
	2: Uint8Array[][]
	3: Uint8Array
	4: Uint8Array
	length: 5
}

interface ProtocolDescriptor {
	protocol: Protocol
	offset: number
	length?: number
}

interface Hello {
	id: Uint8Array
	clientId: string
	protocolVersion: number
	capabilities: Capabilities[]
	port: number
}

const BASE_PROTOCOL_VERSION = 5
const BASE_PROTOCOL_LENGTH = 16
const PING_INTERVAL = 15000 // 15 sec

export class Peer {
	public events: EventEmitter
	public readonly id: Uint8Array
	public readonly clientId: Uint8Array

	protected _closed: boolean
	protected _connected: boolean
	protected _disconnectReason?: DISCONNECT_REASON
	protected _disconnectWe: null | boolean

	protected _port: number
	protected _socket: Socket<SocketData>
	protected _socketData: Uint8Array
	protected _remoteId: Uint8Array | null
	protected _remoteName: string | null
	protected _capabilities: Capabilities[]
	protected _EIP8: Uint8Array | boolean
	protected _eciesSession: ECIES

	protected _pingTimeout: number
	protected _pingTimeoutId: Timer | null
	protected _pingIntervalId: Timer | null

	protected _state: string
	protected _weHello: HelloMsg | null
	protected _hello: Hello | null
	protected _nextPacketSize: number

	_protocols: ProtocolDescriptor[]

	constructor(options: PeerOptions) {
		this.events = new EventEmitter()
		this.id = options.id
		this.clientId = options.clientId

		this._closed = false
		this._connected = false
		this._disconnectWe = null

		this._port = options.port
		this._socket = options.socket
		this._socketData = new Uint8Array()
		this._remoteId = options.remoteId
		this._remoteName = null
		this._capabilities = options.capabilities
		this._EIP8 = options.EIP8 ? true : false
		this._eciesSession = new ECIES(options.privateKey, this.id, this._remoteId)

		this._pingTimeout = options.timeout
		this._pingTimeoutId = null
		this._pingIntervalId = null

		this._state = 'Auth'
		this._weHello = null
		this._hello = null
		this._nextPacketSize = 307

		this._protocols = []

		this.events.on('socket:data', this._onSocketData.bind(this))
		this.events.on('socket:close', this._onSocketClose.bind(this))
	}

	getId() {
		return this._remoteId
	}

	getName() {
		return this._remoteName
	}

	getDisconnectPrefix(code: DISCONNECT_REASON): string {
		return DISCONNECT_REASON[code]
	}

	_sendAck() {
		if (this._closed) return
		if (this._eciesSession['_gotEIP8Auth']) {
			const ackEIP8 = this._eciesSession.createAckEIP8()
			if (!ackEIP8) return
			this._socket.write(ackEIP8)
		} else {
			const ackOld = this._eciesSession.createAckOld()
			if (!ackOld) return
			this._socket.write(ackOld)
		}

		this._state = 'Header'
		this._nextPacketSize = 32
		this._sendHello()
	}

	_handleAuth() {
		const bytesCount = this._nextPacketSize
		const parseData = this._socketData.subarray(0, bytesCount)
		if (!this._eciesSession['_gotEIP8Auth']) {
			if (parseData.subarray(0, 1) === hexToBytes('0x04')) {
				this._eciesSession.parseAuthPlain(parseData)
			} else {
				this._eciesSession['_gotEIP8Auth'] = true
				this._nextPacketSize = bytesToInt(this._socketData.subarray(0, 2)) + 2
				return
			}
		} else {
			this._eciesSession.parseAuthEIP8(parseData)
		}
		this._state = 'Header'
		this._nextPacketSize = 32
		process.nextTick(() => this._sendAck())
		this._socketData = this._socketData.subarray(bytesCount)
	}

	_handleHeader() {
		const bytesCount = this._nextPacketSize
		const parseData = this._socketData.subarray(0, bytesCount)

		const size = this._eciesSession.parseHeader(parseData)
		if (size === undefined) return

		this._state = 'Body'
		this._nextPacketSize = size + 16
		if (size % 16 > 0) this._nextPacketSize += 16 - (size % 16)
		this._socketData = this._socketData.subarray(bytesCount)
	}

	_handleBody() {
		const bytesCount = this._nextPacketSize
		const parseData = this._socketData.subarray(0, bytesCount)
		const body = this._eciesSession.parseBody(parseData)
		if (!body) return

		this._state = 'Header'
		this._nextPacketSize = 32

		let code = body[0]
		if (code === 0x80) code = 0
		if (code !== PREFIXES.HELLO && code !== PREFIXES.DISCONNECT && this._hello === null) {
			return this.disconnect(DISCONNECT_REASON.PROTOCOL_ERROR)
		}

		const protocolObj = this._getProtocol(code)
		if (protocolObj === undefined) return this.disconnect(DISCONNECT_REASON.PROTOCOL_ERROR)

		const msgCode = code - protocolObj.offset
		const protocolName = protocolObj.protocol.constructor.name
		try {
			let payload: any = body.subarray(1)
			let compressed = false
			const origPayload = payload
			if (this._hello !== null && this._hello.protocolVersion >= 5) {
				payload = snappy.uncompress(payload)
				compressed = true
			}
			if (protocolName === 'Peer') {
				try {
					payload = RLP.decode(payload)
				} catch (e: any) {
					if (msgCode === PREFIXES.DISCONNECT) {
						if (compressed) {
							payload = RLP.decode(origPayload)
						} else {
							payload = RLP.decode(snappy.uncompress(payload))
						}
					} else {
						throw new Error(e)
					}
				}
			}
			protocolObj.protocol._handleMessage?.(msgCode, payload)
		} catch (err) {
			this.disconnect(DISCONNECT_REASON.SUBPROTOCOL_ERROR)
			this.events.emit('error', err)
		}
		this._socketData = this._socketData.subarray(bytesCount)
	}

	_handleHello(payload: any) {
		this._hello = {
			id: payload[4],
			clientId: bytesToUtf8(payload[1]),
			protocolVersion: bytesToInt(payload[0]),
			capabilities: payload[2].map((item: any) => {
				return {
					name: bytesToUtf8(item[0]),
					version: bytesToInt(item[1])
				}
			}),
			port: bytesToInt(payload[3])
		}

		if (this._remoteId === null) {
			this._remoteId = this._hello.id
			this._remoteName = this._hello.clientId
		} else if (!equalsBytes(this._remoteId, this._hello.id)) {
			return this.disconnect(DISCONNECT_REASON.INVALID_IDENTITY)
		}

		const shared: { [name: string]: Capabilities } = {}
		for (const item of this._hello.capabilities) {
			for (const c of this._capabilities) {
				if (c.name !== item.name || c.version !== item.version) continue
				if (shared[c.name] !== undefined && shared[c.name].version > c.version) continue
				shared[c.name] = c
			}
		}

		let offset = BASE_PROTOCOL_LENGTH
		this._protocols = Object.keys(shared)
			.map((key) => shared[key])
			.sort((obj1, obj2) => (obj1.name < obj2.name ? -1 : 1))
			.map((obj) => {
				const _offset = offset
				offset += obj.length

				const sendMethod = (code: number, data: Uint8Array) => {
					if (code > obj.length) throw new Error('Code out of range')
					this._sendMessage(_offset + code, data)
				}

				const SubProtocol = obj.constructor
				const protocol = new SubProtocol(this, sendMethod, obj.version)
				return {
					protocol,
					offset: _offset,
					length: obj.length
				}
			})

		if (this._protocols.length === 0) {
			return this.disconnect(DISCONNECT_REASON.USELESS_PEER)
		}

		this._connected = true
		this._pingIntervalId = setInterval(() => this._sendPing(), PING_INTERVAL)
		if (this._weHello) {
			this.events.emit('connect')
		}
	}

	_handleDisconnect(payload: any) {
		this._closed = true
		this._disconnectReason =
			payload instanceof Uint8Array ? bytesToInt(payload) : bytesToInt(payload[0] ?? Uint8Array.from([0]))
		this._disconnectWe = false
		this._socket.end()
	}

	_handleMessage(code: PREFIXES, msg: Uint8Array) {
		switch (code) {
			case PREFIXES.HELLO:
				this._handleHello(msg)
				break
			case PREFIXES.DISCONNECT:
				this._handleDisconnect(msg)
				break
			case PREFIXES.PING:
				this._sendPong()
				break
			case PREFIXES.PONG:
				if (this._pingTimeoutId) {
					clearTimeout(this._pingTimeoutId)
				}
				break
		}
	}

	_sendMessage(code: number, data: Uint8Array) {
		if (this._closed) return false
		const msg = concatBytes(RLP.encode(code), data)
		const header = this._eciesSession.createBlockHeader(msg.length)
		if (!header || this._socket.data.closed) return
		this._socket.write(header)

		const body = this._eciesSession.createBody(msg)
		if (!body || this._socket.data.closed) return
		this._socket.write(body)
		return true
	}

	_sendDisconnect(reason: DISCONNECT_REASON) {
		const data = RLP.encode(reason)
		if (this._sendMessage(PREFIXES.DISCONNECT, data) !== true) return
		this._disconnectReason = reason
		this._disconnectWe = true
		this._closed = true
		setTimeout(() => this._socket.end(), 2000) // 2 sec * 1000
	}

	_sendHello() {
		const payload: HelloMsg = [
			intToBytes(BASE_PROTOCOL_VERSION),
			this.clientId,
			this._capabilities?.map((c) => [utf8ToBytes(c.name), intToBytes(c.version)]) || [],
			this._port === null ? new Uint8Array(0) : intToBytes(this._port),
			this.id
		]
		if (!this._closed) {
			if (this._sendMessage(PREFIXES.HELLO, RLP.encode(payload as never as Uint8Array[])) === true) {
				this._weHello = payload
			}
		}
	}

	_sendPing() {
		let data = RLP.encode([])
		if (this._hello !== null && this._hello.protocolVersion >= 5) {
			data = snappy.compress(data)
		}
		if (this._sendMessage(PREFIXES.PING, data) !== true) return

		if (this._pingTimeoutId) clearTimeout(this._pingTimeoutId)
		this._pingTimeoutId = setTimeout(() => {
			this.disconnect(DISCONNECT_REASON.TIMEOUT)
		}, this._pingTimeout)
	}

	_sendPong() {
		let data = RLP.encode([])
		if (this._hello !== null && this._hello.protocolVersion >= 5) {
			data = snappy.compress(data)
		}
		this._sendMessage(PREFIXES.PONG, data)
	}

	_getProtocol(code: number): ProtocolDescriptor | undefined {
		if (code < BASE_PROTOCOL_LENGTH)
			return {
				protocol: this as unknown as Protocol,
				offset: 0
			}
		for (const obj of this._protocols) {
			if (code >= obj.offset && code < obj.offset + obj.length!) return obj
		}
	}

	_onSocketData(data: Buffer) {
		if (this._closed) return
		this._socketData = concatBytes(this._socketData, data)
		try {
			while (this._socketData.length >= this._nextPacketSize) {
				switch (this._state) {
					case 'Auth':
						this._handleAuth()
						break
					case 'Header':
						this._handleHeader()
						break
					case 'Body':
						this._handleBody()
						break
				}
			}
		} catch {
			// empty
		}
	}

	_onSocketClose() {
		this._closed = true
		if (this._pingIntervalId) clearInterval(this._pingIntervalId)
		if (this._pingTimeoutId) clearTimeout(this._pingTimeoutId)
		if (this._connected) {
			this.events.emit('close', this._disconnectReason, this._disconnectWe)
		}
	}

	disconnect(reason: DISCONNECT_REASON = DISCONNECT_REASON.DISCONNECT_REQUESTED) {
		this._sendDisconnect(reason)
	}
}
