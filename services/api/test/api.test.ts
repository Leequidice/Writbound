import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';
import { readConfig } from '../src/config.js';
test('HTTP health, validation, errors and SQLite relationships', async () => {
  const db = openDatabase(':memory:');
  const server = createApp(db).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');
  const base = `http://127.0.0.1:${addr.port}`;
  try {
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).database, 'ready');
    assert.equal((await fetch(`${base}/health?bad=1`)).status, 400);
    assert.equal((await fetch(`${base}/missing`)).status, 404);
    assert.equal((await fetch(`${base}/health`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' })).status, 400);
    assert.equal((await fetch(`${base}/health`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({data: 'x'.repeat(17000)}) })).status, 413);
    const names = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(row => row.name);
    assert.deepEqual(names, ['challenges','jobs','submissions','transaction_references','verification_results','worker_identities']);
    assert.throws(() => db.prepare("INSERT INTO submissions VALUES ('s','missing','missing','a','hash',CURRENT_TIMESTAMP)").run(), /FOREIGN KEY/);
    db.close();
    assert.equal((await fetch(`${base}/health`)).status, 500);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); if (db.isOpen) db.close(); }
});
test('configuration rejects invalid ports and non-testnet networks', () => {
  for (const PORT of ['0','65536','abc','1.5']) assert.throws(() => readConfig({PORT}));
  assert.throws(() => readConfig({NEAR_NETWORK:'mainnet'}));
  assert.throws(() => readConfig({HOST:'0.0.0.0'}));
  assert.equal(readConfig({}).port, 3001);
});
