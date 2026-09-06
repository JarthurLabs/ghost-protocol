# How I built Ghost Protocol with Codex

I wanted someone to play a cybersecurity game, understand why a decision mattered, and leave with a clearer idea of access control. The terminology could come along with the experience.

I used Codex as my development partner. I set the direction, played the builds, reviewed the art, and described what worked or confused me. Codex implemented the changes, ran checks, and captured the actual game for review. My feedback shaped what we kept and what needed another pass.

## Finding the game I wanted to play

The first slice had the essential heist: collect access, recover a package, and shut down the compromised permission behind you. I liked that idea, but wanted more movement and more decisions along the way.

We added colour and an original electronic soundtrack. Then I asked for a more Pac-Man-inspired direction: enemies moving on their own, continuous steering, more tiles and obstacles, and corridors that felt like a maze. Dead ends needed to matter. The later missions could grow larger and add another pursuer or two.

That became five authored facilities, with up to three independently moving sentries. The shared access key stayed central. Locking the Vault changes which requests the gate accepts, so it stops copied access for the pursuers and removes my own Vault permission too.

![The larger final mission during actual browser play](../captures/render-free-review/mission-five-pursuit.png)

*The final mission combines the larger maze with separate permissions, renewal devices, and three pursuers.*

## Making the connection understandable

Once I liked the chase, I had a different concern: how would someone know why any of this was cybersecurity?

That led to a self-paced introduction, optional practice, brief explanations during play, and debriefs connected to everyday security tasks. A player can try the rules before dealing with them under pressure. The practice uses the same authorization evaluator as the game, but has separate exercise state, so trying it cannot alter an active mission or earned progress.

I also needed the objects to make sense. Floor devices were confusing. Having multiple keys opened a selection dialog at the gate and stopped the flow. Some interaction prompts appeared where pressing E did nothing useful. There was no visible restart button.

Those became specific changes: labelled devices, automatic matching keys, a live Vault-lockdown action, useful interaction feedback, and a restart control. Each change had an observable result to check.

The doorway took another review. The switch and Vault sign overlapped. Moving the sign away did not solve the placement I wanted, so I marked the other side of the doorway in a screenshot and asked for the same arrangement across every level.

![The reviewed Vault doorway with the sign and switch separately visible](../captures/render-free-review/mission-one-lock.png)

*The final placement keeps the sign, moves the switch beside the exit, and names the action clearly.*

Apparently “just lock the door” needs a surprisingly clear button.

## Checking the rules underneath

The browser displays the facility and sends commands. The server owns movement, timers, credential possession, gate decisions, and mission outcomes. The door animation shows the result of an access decision enforced by the server.

React and TypeScript handle the interface, and Three.js renders the facility. Neon Run was composed with synthesized instruments and rendered into a looping audio file; the game plays that track alongside its separate synthesized effects. Codex implemented the engine, interface, artwork, sound, and verification scripts as we worked through the revisions.

The checks cover more than reaching the exit. They exercise expiry, renewal, revocation, separate scopes, denied requests, forged input, pause, restart, and session ownership. Browser runs use actual keyboard controls and buttons to check the experience those rules produce.

For the first Render release, ninety-six automated tests passed. The public browser run completed all five missions, a capture and retry, the optional practices, Vault lockdown with Transit preserved, and all defender policies. Reload checks then verified a fresh connection, the same paused attempt, and real Resume and Pause actions.

[The browser evidence](../captures/render-free-review/VERIFICATION.md) records what was checked. Those runs establish behavior; they do not measure how quickly a new player learns it.

## Getting it to play properly online

The first public version loaded, but I could feel the steering lag. That needed a separate investigation from the local gameplay and art I had already approved.

Codex measured the delay and tested the hosting connection. We moved online play to a persistent Node server with a WebSocket connection, keeping the same game engine and rules. The public campaign was then run again.

That test found a second issue: reloading could open a new connection while the previous page still held the attempt. The repair waits briefly for the old controller to release it. It preserves the restriction against two tabs controlling one attempt and does not replay uncertain commands.

I chose to test free hosting and asked about the first-visit wait. After more than eighteen minutes idle, the measured visit took about twenty-five seconds to become ready. An immediate warm reload took about two and a half seconds. Earned campaign progress survived exactly; the unfinished attempt reset when the server restarted.

Those are useful results with a clear limit: one measured route and machine do not establish worldwide performance or capacity. [The hosting notes](HOSTING.md) keep the timing evidence and tradeoffs together.

For the music revision, I chose **Neon Run** and wanted it in the game and the film while keeping the movement and action sounds. Codex prepared a looping track for the game and a continuous arrangement for the existing footage, leaving space in the mix for important cues. The revised game passed 103 automated tests and the full local campaign, followed by a focused public check of its music and controls. [The film notes](../captures/release/VERIFICATION.md) explain the finished mix and how its effects were reconstructed.

## What I take from the project

The process gave me practice in turning an idea into requirements, reviewing an implementation, improving onboarding, documenting decisions, and troubleshooting behavior that did not match expectations. Those skills matter in security work because a correct rule still needs to be applied, tested, and explained clearly.

The game also gave the access concepts a concrete consequence. Expiry ends access at a deadline. Revocation withdraws it deliberately. Separate scopes let one permission remain useful while another is contained.

The defender finale asks for two results: deny the intruder's Vault request and allow legitimate maintenance. That makes checking legitimate work part of evaluating the security change.

The model has limits. Package collection triggers a fictional credential leak; reading data does not ordinarily copy a key. Narrowing access does not erase a stolen copy, so a real response may also need revocation and replacement. This project demonstrates a learning exercise and its implementation, without claiming production security experience or measured learning outcomes.

— Nicholas
