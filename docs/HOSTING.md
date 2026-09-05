# Free hosting trial

The [free Render build](https://ghost-protocol-b74p.onrender.com) now completes the five-mission campaign, capture and retry, all learning practices, the defender finale, and three reload/reconnect checks with zero browser errors. Public source revision: fa78de9eb633e1149347f23ea5d841d93f3f4f8d. The selected service is one free instance in Singapore, with automatic deploy off.

On September 6, 2026, this Mac-to-Singapore test measured direction acknowledgement at 37.1 milliseconds median and 42.1 milliseconds at the ninety-fifth percentile across 91 inputs. Rendering measured 60 frames per second at 1920 by 1080. These are a single route and machine, not a worldwide performance or concurrent-player guarantee. [Actual screenshots and compact gameplay receipt](../captures/render-free-review/VERIFICATION.md).

The first trial exposed a reload conflict while the prior controller remained briefly connected. The client now waits for ownership to release. Three real reloads preserved the attempt in paused state, accepted Resume and Pause, and preserved completed progress. The second-controller restriction remains in place. All 96 tests and the production build pass.

After more than eighteen minutes with all known connections closed, the first usable title and connection arrived in 24.85 seconds; the first real input was acknowledged at 25.29 seconds. Immediate warm reload was usable in 2.51 seconds. The wake-up page, automatic successful navigation and new process-start logs were recorded. Completed campaign progress survived; the unfinished attempt reset. One expected provider HTTP 503 wake-up response occurred, followed by zero game-runtime errors. [Render documents](https://render.com/docs/free) a 15-minute idle threshold and about a minute to wake; this observed visit was faster, but future waits can differ. The original Sites URL stays unchanged during this evaluation. No paid plan, payment method or LinkedIn post was added.

## Earlier hosting evidence

The deployment at https://ghost-protocol.jamalarthur1.chatgpt.site is public with Nicholas’s explicit approval. It serves the approved game and a separate Worker adapter around the same server engine. Page loading, session creation, isolation, introduction, practice, pause and restart have been verified. It is not yet an accepted online gameplay release.

## Original Sites playthrough

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

That replacement was subsequently deployed on the explicitly approved free plan. Current results are at the top of this document. It uses one persistent instance; active attempts are in memory and reset on a process restart. Completed mission progress remains in browser storage. The server limits live connections to 32 and retained sessions to 256; these are safety caps, not a verified player-capacity claim. [Deployment details and approval boundary](REALTIME_REPAIR.md).
