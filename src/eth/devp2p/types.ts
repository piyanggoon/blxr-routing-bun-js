import type { Socket } from 'bun'
import type { Peer } from './rlpx'
import type { Protocol } from './protocol'

interface ProtocolConstructor {
	new (...args: any[]): Protocol
}

export interface SocketData {
	closed: boolean
	peer: Peer
}

export enum DISCONNECT_REASON {
	DISCONNECT_REQUESTED = 0x00,
	NETWORK_ERROR = 0x01,
	PROTOCOL_ERROR = 0x02,
	USELESS_PEER = 0x03,
	TOO_MANY_PEERS = 0x04,
	ALREADY_CONNECTED = 0x05,
	INCOMPATIBLE_VERSION = 0x06,
	INVALID_IDENTITY = 0x07,
	CLIENT_QUITTING = 0x08,
	UNEXPECTED_IDENTITY = 0x09,
	SAME_IDENTITY = 0x0a,
	TIMEOUT = 0x0b,
	SUBPROTOCOL_ERROR = 0x10
}

export enum ProtocolType {
	ETH = 'eth'
}

export interface Capabilities {
	name: string
	version: number
	length: number
	constructor: ProtocolConstructor
}

export interface PeerOptions {
	port: number
	socket: Socket<SocketData>
	timeout: number
	id: Uint8Array
	clientId: Uint8Array
	remoteId: Uint8Array | null
	privateKey: Uint8Array
	capabilities: Capabilities[]
	EIP8?: Uint8Array | boolean
}

export interface RLPxOptions {
	listenHost: string
	listenPort: number
	capabilities: Capabilities[]
}

export type SendMethod = (code: number, data: Uint8Array) => any
