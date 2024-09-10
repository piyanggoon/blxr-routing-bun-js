# blxr-routing-bun-js

`blxr-routing-bun-js` is a Bun.js-based application designed to receive block streams via gRPC from the bloXroute network and relay them to a Geth node on the (Binance Smart Chain). The application utilizes the devp2p protocol with optimized code to minimize overhead, ensuring fast and low-latency block propagation.

# WebSocket Implementation

Due to the current version of Bun (v1.1.27) not supporting HTTP/2 for gRPC, this application uses WebSockets to subscribe to block streams from bloXroute. This temporary solution allows us to maintain functionality while waiting for full gRPC support in future Bun versions.

# References

[ethereumjs-monorepo](https://github.com/ethereumjs/ethereumjs-monorepo)