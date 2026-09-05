import './field-guide.css';

const terms = [
  ['Credential', 'Something you present to get access. Here, it is a key. A copied key can let another holder request the same access.'],
  ['Authorization', 'The decision about what you may do. A Vault gate checks for valid Vault access on every crossing.'],
  ['Scope', 'The places or tasks a permission covers. Vault opens the archive. Transit opens the final exit.'],
  ['Expiry and renewal', 'Expiry ends access at a deadline. A clock reader renews its named key. Renewing a copied Vault key also helps its other holders.'],
  ['Revocation', 'Deliberately withdrawing access. Vault lockdown affects everyone holding that key, including you. It does not stop a drone moving through open corridors.'],
  ['Least privilege', 'Only the access a job needs. In the defender lab, maintenance needs the service bay, so its role should not also open the vault.'],
];

export default function FieldGuide() {
  return <details className="field-guide">
    <summary>Field guide · the security connection</summary>
    <div className="field-guide-content">
      <p className="field-guide-lead">You are an authorized tester in a fictional network. Find the data, contain the copied access, and leave. No cybersecurity experience needed.</p>
      <div className="field-guide-route" aria-label="The mission loop"><span>Borrow access</span><i>→</i><span>Recover data</span><i>→</i><span>Cross into cyan</span><i>→</i><span>Lock Vault</span><i>→</i><span>Exit</span></div>
      <dl>{terms.map(([term, meaning]) => <div key={term}><dt>{term}</dt><dd>{meaning}</dd></div>)}</dl>
      <p className="field-guide-example"><strong>At work</strong>Imagine withdrawing exposed customer-record access while keeping the ticketing system available. Separate permissions let you contain a problem without stopping every useful task.</p>
      <p className="field-guide-footnote">Patrols can catch you before the package. The package triggers a simulated key-copy event for this lesson; reading data does not itself copy credentials in real systems. Chips and dead ends add route choices. They are not security credentials.</p>
    </div>
  </details>;
}
