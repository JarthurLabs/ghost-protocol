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

## September 5 follow-up: failure located, replacement prepared

Diagnostic version 4 returned HTTP 200 for an internal runtime check: WebSocketPair is available, and the native upgrade response has status 101 and an attached socket. The actual browser upgrade still returned HTTP 500. The matching production log confirms status 101 and hasSocket true immediately before our handler returns. This narrows the failure to the subsequent hosted handoff. The exact platform exception is unavailable. [Sanitized diagnostic receipt](evidence/sites-websocket-diagnostic.json). Production is restored to the original version 1; diagnostic routes are not live.

A separate persistent Node option now sends commands and snapshots over one authenticated, ordered WebSocket. It preserves the approved local HTTP mode and the unchanged game engine. Its local browser check completed all five missions, actual capture and retry, Vault lockdown with Transit retained, the defender finale and earned progress after reload. The direction-acknowledgement median was 11.9 milliseconds across 91 commands, with a 15.3-millisecond ninety-fifth percentile. These are local measurements, not a claim about an internet host.

The proposed Render deployment is prepared in render.yaml. No Render account or resource has been created, and no charge has been authorized. It uses one persistent instance; active attempts are in memory and reset on a process restart. Completed mission progress remains in browser storage. The server limits live connections to 32 and retained sessions to 256; these are safety caps, not a verified player-capacity claim. [Deployment details and approval boundary](REALTIME_REPAIR.md).
