# Hosting status

The accepted playable host is the [free Render game](https://ghost-protocol-b74p.onrender.com), running one persistent Node server in Singapore with automatic deployment off. Its current source is [ea3382b](https://github.com/JarthurLabs/ghost-protocol/commit/ea3382bed3e7cac6a341bbc2ccb5d54207442f62), deployed successfully as `dep-daegh9ad0e5s738dpqq0` on September 6, 2026.

Nicholas's selected **Neon Run** music is live. A real browser verified the new production bundle and exact music-file hash, heard the track through a measured audio stream, moved the drone with the keyboard, collected the Vault key with its original effect, and resumed the music. No browser errors occurred. The same revision passed all five missions locally. [Public revision receipt and screenshot](../captures/neon-run-review/public/public-smoke.json), [music and film verification](../captures/release/VERIFICATION.md).

The performance and cold-start measurements below belong to the earlier [fa78de9 release](https://github.com/JarthurLabs/ghost-protocol/commit/fa78de9eb633e1149347f23ea5d841d93f3f4f8d). That release passed the full public campaign, capture and retry, practices, defender finale and three reload checks. Those measurements have not been repeated for the music-only revision.

The [Sites address printed in the film](https://ghost-protocol.jamalarthur1.chatgpt.site) now returns a verified HTTP 302 redirect to [the Render game](https://ghost-protocol-b74p.onrender.com/). The coordinating release agent verified Sites version 5, deployment `appgdep_6a9d046397408191a9c0efb6575d8b94`. This redirect supersedes the older game preview at that address.

## Recorded Render verification — September 6, 2026

On September 6, 2026, this Mac-to-Singapore test measured direction acknowledgement at 37.1 milliseconds median and 42.1 milliseconds at the ninety-fifth percentile across 91 inputs. Rendering measured 60 frames per second at 1920 by 1080. These are a single route and machine, not a worldwide performance or concurrent-player guarantee. [Actual screenshots and compact gameplay receipt](../captures/render-free-review/VERIFICATION.md).

The first trial exposed a reload conflict while the prior controller remained briefly connected. The repair waits for ownership to release. Three real reloads preserved the attempt in paused state, accepted Resume and Pause, and preserved completed progress. The second-controller restriction remained in place. All 96 tests and the production build passed for that release.

After more than eighteen minutes with all known connections closed, the first usable title and connection arrived in 24.85 seconds; the first real input was acknowledged at 25.29 seconds. Immediate warm reload was usable in 2.51 seconds. The wake-up page, automatic successful navigation and new process-start logs were recorded. Completed campaign progress survived; the unfinished attempt reset. One expected provider HTTP 503 wake-up response occurred, followed by zero game-runtime errors. [Render's free-service guidance](https://render.com/docs/free), checked for the trial, described a 15-minute idle threshold and about a minute to wake. This observed visit was faster, but future waits can differ. No paid plan or payment method was added for the trial.

The Node server keeps active attempts in memory, so a process restart resets them. Completed progress remains in the same browser and play address. The server limits live connections to 32 and retained sessions to 256; these are safeguards, not demonstrated player capacity. The game adds no analytics tracking; hosting providers record their own traffic and operational logs. [Deployment and connection details](REALTIME_REPAIR.md).

## Earlier hosting evidence

The sections below describe the September 5 Sites experiment and the preparation of its replacement. They preserve the measured failure and investigation; the current play address and redirect are described above.

### September 5: original Sites playthrough

Nicholas explicitly approved public access to the original Sites deployment. It served the game through a Worker adapter around the same engine, with session state in D1. Page loading, session creation, isolation, introduction, practice, pause and restart were verified. The playthrough then failed its responsiveness check.

The first public control-driven run measured a median of 301 milliseconds for title-state reads, 545 milliseconds for playing-state reads, and 549 milliseconds for commands. Direction-key acknowledgement had a median of 1,075 milliseconds, including 513 milliseconds queued behind another request. A player tile took 180 milliseconds, so that connection introduced meaningful steering delay.

The automated route was caught before completing Mission One, with zero mission wins. That is evidence of a failed route under measured latency; it does not prove that every human would lose. The successful local campaign and approved game are preserved.

The adapter stored private state in D1 under a cryptographically random, secure session cookie. Updates used a revision comparison to avoid lost concurrent writes. It did not trust a client-supplied actor identity, grant, position or outcome, and its public snapshot excluded private engine internals. Its session cap applied to retained sessions over six hours rather than concurrent players. These database details describe that earlier adapter, not the Render runtime.

### September 5: connection investigation

A bounded WebSocket echo probe was deployed before attempting a transport rewrite. The canonical Worker upgrade returned a Sites-branded HTTP 500 platform-error page, including in a clean browser. Worker logs showed the correct host, path and Origin reaching the handler. The same result occurred in ordinary headed Chrome and headless Chrome. That observed behavior blocked the proposed Sites transport at the time; a speculative WebSocket game implementation was not deployed there.

[The official Sites guide](https://learn.chatgpt.com/docs/sites#understand-limits-and-unsupported-uses) listed WebSockets as supported when checked, and [Cloudflare's canonical Worker example](https://developers.cloudflare.com/workers/examples/websockets/) used WebSocketPair and a status-101 response. The diagnostic was designed to compare that documented behavior with the actual deployment. It did not establish a permanent platform limitation.

The game itself added no analytics. Sites platform traffic and operational logs were documented in [the Sites guide](https://learn.chatgpt.com/docs/sites#review-site-analytics).

The approved local Node game remained available throughout the investigation. Its engine and artwork were preserved while the online connection was repaired.

### September 5 follow-up: failure located, replacement prepared

Diagnostic version 4 returned HTTP 200 for an internal runtime check: WebSocketPair was available, and the native upgrade response had status 101 and an attached socket. The actual browser upgrade still returned HTTP 500. The matching production log confirmed status 101 and hasSocket true immediately before the handler returned. This narrowed the failure to the subsequent hosted handoff; the exact platform exception was unavailable. [Sanitized diagnostic receipt](evidence/sites-websocket-diagnostic.json).

At that checkpoint, the Sites deployment was restored to the original version 1 and the diagnostic routes were removed from service. That historical restoration was later superseded by the verified version-5 redirect recorded at the top of this document.

A separate persistent Node option was then implemented to send commands and snapshots over one authenticated, ordered WebSocket. It preserved the approved local HTTP mode and the unchanged game engine. Its local browser check completed all five missions, actual capture and retry, Vault lockdown with Transit retained, the defender finale and earned progress after reload. The direction-acknowledgement median was 11.9 milliseconds across 91 commands, with a 15.3-millisecond ninety-fifth percentile. Those were local measurements.

That replacement was subsequently deployed on the approved free Render plan and verified over the internet. Its recorded public results appear above.
