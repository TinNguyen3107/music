// Isolated disposable browser-test instance. Never touches app/data or creates a real admin.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { scryptSync, randomBytes } from 'node:crypto';
import { createApp } from '../server/app.mjs';
const dataDir = mkdtempSync(path.join(tmpdir(), 'melodik-ui-test-'));
const { app, db } = await createApp({ dataDir, seedDefaultAccounts: false });
const salt = randomBytes(16).toString('hex');
db.native.prepare('INSERT INTO admin VALUES(1,?,?,?)').run('qa@example.test', scryptSync('Melodik-demo-only-2026', salt, 64).toString('hex'), salt);
app.listen(4001, '127.0.0.1', () => console.log('Isolated UI test: http://127.0.0.1:4001'));
