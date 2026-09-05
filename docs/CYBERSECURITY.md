# How Ghost Protocol teaches cybersecurity

Ghost Protocol takes place in Aurel, a fictional training network. The player is an authorized tester, represented by the maintenance drone PIP-07. The campaign teaches access decisions through a playable model: credentials open protected gates, copied credentials extend the same access to a pursuer, and policy changes alter what the next request is allowed to do.

## The connection during play

The optional introduction has four self-paced illustrated chapters. Next, Previous and chapter buttons let the player control the pace; Skip introduction and Mission briefing remain available throughout. Reduced motion removes decorative animation while keeping the same chapters and controls. Nothing advances on a timer or starts a live mission without the player's Begin action. The story explicitly distinguishes ordinary patrol danger from the scripted copy event: collecting the package simulates a Vault-key leak and starts active pursuit. Reading data does not inherently copy a credential in a real system.

Each briefing explains one idea in ordinary language before naming the technical term. Missions one, three and four include optional, replayable access practice, initially expanded on the first visit. The player can begin the mission at any point. A fixed Begin mission action sits outside the scrolling lesson. The practice uses the same pure authorization evaluator as the maze, with local exercise state and manually advanced time. Its decisions are real evaluations of practice inputs, not live mission events; they cannot change the mission, its grants or progress. Exercises show a missing key, shared access, revocation for both holders, expiry at a deadline, shared renewal, and separate Transit permission surviving Vault lockdown.

During play, short state-derived feedback explains access changes without opening a lesson or pausing a chase. An optional field guide offers definitions when the player asks for them. Debriefs show only confirmed final-state facts as run evidence: recovered data, disabled Vault access and, when applicable, active Transit access. The accompanying explanation describes the mechanic without claiming the player observed an expiry or took a detour when the route did not do so. Optional questions connect the idea to a work task, with feedback for every answer. No question changes server permissions, scoring, or completion.

## What the objects mean

- **Drone:** the identity making a request. An identity can retain ordinary permissions when one temporary grant is removed.
- **Amber Vault key:** the credential that opens archive gates. Collect it by moving over it. Matching gates use it automatically; there is no key-selection step.
- **Cyan Transit key:** a separate credential that opens the final exit in the later missions. Its gates also use it automatically.
- **Gate:** a protected resource boundary with a matching Vault or Transit label. Its actual allow or deny decision comes from the server evaluator. A gate marked NO KEY uses ordinary baseline permission.
- **Copied key:** the sentry's ability to present the compromised grant. The animation illustrates a simulated credential-copy event; it is not an exploitation tutorial.
- **Expiry:** the end of a credential's scheduled lifetime. The server's playing-time clock enforces it, including while the player stands still.
- **Raised clock reader:** a renewal device that refreshes the key named on it. Moving over the reader resets that key's timer. An amber Vault reader affects Vault; a cyan Transit reader affects Transit.
- **Vault door switch:** mounted on the cyan side of the Vault doorway. Press E once beside it to revoke the compromised Vault grant. Vault gates deny both the tester and pursuers holding its copy. Transit is unchanged, including its existing timer. The action stays in the maze and does not open a selection menu or pause the chase.
- **Revocation:** the access-control change performed by lockdown. It withdraws a named grant rather than waiting for the clock to expire.
- **Baseline access:** ordinary movement or maintenance that remains allowed without the temporary privilege. Removing an unnecessary privilege should not automatically remove all legitimate activity.
- **Vault and Transit grants:** separate scopes. The lockdown device is deliberately wired to Vault, so containing copied archive access preserves the Transit permission needed to exit.

## Campaign learning progression

Borrowed Access introduces credentials as digital keys, permissions as what they may open, and revocation as switching access off. Long Way Home separates ordinary maintenance access from the extra permission that opens a shortcut. Choosing a route does not itself narrow a permission, so that mission does not claim the player performed a least-privilege policy change. Expiry Window separates a timer ending from deliberate lockdown, and its optional practice makes shared renewal visible even when a live run never expires. Two Locks makes scope tangible: amber opens the archive, cyan opens the exit, and Vault lockdown affects only Vault. Ghost Protocol brings these ideas together and asks the player to consider both blocked and allowed requests before the defender finale.

The work examples progress from disabling a stolen sign-in token, to preserving ordinary ticket work after temporary admin access is removed, to distinguishing a session timeout from an immediate response, to separating keys for unrelated services, and finally testing both denied and allowed requests after changing a rule. These are concrete analogies, not instructions for operating a particular real identity product.

The defender finale changes the perspective. Three policies are applied to the real evaluator: leave broad access, withdraw the shared credential, or narrow the shared Maintenance role to its service resource. Both holders present the same Maintenance role. Narrowing its scope removes vault permission for both, while retaining service permission. The interface visualizes two server-reported requests. Completion requires both an intruder denial and a legitimate maintenance allow. A total shutdown does not pass. Narrow scope limits the copied credential’s power; it does not erase the copy. An operational response to a compromised credential may also require revocation and replacement. A decision log exposes the actual actor, action, resource, outcome and reason; the client never invents a passing result.

## Primary-source foundation

The National Institute of Standards and Technology defines least privilege around giving an entity only the access needed for its assigned function. The game's separate grants and defender maintenance check are teaching analogies for that principle. [NIST least privilege glossary](https://csrc.nist.gov/glossary/term/least_privilege).

The Open Worldwide Application Security Project distinguishes identity verification from authorization, recommends checking permissions for each request, and calls for explicit permission rules with safe denial when access is not granted. It also recommends testing authorization and recording meaningful decisions. Those ideas inform the maze's server-owned gate checks and paired defender outcomes. [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html).

OWASP's session guidance separates timeouts from deliberate invalidation and requires session expiration to be enforced by the server. The game simplifies that lifecycle into an authoritative countdown and the Vault door switch. [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

These sources were checked on September 5, 2026. The maze is a simplified authorization model, not a full network or identity system. Its keys represent credentials and central permission records; real systems vary in how credentials are bound to permissions, expire, renew and become invalid. Real systems also need authentication, secure credential handling and operational recovery. The game provides opportunities to predict and observe scope, expiry, renewal, containment and access decisions. Automated behavior and browser checks establish those opportunities, not measured learning effectiveness or certification of security skills. Human newcomer learning outcomes and the original fifteen-to-twenty-five-minute playtime target remain unmeasured.
