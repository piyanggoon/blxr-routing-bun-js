import { hexToBytes } from 'ethereum-cryptography/utils'
import { RLPx } from './eth/devp2p/rlpx'
import { ETH } from './eth/devp2p/protocol'
import { BlxrWS } from './blxr/ws'

import type { Peer } from './eth/devp2p/rlpx'

const blxr = new BlxrWS()
const PRIVATE_KEY = hexToBytes('0xed6df2d4b7e82d105538e4a1279925a16a84e772243e80a561e1b201f2e78220')
const rlpx = new RLPx(PRIVATE_KEY, {
	listenHost: '127.0.0.1',
	listenPort: 30315,
	capabilities: [ETH.eth68]
})

rlpx.events.on('peer:connect', async (peer: Peer) => {
	console.log('peer:connect', peer.getName())
	const eth = peer.getProtocols()[0] as ETH
	blxr.events.on('block', (block) => {
		eth.sendMessage(ETH.MESSAGE_CODES.NEW_BLOCK, block)
	})
})

rlpx.events.on('peer:close', (peer: Peer, reason: string) => {
	console.log('peer:close', peer.getName(), reason)
})

rlpx.events.on('peer:error', (peer: Peer, err) => {
	console.log('peer:error', err)
})

console.log(rlpx.getEnode())
