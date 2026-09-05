import { useId, useState } from 'react';
import {
  advancePractice, createPractice, PRACTICE_STEP_COUNTS,
  type PracticeMode,
} from '../shared/access-practice';
import type { Decision } from '../shared/types';
import './access-practice.css';

interface PracticeStep { title: string; explanation: string; action?: string; warning?: string }
const steps: Record<PracticeMode, PracticeStep[]> = {
  borrowed: [
    { title: 'Try the Vault gate without a key.', explanation: 'The gate checks your permission. With no Vault key, it keeps you out.', action: 'Borrow the Vault key' },
    { title: 'The borrowed key opens the Vault gate.', explanation: 'A credential is a digital key. Its permissions say what it can open.', action: 'Make a training copy' },
    { title: 'The same Vault key works for both holders.', explanation: 'The gate accepts the copy too. In the mission, taking the package triggers this copy; patrols are already moving.', action: 'Lock down Vault' },
    { title: 'Lockdown removes Vault access from both.', explanation: 'The key is still held, but its permission is revoked. You lose Vault access too.', action: 'Test the ordinary exit' },
    { title: 'Your ordinary exit still works.', explanation: 'This exit uses your normal maintenance permission. It does not need the revoked Vault key.' },
  ],
  expiry: [
    { title: 'Both holders have ten seconds of Vault access.', explanation: 'This practice clock moves only when you press the button. The live mission clock keeps running during play.', action: 'Reach the expiry time' },
    { title: 'At exactly ten seconds, both keys stop working.', explanation: 'Expiry ends the shared permission automatically. The holder does not have to give the key back.', action: 'Renew Vault for ten seconds' },
    { title: 'Renewal restores access for both holders.', explanation: 'The same Vault permission now has a later end time.', warning: 'Renewing Vault also restores the copied access. Renewal does not remove the copy.' },
  ],
  scopes: [
    { title: 'Two keys, two different permissions.', explanation: 'You hold Vault and Transit. The copied holder has only Vault. Transit is for the final exit.', action: 'Lock down Vault' },
    { title: 'Vault closes. Your Transit access stays open.', explanation: 'Lockdown revokes only Vault, for both holders. The separate Transit key is unchanged.', action: 'Test both holders at the exit' },
    { title: 'The Transit exit accepts your Transit key.', explanation: 'The copied holder has no Transit key. A Vault key never grants Transit permission.' },
  ],
};

const resourceNames: Record<string, string> = { 'vault-gate': 'Vault gate', 'transit-exit': 'Transit exit', 'ordinary-exit': 'Ordinary exit' };
const reasonNames: Record<string, string> = {
  'no credential': 'Matching key missing',
  'role revoked': 'Vault permission revoked',
  'grant expired': 'Time has expired',
  'temporary role permits this resource': 'Matching key is active',
  'baseline permission': 'Normal maintenance access',
};

function HolderIcon({ copied }: { copied: boolean }) {
  return <svg className="access-practice-holder-icon" viewBox="0 0 36 36" aria-hidden="true">
    <path d="M25 9V4" stroke="currentColor" strokeWidth="2" />
    <circle cx="25" cy="4" r="2" fill="currentColor" />
    <rect x="5" y="10" width="27" height="21" rx="7" fill={copied ? '#35465a' : '#b8ccc5'} stroke="currentColor" />
    <rect x="9" y="17" width="19" height="7" rx="3" fill="#152631" />
    <path d="M13 20h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>;
}

function GateIcon({ allow }: { allow: boolean }) {
  return <svg className="access-practice-gate-icon" viewBox="0 0 28 32" aria-hidden="true">
    <path d="M4 29V4h20v25M1 29h8m10 0h8" fill="none" stroke="currentColor" strokeWidth="2" />
    <rect x={allow ? 19 : 9} y="8" width={allow ? 2 : 10} height="17" rx="1" fill="currentColor" opacity={allow ? '.5' : '.3'} />
    {!allow && <path d="m11 13 6 6m0-6-6 6" stroke="currentColor" strokeWidth="1.7" />}
  </svg>;
}

function DecisionRow({ decision }: { decision: Decision }) {
  const copied = decision.actor === 'copied-holder';
  return <li className={`access-practice-decision ${decision.allow ? 'is-allowed' : 'is-denied'}`} data-actor={decision.actor} data-resource={decision.resource} data-allowed={decision.allow}>
    <span className={`access-practice-holder${copied ? ' is-copy' : ''}`}><HolderIcon copied={copied} /><span>{copied ? 'Copied holder' : 'You'}</span></span>
    <span className={`access-practice-request ${decision.resource === 'vault-gate' ? 'is-vault' : 'is-transit'}`}><span className="access-practice-arrow" aria-hidden="true">→</span><GateIcon allow={decision.allow} /><span>{resourceNames[decision.resource]}</span></span>
    <span className="access-practice-result"><strong><span aria-hidden="true">{decision.allow ? '✓' : '×'}</span> {decision.allow ? 'Allowed' : 'Denied'}</strong><small>{reasonNames[decision.reason] ?? decision.reason}</small></span>
  </li>;
}

function PracticeRun({ mode }: { mode: PracticeMode }) {
  const [state, setState] = useState(() => createPractice(mode));
  const headingId = useId();
  const current = steps[mode][state.step];
  const finished = state.step === PRACTICE_STEP_COUNTS[mode] - 1;
  const vault = state.context.grants.find(grant => grant.id === 'vault')!;
  const held = state.context.holders.player.includes('vault');
  const remaining = Math.max(0, (vault.expiresAt - state.context.elapsedMs) / 1000);
  const vaultStatus = !held ? 'not held' : vault.revoked ? 'revoked' : remaining === 0 ? 'expired' : 'active';
  const reset = () => setState(createPractice(mode));

  return <section className="access-practice" aria-labelledby={headingId} data-practice-mode={mode} data-practice-step={state.step}>
    <div className="access-practice-top"><span>Safe pre-mission practice</span><span>Step {state.step + 1} of {PRACTICE_STEP_COUNTS[mode]}</span></div>
    <div className="access-practice-heading"><h2 id={headingId}>{current.title}</h2><p>{current.explanation}</p></div>
    <div className="access-practice-keys" aria-label="Practice key status">
      <span className="access-practice-key is-vault"><i aria-hidden="true" />Vault <b>{vaultStatus}</b></span>
      {mode === 'scopes' && <span className="access-practice-key is-transit"><i aria-hidden="true" />Transit <b>active</b></span>}
      {mode === 'expiry' && <span className="access-practice-clock">Practice clock: {state.context.elapsedMs / 1000}s <span>·</span> {remaining}s of access left</span>}
    </div>
    <ul className="access-practice-decisions" aria-label="Permission check results">{state.decisions.map(decision => <DecisionRow key={`${decision.actor}-${decision.resource}`} decision={decision} />)}</ul>
    {current.warning && <p className="access-practice-warning">{current.warning}</p>}
    <p className="access-practice-announcement" role="status" aria-atomic="true">Step {state.step + 1}. {current.title} {state.decisions.map(decision => `${decision.actor === 'player' ? 'You' : 'Copied holder'}, ${resourceNames[decision.resource]}: ${decision.allow ? 'allowed' : 'denied'}.`).join(' ')} {current.warning}</p>
    <div className="access-practice-bottom"><p>Practice only. Your mission stays unchanged.</p><div><button type="button" className="access-practice-reset practice-reset" onClick={reset} disabled={state.step === 0}>Reset</button><button type="button" className={`access-practice-next ${finished ? 'practice-replay' : 'practice-next'}`} onClick={finished ? reset : () => setState(advancePractice)}>{finished ? 'Replay exercise' : current.action}<span aria-hidden="true">{finished ? '↻' : '→'}</span></button></div></div>
  </section>;
}

export default function AccessPractice({ mode }: { mode: PracticeMode }) {
  return <PracticeRun key={mode} mode={mode} />;
}
