export interface LearningChoice {
  id: string;
  label: string;
  correct: boolean;
  feedback: string;
}
export interface MissionLearning {
  plainTitle: string;
  definition: string;
  question: string;
  choices: LearningChoice[];
  takeaway: string;
  realWorld: string;
}

export const CYBERSECURITY_SOURCES = [
  { title: 'NIST: least privilege', url: 'https://csrc.nist.gov/glossary/term/least_privilege' },
  { title: 'OWASP: authorization', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html' },
  { title: 'OWASP: session management', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html' },
] as const;

const lessons: Record<number, MissionLearning> = {
  1: {
    plainTitle: 'A copied key can open the same door.',
    definition: 'A credential is a digital key you present to a system. Its permissions say what you may open. Revocation means switching that access off, including access through a copy.',
    question: 'What does Vault lockdown do to the copied key?',
    choices: [
      { id: 'distance', label: 'It disables the key only when the sentry is nearby.', correct: false, feedback: 'Distance gives you time to reach the terminal. Lockdown changes the shared access rule, wherever its holders are.' },
      { id: 'shared', label: 'It removes Vault permission from both holders.', correct: true, feedback: 'Exactly. Your key and the sentry’s copy rely on the same permission. Vault lockdown switches it off for both.' },
      { id: 'identity', label: 'It removes the sentry from the network.', correct: false, feedback: 'The sentry still exists and can still move. Its copied key can no longer open a Vault gate.' },
    ],
    takeaway: 'The gate checks permission, not who looks trustworthy. Disabling the shared Vault key removes access through its copy too. This is revocation.',
    realWorld: 'Someone reports a stolen sign-in token. You disable that token, then try it again to confirm it no longer opens the account.',
  },
  2: {
    plainTitle: 'Ordinary work can have its own route.',
    definition: 'Baseline access means the ordinary permission needed to work. The NO KEY maintenance route has it. The Vault shortcut needs extra permission; choosing a route does not change that permission.',
    question: 'What makes the ordinary maintenance detour useful?',
    choices: [
      { id: 'baseline', label: 'It works without the temporary shortcut permission.', correct: true, feedback: 'Right. The NO KEY route uses ordinary maintenance access. It remains available when the extra Vault permission is unavailable.' },
      { id: 'all', label: 'Using it grants access to every protected gate.', correct: false, feedback: 'The detour changes your route. It does not change what your key is allowed to open.' },
      { id: 'pause', label: 'It stops the sentries from moving.', correct: false, feedback: 'Sentries keep moving. The detour is valuable because it does not depend on the shortcut grant.' },
    ],
    takeaway: 'The ordinary maintenance route and the extra Vault shortcut have different access rules. Losing the shortcut does not remove the ordinary route.',
    realWorld: 'A support worker needs to read customer tickets, but only occasionally needs an admin tool. Remove the temporary admin access while keeping everyday ticket work available.',
  },
  3: {
    plainTitle: 'A timer ends access. Lockdown ends it now.',
    definition: 'Expiry means a key stops working at its deadline. Renewal extends that deadline. In this lab, renewing a shared Vault key also extends access through its copy.',
    question: 'How is a key timing out different from Vault lockdown?',
    choices: [
      { id: 'same', label: 'Both wait for the same countdown.', correct: false, feedback: 'Expiry waits for the deadline. Revocation switches access off as soon as you press E at Vault lockdown.' },
      { id: 'clock', label: 'Expiry follows time; revocation withdraws access now.', correct: true, feedback: 'Exactly. A key expires when its server timer ends. Clock readers refresh that timer; E at Vault lockdown revokes Vault access immediately.' },
      { id: 'walk', label: 'Expiry only happens when the player moves.', correct: false, feedback: 'The countdown runs on the server clock while the mission is playing. Standing still does not stop it.' },
    ],
    takeaway: 'A short timer limits how long a key works. If a copy is already in the wrong hands, switch access off instead of waiting. A clock reader extends shared access; it does not make a copy safe.',
    realWorld: 'A website may sign you out after a time limit. If your sign-in token is stolen, an administrator should end that session immediately, even if time remains.',
  },
  4: {
    plainTitle: 'Each key opens only its own doors.',
    definition: 'Scope means the resources a key may open. Amber Vault opens the archive. Cyan Transit opens the final exit. Disabling Vault leaves the separate Transit permission available.',
    question: 'Why can the final exit still open after Vault lockdown?',
    choices: [
      { id: 'all', label: 'Lockdown removes every key.', correct: false, feedback: 'The terminal shuts only Vault access. It leaves the separate cyan Transit key active for the final exit.' },
      { id: 'transit', label: 'Transit is a separate key that stays active.', correct: true, feedback: 'Right. Pressing E locks Vault gates for both copied holders. The final exit uses your cyan Transit key automatically.' },
      { id: 'swap', label: 'The Vault key turns into a Transit key.', correct: false, feedback: 'They are separate credentials from the start. Amber Vault opens the archive; cyan Transit opens the final exit.' },
    ],
    takeaway: 'Vault lockdown removes the copied archive access while preserving the separate Transit permission needed to leave.',
    realWorld: 'An app has separate access to a document store and a delivery service. Disable its exposed document key while the delivery service keeps working with its own key.',
  },
  5: {
    plainTitle: 'Check what is blocked and what still works.',
    definition: 'Authorization is the decision about whether a request is allowed. A previous allowed request is not a free pass: the next gate checks the key, its scope, its timer and any lockdown.',
    question: 'What proves that a defensive access change worked?',
    choices: [
      { id: 'green', label: 'A reassuring message in the interface.', correct: false, feedback: 'A message is not proof. Try the intruder’s request and the legitimate worker’s request, then check their actual results.' },
      { id: 'both', label: 'The intruder is denied and legitimate work still succeeds.', correct: true, feedback: 'Exactly. The defender lab lets you check both requests after changing the access rules.' },
      { id: 'offline', label: 'No one can use the system anymore.', correct: false, feedback: 'A total shutdown can stop an intruder while also stopping the work the system exists to support.' },
    ],
    takeaway: 'You can remove copied Vault access while keeping the separate exit permission. At the defender’s desk, you will change a different access rule and test both the intruder and a worker.',
    realWorld: 'After changing an app’s permissions, test a forbidden action and an everyday task. An error for the intruder is only half the check; the worker must still be able to do the job.',
  },
};

/** Optional debrief content. Answers never affect server authority or unlocks. */
export function getMissionLearning(levelId: number): MissionLearning {
  return lessons[levelId] ?? lessons[1];
}
