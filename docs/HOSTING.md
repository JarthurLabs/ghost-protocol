# Browser release status

The deployment at https://ghost-protocol.jamalarthur1.chatgpt.site is public with Nicholas’s explicit approval. It serves the approved game and a separate Worker adapter around the same server engine. Page loading, session creation, isolation, introduction, practice, pause and restart have been verified. It is not yet an accepted online gameplay release.

## What the playthrough found

The first public control-driven run measured a median of301 milliseconds for title-state reads,545 milliseconds for playing-state reads, and549 milliseconds for commands. Direction-key acknowledgment had a median of1,075 milliseconds including513 milliseconds queued behind another request. The player moves one tile every180 milliseconds. This produces a meaningful steering delay.

The automated route was caught before completing Mission One, with zero mission wins. That is evidence of a failed route under measured latency; it does not prove that every human would lose. The successful local campaign and approved game are preserved.

D1 stores a private state per cryptographically random, secure session cookie. Updates use a revision comparison to avoid lost concurrent writes. No client actor identity, grant, position or outcome is trusted. The public snapshot excludes private engine internals. The current session cap applies to retained sessions over six hours, not concurrent players. This is a finite portfolio game, not a tested high-traffic service.

## Connection investigation

A bounded WebSocket echo probe was deployed before attempting a transport rewrite. The canonical Worker upgrade currently produces a Sites-branded HTTP500 platform-error page, including in a clean browser. Worker logs show the correct host, path and Origin reaching the handler. The same HTTP500 result occurred in ordinary headed Chrome and headless Chrome. No speculative WebSocket game implementation has replaced the verified engine. The current platform behavior blocks the proposed live transport.

[The official Sites guide](https://learn.chatgpt.com/docs/sites#understand-limits-and-unsupported-uses) lists WebSockets as supported. [Cloudflare’s canonical Worker example](https://developers.cloudflare.com/workers/examples/websockets/) uses WebSocketPair and a status101 response. The observed deployment result needs to be reconciled with those documented capabilities before this transport can be used.

The game itself adds no analytics. Sites records platform traffic and operational logs, as described in [the Sites guide](https://learn.chatgpt.com/docs/sites#review-site-analytics).

The local Node server and source remain independent of hosting. Use the README's local setup for the approved experience while the hosted connection is being repaired.
