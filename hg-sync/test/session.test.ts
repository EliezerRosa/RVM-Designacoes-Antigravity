import test from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { config } from '../src/config.js';
import { hgSession } from '../src/hg/session.js';

test('Config - sessionDir is consolidated inside hg-sync/data/hourglass_session', () => {
  const normalized = config.sessionDir.replace(/\\/g, '/');
  assert.ok(
    normalized.endsWith('hg-sync/data/hourglass_session'),
    `Expected sessionDir to end with hg-sync/data/hourglass_session, got: ${normalized}`
  );
  assert.equal(path.basename(config.sessionDir), 'hourglass_session');
});

test('HgSessionManager - getSessionStatus does not launch headless Chrome when unauthenticated', async () => {
  const status = await hgSession.getSessionStatus(false);
  assert.equal(typeof status.authenticated, 'boolean');
  assert.equal(status.loggingIn, false);
  assert.equal(status.cdpReachable, false);
  assert.ok(status.chromePath.toLowerCase().includes('chrome.exe'));
  assert.ok(status.sessionDir.replace(/\\/g, '/').endsWith('hg-sync/data/hourglass_session'));
});
