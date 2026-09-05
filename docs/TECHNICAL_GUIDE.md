# Controls, implementation and verification

## Controls and campaign

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

The browser sends a small allowlisted command. It can request an action or name a grant to revoke, but cannot supply a fabricated identity, position, credential or outcome. The server owns session identity, all actor positions, credential possession, elapsed simulation time, access decisions, capture and extraction. Each command validates its input and applies the engine operation to a private state copy synchronously. The local server then commits that copy in memory. The hosted adapter persists it asynchronously with a compare-and-swap revision check, recomputing only definite conflicts. Unknown commands and extra fields fail closed.

A grant has a stable name, explicit resource scope, authoritative expiry time and revocation state. When the package is collected, each pursuer receives the compromised Vault grant. Every holder references that same grant. Renewal extends it for prior holders; expiry and revocation remove its authority for subsequent protected requests. The package is a scripted key-leak event for the lesson; reading data does not itself copy credentials in a real system. Patrols move and can capture the player before that event. Every gate crossing is checked. The visible gate state reflects the current grant, and a blocked enemy remains in the world.

Ordinary movement and the maintenance detour use baseline permissions. Vault and Transit protect different resources. Revoking Vault cannot satisfy, remove or silently replace the separate Transit permission. The defender replay uses the same evaluator rather than a client-side success animation.

The implementation is divided by responsibility:

- [Authored levels and resource scopes](../shared/level.ts), with shared contracts in [campaign-schema.ts](../shared/campaign-schema.ts) and [types.ts](../shared/types.ts).
- [Real-time engine](../server/engine.ts), [authorization evaluator](../server/authorization.ts) and [loopback session server](../server/index.ts).
- [Three.js facility and actors](../src/Scene.tsx), [game interface](../src/App.tsx), [briefing](../src/Briefing.tsx) and [defender lab](../src/DefenderLab.tsx).
- [Campaign progress](../src/progress.ts), [learning content](../shared/learning.ts), [state-derived live notes](../src/learningFeedback.ts) and [paused field guide](../src/FieldGuide.tsx).
- [Isolated practice state](../shared/access-practice.ts) and [practice interface](../src/AccessPractice.tsx), which reuse the pure evaluator without sending live commands.

Read [How Ghost Protocol teaches cybersecurity](../docs/CYBERSECURITY.md) for the teaching model, its limits and primary-source references.

## Saved progress and limits

Non-sensitive campaign results live in this game's browser storage: unlocked missions, best times, best chip counts, completion counts, introduction preference and defender completion. Public attempt identifiers prevent a page reload from counting the same completion twice. Sound and motion preferences also stay local. If storage is unavailable, the interface says that progress lasts for the current visit.

Browser progress is a convenience feature, not a security boundary. It cannot authorize a gate or manufacture a win in the current server session. The game has no online leaderboard or account system.

The local Node server keeps active sessions in memory for up to six hours. The hosted adapter stores private sessions in a project-specific database for up to six hours. Reloading can recover an unexpired session. Hiding the page pauses play; a disconnected client also receives a pause after a short grace period. Returning to a paused session requires Resume. Restarting the local Node server clears its active sessions while saved browser campaign progress remains available.

This is a fictional single-player demonstration. The browser release uses a hosted Worker and database; the local version works with its Node server. The game adds no analytics tracking, external identity accounts, paid interfaces or connection to real security infrastructure. The hosting platform records its own traffic and operational logs. It models authorization decisions, not a complete identity provider or network. First-player campaign duration and learning effectiveness have not been measured. Fast automated reference routes are verification paths, not a claim about playtime or human understanding. Safari has not been verified.

## Verification and preserved evidence

The current automated suite passes 82 tests, including hosted session isolation, concurrent updates, disconnect timing and ambiguous database failures. It checks server-owned movement and outcomes, forged input rejection, independent actor clocks, pause, exact expiry boundaries, renewal, separate scopes, targeted revocation, baseline access, defender outcomes, HTTP session isolation and local progress parsing. Ten interaction regressions cover matching E labels and targets, expired grants, escape-side console reach, completed lockdown, useful empty-floor feedback and separate renewal effects. The suite also verifies isolated practice transitions and accurate state-derived learning notes, completes all five engine reference routes with every enemy active, and requires real revoked-gate denials.

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

The approved local browser checks completed all five missions with every enemy active, practice exercises, capture and retry, live lockdown with Transit preserved, the defender finale, and saved progress after reload. Ready and locked switches were reviewed across all five levels at desktop and laptop sizes. These tests do not establish that the online deployment has the same responsiveness; [hosting status](HOSTING.md) records that separate issue.

The [release poster](../captures/release/ghost-protocol-poster.png), [Vault frame](../captures/release/ghost-protocol-gate-caption.png) and [Transit frame](../captures/release/ghost-protocol-transit-caption.png) accompany the source snapshot. The eighty-second native 4K review film is delivered separately, with [its verification and captions](../captures/release/VERIFICATION.md) included here. Full historical captures remain preserved in the local game repository.

## Original assets and licensing

All facility geometry, materials, drone models, signage, interface illustrations and animation were authored for this project. The ivory workshop, indigo archive, cyan egress and gold data package retain the approved visual direction. Larger missions reuse the same geometric kit, with distinct unit silhouettes and low machinery landmarks. No external artwork, downloaded fonts, paid assets or generated still images are used.

**The Quiet Way In** is an original electronic score composed in code. Synthesized chords, bass, melody, percussion and spatial effects accompany the maze, with additional rhythmic detail during pursuit. Music uses its own audio clock, stops on pause or mute, and resumes from its musical position. No recordings, purchased music or external audio services are used.

Dependencies retain their own licenses. Source licensing is undecided; this repository does not grant a source license on its owner's behalf.
