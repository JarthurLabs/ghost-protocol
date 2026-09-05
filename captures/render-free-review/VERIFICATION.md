# Free Render trial — September 6, 2026

Current scope: verify the approved game on one free Render instance. No paid plan or LinkedIn post is authorized.

The service at https://ghost-protocol-b74p.onrender.com uses the private GitHub source commit fa78de9eb633e1149347f23ea5d841d93f3f4f8d. Render deployment dep-dae5r6u1egvs73b33m1g is live. The actual service readback selects free, one Singapore instance, automatic deploy off. Build and runtime both use Node 24.19.0.

## Warm gameplay

A real keyboard and button-driven Chrome playthrough completed all five missions, capture and retry, all three practice exercises, named Vault switches, unchanged Transit grants, and all three defender policies. Saved progress records five completed missions and the defender finale. No browser errors occurred.

Ninety-one direction acknowledgements measured a median of 37.1 milliseconds and a ninety-fifth percentile of 42.1 milliseconds. The final render sample measured 60 frames per second at 1920 by 1080 and device pixel ratio one. These are measurements from this Mac to Singapore, not a player-capacity or worldwide latency claim.

Three reloads each received a new socket state, preserved the same active attempt in paused state, and acknowledged real Resume and Pause inputs. Readiness took 0.50, 2.37 and 2.38 seconds. Browser progress remained unchanged. This check replaces the old 350-millisecond local-storage-only reload assertion.

All 96 engine, authorization, HTTP and real socket tests passed. TypeScript passed. The separate production build passed with index-id2APJHB.js. The original local preview build was not overwritten. The first public run exposed a reload HTTP 409; the transport now waits for the prior controller to release ownership. The existing second-controller rejection remains in place.

Full-resolution gameplay PNGs are preserved in the local delivery folder; they are actual frames from the successful public run. The GitHub source snapshot carries the compact receipts and its existing approved release images. The normal-size Mission Four review confirms separate Vault signage, the switch on the cyan side, clear action prompts, and visible separate Transit permission. No art, maze rules, movement speed or music changed.

## Cold startup

All known game connections were closed by 18:25:13 UTC. The measurement started at 18:43:40 UTC, after more than eighteen minutes idle, without a health probe or prewarming request. Render returned its HTTP 503 loading page, with “SERVICE WAKING UP” in the document text, then automatically navigated to the game. Provider logs show a new start command at 18:43:55 and the game server ready at 18:44:00.

The title, enabled Continue button and fresh socket were ready after 24.85 seconds. The real Continue command was acknowledged after 25.29 seconds, including the ready-screenshot capture, with a 45ms command round trip. Immediate warm reload was usable in 2.51 seconds; its first command was acknowledged at 2.79 seconds with a 37.9ms round trip. The correct index-id2APJHB.js production bundle was observed in both visits.

All five completed missions and the defender result survived exactly. The unfinished paused attempt reset when the server restarted, as expected for in-memory sessions. No old commands replayed; the first command on each fresh connection was the actual Continue click. There were zero game-runtime browser errors. The one startup console error is the provider's expected HTTP 503 wake-up document, retained in the receipt rather than hidden.

This is one measured Mac-to-Singapore visit. It does not guarantee the same startup delay on every future visit. The cold-test script conservatively does not certify the platform's internal reason for a restart; the idle timing, observed wake-up page and provider start logs jointly support this observed free-host wake cycle. The initial interstitial screenshot was captured during a near-black fade; its saved DOM text and response timing are stronger evidence than that early image. The ready-after-idle PNG shows the usable game.

The free trial passes its bounded gameplay, reload and idle-start checks. A roughly twenty-five-second first visit is still meaningful friction for a LinkedIn audience. Keep the original Sites address unchanged until Nicholas evaluates the trial; the printed film address must lead to the accepted playable host before release. No paid plan, billing method or LinkedIn post was added.

Compact public-safe receipts: warm-gameplay.json and startup-summary.json. Full browser receipts, synthetic earned storage and provider logs stay under ignored .runtime directories. Full-resolution screenshots are included in the local review folder.
