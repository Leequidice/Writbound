import { readConfig } from './config.js';
import { openDatabase } from './db.js';
import { createApp } from './app.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NearReader, defaultRpc, loadApprovedRoles } from './near-rpc.js';
const config = readConfig();
const db = openDatabase(config.databasePath);
const root = fileURLToPath(new URL('../../../', import.meta.url));
const venvPython = process.platform === 'win32'
  ? join(root, '.venv', 'Scripts', 'python.exe')
  : join(root, '.venv', 'bin', 'python');
const workspace = process.env.WRITBOUND_WORKSPACE ?? fileURLToPath(new URL('../../../data/worker/', import.meta.url));
const roles = loadApprovedRoles(root);
const reader = new NearReader(process.env.WRITBOUND_NEAR_RPC ?? defaultRpc, roles);
const server = createApp(db, {
  projectRoot: root,
  workspace,
  python: process.env.WRITBOUND_PYTHON ?? (existsSync(venvPython) ? venvPython : 'python'),
  model: process.env.WRITBOUND_MODEL ?? 'qwen2.5:3b',
}, { reader, projectRoot: root, workspace }).listen(config.port, config.host, () => console.log(`Writbound API: http://${config.host}:${config.port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
