# Browser responsiveness repair

The public preview waits for a D1 read and write for each running-state update. The client queues steering behind those requests. Measured direction acknowledgement is about one second, while a tile takes 180 milliseconds. This is not an accepted online release.

The September 5 connection diagnostic now proves that the deployed Worker constructs a native status-101 response with its WebSocket attached. The browser still receives a Sites-branded HTTP 500. The failure is after the game constructs its response; the exact outer-platform exception is not available. Diagnostic version 4 is saved. Production has been restored to the previous adapter.

## Persistent connection implementation

Run the existing Node engine on one persistent server, with one authenticated WebSocket per game session. Commands and snapshots share that ordered connection. The server continues to own positions, elapsed time, keys, authorization decisions and outcomes. No D1 query sits between a keypress and its acknowledgement. Keep the approved local HTTP mode and artwork intact.

Use the existing independent 50-millisecond engine clock. Push snapshots while playing and after commands. Reject cross-origin sockets, missing sessions, duplicate command numbers, forged game state and a second controller. Pause on disconnect or missing heartbeat. Do not replay commands automatically after uncertain delivery. A server restart ends an unfinished attempt; completed campaign progress remains in the browser. Use a single instance until shared session ownership is implemented.

Validation: real socket tests for identity, isolation, ordering, independent enemies, disconnect and pause; full existing suite and production build; five-mission browser playthrough using only real inputs and observed connection messages. The authorized free deployment has now passed warm public gameplay; the real idle-start test is recorded below.

Nicholas authorized testing Render's free option on September 6, 2026. Paid compute, subscriptions and paid upgrades are not authorized. No LinkedIn post is part of this hosting trial.

## Authorized free hosting trial

Use a public Render Node Web Service in Singapore, with one explicitly selected `free` instance, automatic deployment disabled, Node 24.19.0 and the existing health endpoint. `render.yaml` selects the free plan; do not omit the plan because Render defaults new web services to paid compute. Connect only this private GitHub repository. The cloud entrypoint validates the exact public HTTPS origin and binds only in the provisioned host to its required port. Normal local startup remains restricted to loopback.

Free compute supplies 0.1 CPU and 512 MB RAM. The service sleeps after 15 minutes without inbound traffic and takes about one minute to wake; incoming WebSocket messages count as activity. This documented startup delay is distinct from unmeasured gameplay latency on the free host. Free service hours and bandwidth are limited, and Render may restart the process. An unfinished attempt is lost on restart; completed progress remains in the same browser. Keep the trial without a payment method; if the account requires billing details, stop for Nicholas. With no payment method, exhausting outbound bandwidth suspends free services rather than billing overages. Sources checked September 6, 2026: [Blueprint settings](https://render.com/docs/blueprint-spec), [free service behavior](https://render.com/docs/free), [WebSocket support](https://render.com/docs/websocket).

After the account connection is ready, deploy the single free service and record its actual public URL, selected plan and source revision. Run the full campaign with real controls; report direction acknowledgement median and 95th percentile, independent patrols, gate controls, terminal results and browser errors. Observe gameplay at normal display size.

For a genuine cold visit, close every game tab and socket, stop all polling, then allow at least 18 minutes without requests. Do not warm the health endpoint before the measurement. Time the first navigation through Render's loading page to a usable title screen, connection and first accepted input. Immediately repeat for a warm visit. Verify that completed browser progress survives the sleep/wake cycle and that an interrupted attempt recovers without replaying commands. Do not use scheduled pings to prevent the free service from sleeping.

Keep the existing Sites preview unchanged during the trial. Decide whether to redirect its play link only after real public verification; the video's printed play address can remain useful. No paid resource or LinkedIn post is authorized by this trial.

## Deployed free trial

The Render GitHub connection and official CLI login succeeded after Nicholas completed the phone-side approvals. Service srv-dae5jiu1egvs73b2fqg0 is live at https://ghost-protocol-b74p.onrender.com. The readback confirms free, one Singapore instance, automatic deploy off and no previews. Render rejected the paid-only maxShutdownDelaySeconds field before creating a resource; removing that optional override made the Blueprint valid. No plan upgrade was made.

Deployment dep-dae5r6u1egvs73b33m1g runs GitHub source fa78de9eb633e1149347f23ea5d841d93f3f4f8d. The first public full run completed the campaign but caught a reload HTTP 409. The repair exposes same-origin controller availability and waits for the prior socket to release ownership before opening a replacement. A genuine competing controller still fails after the normal bounded startup window. Real socket tests cover release, heartbeat expiry, cancellation and an active competing controller. All 96 tests pass.

The corrected public build completed all five missions and three fresh-socket reloads without errors. It measured 37.1ms median direction acknowledgement and 42.1ms p95 across 91 inputs. Full evidence: captures/render-free-review/VERIFICATION.md. The subsequent idle-start check passed: after more than eighteen minutes idle, the usable game arrived in24.85s and first input ack in25.29s. Warm reload:2.51s ready. Render displayed SERVICE WAKING UP and logs show a fresh process start. Completed progress survived exactly; the unfinished attempt reset. One expected provider503 startup response and zero game-runtime errors. These are one-visit measurements, not a guaranteed startup bound.
