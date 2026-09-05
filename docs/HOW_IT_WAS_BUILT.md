# How I built Ghost Protocol with Codex

I wanted a cybersecurity game that someone could enjoy before they knew the terminology.

The starting point was a small heist: collect access, recover a package, and shut down the compromised permission behind you. That gave the game a useful security idea, but I wanted more movement and more decisions along the way.

I used Codex as my development partner. I set the direction, played the builds, and described what worked and what confused me. Codex implemented the changes, ran checks, and captured the actual game so I could review the result.

## Finding the game

The first slice established the drone, facility, gates, and access rules. We added more colour and an original electronic soundtrack, then moved toward the Pac-Man-inspired direction I wanted: continuous movement, enemies moving independently, and corridors where a wrong turn could matter.

From there, the game grew into five authored mazes. Later missions introduce tighter access timers, separate Vault and Transit permissions, and up to three pursuers.

Locking the Vault changes what the pursuers can do. It also removes my own Vault permission, so the timing and position matter.

## Making the lesson understandable

Once the chase felt right, the next challenge was explaining why any of it was cybersecurity.

We added a self-paced introduction, optional practice, short explanations during play, and mission debriefs tied to ordinary security tasks. The player can try the concepts before meeting them under pressure.

The interface needed work too. Floor devices were confusing. A key-selection dialog interrupted the chase. Some interaction prompts appeared where nothing useful happened. There was no visible restart button.

Those became concrete revisions: labelled devices, automatic matching keys, live Vault lockdown, clearer action prompts, and a restart control. The final doorway review restored the Vault sign and moved the switch to a consistent position across every level.

It turns out “just lock the door” needs a surprisingly clear button.

## What is real underneath

The browser displays the facility and sends commands. The server owns movement, timers, credential possession, gate decisions, and mission outcomes. Every protected crossing goes through the authorization evaluator. The security result comes from an enforced rule, with a door animation showing what happened.

React and TypeScript handle the interface, Three.js renders the facility, and the music is synthesized in code. The repository includes rule tests, a runnable campaign demonstration, browser checks, and actual gameplay evidence.

## What this project demonstrates

Ghost Protocol is a simplified authorization model. Collecting the package triggers a scripted credential leak; reading data does not normally copy a key. Completing the campaign also does not prove that someone has learned the concepts.

What it provides is a place to try a decision and see its consequence. Expiry ends access at a deadline. Revocation withdraws it deliberately. Separate permissions let one service keep working while another is contained.

That is the experience I wanted to build: a game with a clear connection to the work behind access control.

— Nicholas
