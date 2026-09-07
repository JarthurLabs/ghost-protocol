# Controls, implementation and verification

## Controls and campaign

Phones and touch tablets use a separate layout: large direction buttons, Brake, and a contextual action button sit outside the maze. The camera follows the drone by default; the map icon shows the whole facility. Portrait and landscape layouts reserve space for the controls and compact key indicators. Passive notices expire after three and a half seconds without repeated server updates bringing them back. The desktop keyboard layout remains available. Touch directions fire on pointer-down and support sliding across the pad. The latest finger owns steering; releases do not replay older directions. A valid heading is accepted before the next movement tick, while unavailable corner turns stay buffered. Commands still cannot advance the clock or bypass gate authorization. A short vibration pulse uses the browser Vibration API, with a saved Pause setting; unsupported browsers show it as unavailable. iPhone Safari does not expose this standard API. Physical vibration has not been verified by browser emulation.

WASD or the arrow keys steer continuous movement. Press a direction once; the drone keeps moving until a wall or denied gate stops it. An early turn is buffered until the corridor opens. Space brakes only the drone. Escape pauses every actor and the credential clock. The visible Restart level button opens a restart confirmation; R is its keyboard shortcut. M switches between the whole maze and a camera that follows the drone.

Run over a key or the package to collect it. V marks Vault access to the archive, and T marks Transit access to the final exit. Raised clock readers refill their named key timer. Walk onto a reader or press E nearby to use it. Plain machinery on the solid islands is decorative. The optional “What are these devices?” guide explains these symbols during play.

The E prompt names the action on the device the server can actually reach, such as “Collect Vault key,” “Renew Transit timer” or “Lock Vault behind you.” The visible prompt can also be clicked. The footer action is disabled when no interaction is available; pressing E on ordinary floor gives a short explanation instead of silently doing nothing. Successful actions and denials receive visible feedback. Keys and the package still collect automatically when crossed.

The Vault lockdown switch is mounted on the cyan side of the Vault exit doorway. Cross the gate first, then press E at the switch to lock Vault behind you. The server requires the same zone and a reachable tile at most one step away, so the switch cannot be used from the Vault side or through a wall. Lockdown revokes the compromised Vault key for every holder, including the player, while leaving the separate Transit grant unchanged. It remains available if Vault has expired, and its action disappears once Vault is revoked. Lockdown is immediate during live play, with no choice dialog or forced pause.

Gates automatically use their matching key. Reach extraction with the package and the compromised Vault grant revoked, then stay for two seconds. The later missions also require active Transit access. Data chips are optional; a dangerous dead end can cost more than its chips are worth. The door-switch repair changes interaction reach, feedback and visuals; movement speed, enemy clocks, credential timers and maze routes remain unchanged.

The five authored facilities grow from twenty-three by fifteen to thirty-one by nineteen tiles:

1. **Borrowed Access:** one hunter demonstrates the copied credential and central revocation.
2. **Long Way Home:** a baseline maintenance detour competes with a shorter privileged entrance.
3. **Expiry Window:** two pursuers and a twenty-four-second Vault grant make renewal and route planning matter.
4. **Two Locks:** separate Vault and Transit scopes let you revoke compromised access while preserving extraction. A local Transit clock reader keeps the exit key active.
5. **Ghost Protocol:** three distinct pursuers combine scope, renewal, route choice and revocation in the largest maze.

The defender finale applies three policies through the same authorization evaluator. A worker and an intruder hold a shared Maintenance key. Broad access allows both vault data and the service bay; disabling the key denies both; limiting its scope to the service bay denies the intruder's vault request while preserving the worker's service request. Only the last policy passes. The copied key still exists and retains the narrowed service permission. This proves the two displayed requests, not that every possible intruder action is blocked. A real response also needs to disable and replace the exposed key.

The Missions menu supports unlocked mission replay. Mission One offers the borrowed-key exercise, Mission Three the expiry exercise, and Mission Four the separate-scope exercise. Practice opens on a first visit, remains optional and can be replayed. Begin mission stays available. The expiry exercise advances a sample clock manually and shows that renewing a shared Vault key restores its copied access too.

Pause includes the field guide, reduced motion, separate music and sound-effect controls, and music volume. Inspection and an explicitly requested restart confirmation pause the simulation while they are open. Live notes and Vault lockdown do not pause play or open a lesson automatically.

## What the server enforces

The browser sends a small allowlisted command. It can request an action or name a grant to revoke, but cannot supply a fabricated identity, position, credential or outcome. The server owns session identity, all actor positions, credential possession, elapsed simulation time, access decisions, capture and extraction. Each command validates its input and applies the engine operation to a private state copy synchronously. Both the local Node server and the deployed Render server commit that copy in memory. Unknown commands and extra fields fail closed.

A grant has a stable name, explicit resource scope, authoritative expiry time and revocation state. When the package is collected, each pursuer receives the compromised Vault grant. Every holder references that same grant. Renewal extends it for prior holders; expiry and revocation remove its authority for subsequent protected requests. The package is a scripted key-leak event for the lesson; reading data does not itself copy credentials in a real system. Patrols move and can capture the player before that event. Every gate crossing is checked. The visible gate state reflects the current grant, and a blocked enemy remains in the world.

Ordinary movement and the maintenance detour use baseline permissions. Vault and Transit protect different resources. Revoking Vault cannot satisfy, remove or silently replace the separate Transit permission. The defender replay uses the same evaluator rather than a client-side success animation.

The implementation is divided by responsibility:

- [Authored levels and resource scopes](../shared/level.ts), with shared contracts in [campaign-schema.ts](../shared/campaign-schema.ts) and [types.ts](../shared/types.ts).
- [Real-time engine](../server/engine.ts), [authorization evaluator](../server/authorization.ts), [session server](../server/index.ts) and [Render entrypoint](../server/cloud.ts).
- [Ordered live connection](../src/liveConnection.ts) and [bounded connection discovery](../src/transportBootstrap.ts).
- [Three.js facility and actors](../src/Scene.tsx), [game interface](../src/App.tsx), [briefing](../src/Briefing.tsx) and [defender lab](../src/DefenderLab.tsx).
- [Campaign progress](../src/progress.ts), [learning content](../shared/learning.ts), [state-derived live notes](../src/learningFeedback.ts) and [paused field guide](../src/FieldGuide.tsx).
- [Isolated practice state](../shared/access-practice.ts) and [practice interface](../src/AccessPractice.tsx), which reuse the pure evaluator without sending live commands.

Read [How Ghost Protocol teaches cybersecurity](../docs/CYBERSECURITY.md) for the teaching model, its limits and primary-source references.

## Local and online connections

The [playable browser release](https://ghost-protocol-b74p.onrender.com) runs on one persistent Node server on Render's free plan in Singapore. The deployed Neon Run source is [ea3382b](https://github.com/JarthurLabs/ghost-protocol/commit/ea3382bed3e7cac6a341bbc2ccb5d54207442f62). [The hosting record](HOSTING.md) identifies its deployment and measured results.

- **Local game:** `npm run dev` or a production build followed by `npm start` uses ordinary Hypertext Transfer Protocol (HTTP) requests for state reads and commands. The approved local mode remains restricted to loopback addresses and this game's reserved ports. An independent server clock drives movement and sentries between requests.
- **Render game:** `npm run start:cloud` enables WebSocket transport through `server/cloud.ts`. One cookie-owned connection carries ordered commands, acknowledgements and server snapshots. Commands execute synchronously in memory. The same engine and authorization evaluator serve both modes.
- **Earlier Sites experiment:** the retained [Worker adapter](../hosted/worker.ts) uses HTTP requests and a D1 database, with revision checks to prevent conflicting writes. That adapter belongs to the earlier preview. Its implementation, regression tests and connection investigation are preserved separately in [the hosting history](HOSTING.md#earlier-hosting-evidence); it does not describe the Render runtime.

The live server checks the request origin and session before accepting a socket. A second controller cannot take over an attempt. HTTP mutations are also rejected while a live controller owns it. Command numbers prevent duplicate actions, and the client does not automatically replay an action whose acknowledgement is uncertain.

During a reload, connection discovery waits briefly for the previous socket to release ownership. The replacement receives the current server state and requires explicit Resume if the attempt is paused. An actively heartbeating controller keeps ownership; a competing tab receives a bounded connection error. [Connection repair and verification](REALTIME_REPAIR.md).

## Saved progress and limits

Non-sensitive campaign results live in this game's browser storage: unlocked missions, best times, best chip counts, completion counts, introduction preference and defender completion. Public attempt identifiers prevent a page reload from counting the same completion twice. Sound and motion preferences also stay local. If storage is unavailable, the interface says that progress lasts for the current visit.

Browser progress is a convenience feature, not a security boundary. It cannot authorize a gate or manufacture a win in the current server session. The game has no online leaderboard or account system.

The local and Render Node servers keep active sessions in memory for up to six hours. Reloading can recover an unexpired session while the process remains alive. Hiding the page requests a pause; a disconnected client also receives a pause after a short grace period. The live connection expires after two seconds without a heartbeat or command. Returning to a paused session requires Resume. Restarting either Node process clears its active attempts while completed campaign progress remains in the same browser and play address.

The free Render service can sleep between visits. The recorded idle-start check took about twenty-five seconds to become usable; an immediate warm reload took about two and a half seconds. These are measured examples, not guaranteed startup times. The server caps live connections at thirty-two and retained sessions at two hundred and fifty-six. Those limits are safeguards, not demonstrated player capacity.

This is a fictional single-player demonstration. The game adds no analytics tracking, external identity accounts, paid interfaces or connection to real security infrastructure. The hosting platform records its own traffic and operational logs. It models authorization decisions, not a complete identity provider or network. First-player campaign duration and learning effectiveness have not been measured. Fast automated reference routes are verification paths, not a claim about playtime or human understanding. Safari has not been verified.

## Verification and preserved evidence

The earlier Render release, [fa78de9](https://github.com/JarthurLabs/ghost-protocol/commit/fa78de9eb633e1149347f23ea5d841d93f3f4f8d), passed all 96 tests on September 6, along with the TypeScript check and production build. The suite covers server-owned movement and outcomes, forged input rejection, independent actor clocks, pause, exact expiry boundaries, renewal, separate scopes, targeted revocation, baseline access, defender outcomes, HTTP session isolation and local progress parsing. Interaction regressions cover matching E labels and targets, expired grants, escape-side console reach, completed lockdown, useful empty-floor feedback and separate renewal effects. It also verifies isolated practice, state-derived learning notes, all five engine reference routes and real revoked-gate denials.

Real WebSocket tests check session isolation, origin checks, a protected second controller, command ordering, independent updates, disconnect pause, shutdown, reload discovery, heartbeat expiry and cancelled startup. The suite retains tests of concurrent updates and ambiguous database failures for the earlier Sites adapter. Those database tests are separate from the deployed Render connection. [Recorded release verification](../captures/render-free-review/VERIFICATION.md).

Run the suite, production build and full campaign demonstration:

```sh
npm test
npm run build
npm run demo
```

The continuous integration workflow runs these checks on Node.js 24. `npm run demo` uses the actual engine and prints every mission outcome plus the defender's paired access decisions.

`npm run verify:browser` drives real keyboard controls in an isolated Google Chrome context and writes screenshots and receipts. The current script expects Chrome at its standard macOS application path. Point it at the running production server; this example uses the default game port:

```sh
GHOST_PROTOCOL_BASE=http://127.0.0.1:5320 npm run verify:browser
```

Set `GHOST_PROTOCOL_RECORD=1` to enable gameplay recording. Add `GHOST_PROTOCOL_DELIBERATE=1` for the Mission Four exploration, device-guide and real capture/retry sequence. `npm run verify:audio` exercises sound behavior separately.

The [newcomer check](../scripts/newcomer-check.mjs) verifies manual introduction and borrowed-key practice, keyboard controls, pause and field-guide behavior, restart, reduced motion, and unchanged mission state during practice. The [learning check](../scripts/learning-check.mjs) runs that newcomer check and an isolated defender fixture. Its defender-only phase starts the lab through the public command; it does not claim earned campaign completion. Run these checks against the local server:

```sh
GHOST_PROTOCOL_URL=http://127.0.0.1:5320 node scripts/newcomer-check.mjs
GHOST_PROTOCOL_URL=http://127.0.0.1:5320 GHOST_PROTOCOL_LEARNING_PHASE=defender node scripts/learning-check.mjs
```

The approved local browser checks completed all five missions with every enemy active, practice exercises, capture and retry, live lockdown with Transit preserved, the defender finale, and saved progress after reload. Ready and locked switches were reviewed across all five levels at desktop and laptop sizes.

That earlier Render build was then checked separately with actual keyboard and button input. All five missions, capture and retry, practices, Vault lockdown, unchanged Transit access and the defender finale passed without browser errors. Three additional reloads received a fresh socket state, preserved the same paused attempt and accepted real Resume and Pause actions. The later idle-start check preserved all earned campaign progress across a server restart. [Public browser receipts and screenshots](../captures/render-free-review/VERIFICATION.md) and [hosting measurements](HOSTING.md) record the scope and limits of those results.

The [release poster](../captures/release/ghost-protocol-poster.png), [Vault frame](../captures/release/ghost-protocol-gate-caption.png) and [Transit frame](../captures/release/ghost-protocol-transit-caption.png) accompany the source snapshot. The [eighty-second release film](https://github.com/JarthurLabs/ghost-protocol#readme-ov-file) is a 1080p viewing copy of the approved native 4K master, with the same audio stream. [Verification and captions](../captures/release/VERIFICATION.md) document the master and its capture. Full historical captures remain preserved in the local game repository.

## Original assets and licensing

All facility geometry, materials, drone models, signage, interface illustrations and animation were authored for this project. The ivory workshop, indigo archive, cyan egress and gold data package retain the approved visual direction. Larger missions reuse the same geometric kit, with distinct unit silhouettes and low machinery landmarks. No external artwork, downloaded fonts, paid assets or generated still images are used.

Nicholas selected **Neon Run**, an original procedural synthesizer composition at 124 beats per minute. The game uses a sixteen-bar arrangement rendered once into [an MP3 loop](../public/audio/neon-run.mp3), lasting about 30.97 seconds. The browser decodes that file and loops it on its audio clock; it does not generate the track's instruments during play. Notes and echoes crossing the end wrap into the beginning, with no inserted boundary silence. The composition uses no external samples or purchased recordings.

[The music player](../src/music.ts) keeps the arrangement at its original tempo during pursuit. Pause, mute and hiding the page stop music playback, and resume continues from the saved musical position. Music volume and the separately synthesized movement and action effects retain their own controls. The original runtime score is preserved in project history.

The Neon Run revision passed 103 automated tests, including music loading, looping and control checks, and the full local browser campaign. A focused public check then verified the deployed bundle, music-file hash, playback, keyboard movement, Vault-key collection effect and resumed music with zero browser errors. These results are separate from the historical 96-test release and its full public campaign and startup measurements. The actual hidden-tab audio case remains untested because the automation environment kept both pages visible. [Public music and controls receipt](../captures/neon-run-review/public/public-smoke.json).

The release film uses a continuous Neon Run arrangement at normal tempo over the unchanged video. [Film verification and effect-timing limits](../captures/release/VERIFICATION.md) and [sanitized technical receipt](../captures/release/neon-run-verification.json).

Dependencies retain their own licenses. Source licensing is undecided; this repository does not grant a source license on its owner's behalf.
