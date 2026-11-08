import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
export function openDatabase(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS worker_identities (
      id TEXT PRIMARY KEY, account_id TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY, customer_account_id TEXT NOT NULL, criteria_json TEXT NOT NULL CHECK(json_valid(criteria_json)),
      input_hash TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('draft','indexed')) DEFAULT 'draft',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id), worker_id TEXT NOT NULL REFERENCES worker_identities(id),
      artifact_key TEXT NOT NULL, content_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS verification_results (
      id TEXT PRIMARY KEY, submission_id TEXT NOT NULL REFERENCES submissions(id), verifier_account_id TEXT NOT NULL,
      passed INTEGER NOT NULL CHECK(passed IN (0,1)), evidence_hash TEXT NOT NULL, test_version TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS challenges (
      id TEXT PRIMARY KEY, submission_id TEXT NOT NULL REFERENCES submissions(id), challenger_account_id TEXT NOT NULL,
      evidence_hash TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('submitted','accepted','rejected')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS transaction_references (
      id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id), network TEXT NOT NULL CHECK(network = 'testnet'),
      transaction_hash TEXT NOT NULL UNIQUE, action TEXT NOT NULL, indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  const columns = db.prepare('PRAGMA table_info(jobs)').all();
  if (!columns.some(column => column.name === 'local_run_json')) {
    db.exec('ALTER TABLE jobs ADD COLUMN local_run_json TEXT CHECK(json_valid(local_run_json))');
  }
  db.exec('PRAGMA user_version = 2');
  return db;
}
