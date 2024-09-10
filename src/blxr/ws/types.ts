interface BlockHeader {
	parentHash: string
	sha3Uncles: string
	miner: string
	stateRoot: string
	transactionsRoot: string
	receiptsRoot: string
	logsBloom: string
	difficulty: string
	number: string
	gasLimit: string
	gasUsed: string
	timestamp: string
	extraData: string
	mixHash: string
	nonce: string
	baseFeePerGas: number
	withdrawalsRoot: string
	blobGasUsed: string
	excessBlobGas: string
}

interface Transaction {
	accessList: {
		address: string
		storageKeys: string[]
	}[]
	blobVersionedHashes: string[]
	chainId: string
	from: string
	gas: string
	gasPrice: string
	hash: string
	input: string
	maxFeePerBlobGas: string
	maxFeePerGas: string
	maxPriorityFeePerGas: string
	nonce: string
	r: string
	s: string
	to: string
	type: string
	v: string
	value: string
	yParity: string
}

interface Withdrawal {
	index: string
	validatorIndex: string
	address: string
	amount: string
}

export interface Block {
	hash: string
	header: BlockHeader
	transactions: Transaction[]
	withdrawals: Withdrawal[]
}
