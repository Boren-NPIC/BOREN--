import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const rules = fs.readFileSync('firestore.rules', 'utf8');
const blueprint = JSON.parse(fs.readFileSync('firebase-blueprint.json', 'utf8'));

test('firestore.rules enforces default-deny catch-all and rules_version 2', () => {
  assert.match(rules, /rules_version\s*=\s*'2';/);
  assert.match(rules, /match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;\s*\}/);
});

test('every collection in firebase-blueprint.json has an explicit match block in firestore.rules', () => {
  const paths = Object.keys(blueprint.firestore);
  assert.equal(paths.length, 15);
  for (const colPath of paths) {
    const colName = colPath.split('/')[1];
    assert.ok(
      rules.includes(`match /${colName}/{`),
      `Missing match block for collection: ${colName}`
    );
  }
});

test('Dirty Dozen security invariants are structurally enforced in firestore.rules', () => {
  // 1. Admin email check requires email_verified == true
  assert.match(rules, /request\.auth\.token\.email_verified == true/);
  // 2. Users cannot self-modify role or status
  assert.match(rules, /affectedKeys\(\)\.hasOnly\(\['displayName', 'photoURL', 'updatedAt'\]\)/);
  // 3. Users cannot self-approve payments or delete payments
  assert.match(rules, /match \/payments\/\{paymentId\}[\s\S]*incoming\(\)\.status == 'pending'/);
  assert.match(rules, /match \/payments\/\{paymentId\}[\s\S]*allow delete: if false;/);
  // 4. Subscriptions are strictly admin-writable
  assert.match(rules, /match \/subscriptions\/\{subscriptionId\}[\s\S]*allow create: if isValidId\(subscriptionId\) && isAdmin\(\)/);
  // 5. Audit logs are immutable append-only
  assert.match(rules, /match \/audit_logs\/\{logId\}[\s\S]*allow update: if false;[\s\S]*allow delete: if false;/);
  // 6. Creators must confirm rights and start in pending status
  assert.match(rules, /incoming\(\)\.rightsConfirmed == true/);
  // 7. No blanket allow list: if isSignedIn()
  assert.doesNotMatch(rules, /allow list:\s*if isSignedIn\(\);/);
});
