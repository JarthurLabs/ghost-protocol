# Browser responsiveness repair

The public preview waits for a D1 read and write for each running-state update. The client queues steering behind those requests. Measured direction acknowledgement is about one second, while a tile takes 180 milliseconds. This is not an accepted online release.

The September 5 connection diagnostic now proves that the deployed Worker constructs a native status-101 response with its WebSocket attached. The browser still receives a Sites-branded HTTP 500. The failure is after the game constructs its response; the exact outer-platform exception is not available. Diagnostic version 4 is saved. Production has been restored to the previous adapter.

## Prepared replacement

Run the existing Node engine on one persistent server, with one authenticated WebSocket per game session. Commands and snapshots share that ordered connection. The server continues to own positions, elapsed time, keys, authorization decisions and outcomes. No D1 query sits between a keypress and its acknowledgement. Keep the approved local HTTP mode and artwork intact.

Use the existing independent 50-millisecond engine clock. Push snapshots while playing and after commands. Reject cross-origin sockets, missing sessions, duplicate command numbers, forged game state and a second controller. Pause on disconnect or missing heartbeat. Do not replay commands automatically after uncertain delivery. A server restart ends an unfinished attempt; completed campaign progress remains in the browser. Use a single instance until shared session ownership is implemented.

Validation: real socket tests for identity, isolation, ordering, independent enemies, disconnect and pause; full existing suite and production build; five-mission browser playthrough using only real inputs and observed connection messages. Public-host performance still requires verification after authorized deployment.

New hosting deployment and charges require Nicholas's approval. No new account, paid resource or LinkedIn post is part of this local preparation.

## Concrete hosting proposal

Use a public Render Node Web Service in Singapore, with one 0.5c-512mb instance, automatic deployment disabled, Node 24.19.0 and the existing health endpoint. The GitHub repository can stay private. The cloud entrypoint validates the exact public HTTPS origin and binds only in the provisioned host to its required port. Normal local startup remains restricted to loopback.

Current compute cost is 7 US dollars per month. The free Hobby workspace includes 5 GB of outbound traffic monthly, then charges 15 cents per additional GB; WebSocket responses count. The free compute alternative sleeps after 15 minutes unused and can take around a minute to wake, which is why the paid instance is recommended for the shared game. Sources checked September 5, 2026: [compute plans](https://render.com/docs/compute-plans), [bandwidth](https://render.com/docs/outbound-bandwidth), [free service behavior](https://render.com/docs/free), [WebSocket support](https://render.com/docs/websocket).

After Nicholas approves the provider and cost: connect only this private repository to Render, deploy the prepared single service, verify real public gameplay and latency, then update the existing Sites play link to redirect to the working game. The video's printed play address can remain useful. No automatic deployment is enabled by this proposal, and no LinkedIn post is sent.
