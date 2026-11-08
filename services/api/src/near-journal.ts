import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { IntentError, sequences, type Intent, type Mode } from './near-intents.js';
import { txHashPattern } from './near-rpc.js';

export interface Entry {
  id: string;
  scope: string;
  intent: Intent;
  status: 'prepared' | 'pending' | 'finalized' | 'failed';
  hash: string | null;
  result: Record<string, unknown> | null;
}

export class NearJournal {
  constructor(private readonly db: DatabaseSync) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS near_job_links (
        local_id TEXT PRIMARY KEY REFERENCES jobs(id), chain_id TEXT NOT NULL UNIQUE, mode TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS near_intents (
        id TEXT PRIMARY KEY, scope TEXT NOT NULL, method TEXT NOT NULL, intent TEXT NOT NULL,
        status TEXT NOT NULL, hash TEXT UNIQUE, result TEXT, UNIQUE(scope, method)
      );
    `);
  }

  private decode(row: Record<string, unknown>): Entry {
    return { id: String(row.id), scope: String(row.scope), intent: JSON.parse(String(row.intent)),
      status: row.status as Entry['status'], hash: row.hash as string | null,
      result: row.result ? JSON.parse(String(row.result)) : null };
  }

  entry(id: string) {
    const row = this.db.prepare('SELECT * FROM near_intents WHERE id = ?').get(id);
    if (!row) throw new IntentError('Unsigned intent not found', 404);
    return this.decode(row);
  }

  list(scope: string) {
    return this.db.prepare('SELECT * FROM near_intents WHERE scope = ? ORDER BY rowid').all(scope).map(row => this.decode(row));
  }

  link(localId: string) {
    return this.db.prepare('SELECT chain_id, mode FROM near_job_links WHERE local_id = ?').get(localId) as
      { chain_id: string; mode: Mode } | undefined;
  }

  prepare(scope: string, intent: Intent) {
    const entries = this.list(scope);
    const existing = entries.find(entry => entry.intent.method === intent.method);
    if (existing) {
      if (existing.intent.mode !== intent.mode || existing.intent.signer !== intent.signer) throw new IntentError('An incompatible intent already exists');
      return existing;
    }
    if (entries.some(entry => entry.status !== 'finalized')) throw new IntentError('Reconcile the previous intent before preparing a dependent action');
    if (sequences[intent.mode][entries.length] !== intent.method) throw new IntentError('Prepare only the next action in the workflow');
    const id = randomUUID();
    this.db.prepare("INSERT INTO near_intents (id,scope,method,intent,status) VALUES (?,?,?,?,'prepared')")
      .run(id, scope, intent.method, JSON.stringify(intent));
    return this.entry(id);
  }

  register(id: string, hash: string) {
    if (!txHashPattern.test(hash)) throw new IntentError('Invalid transaction hash', 400);
    const existing = this.entry(id);
    if (existing.hash && existing.hash !== hash) throw new IntentError('An existing hash must be reconciled; replacement is blocked');
    if (existing.hash === hash) return existing;
    if (this.db.prepare('SELECT id FROM near_intents WHERE hash = ?').get(hash)) throw new IntentError('Transaction hash already registered');
    this.db.prepare("UPDATE near_intents SET hash = ?, status = 'pending' WHERE id = ?").run(hash, id);
    return this.entry(id);
  }

  complete(id: string, result: Record<string, unknown> & { status: 'finalized' | 'failed'; job_id?: string }) {
    const entry = this.entry(id);
    if (entry.status !== 'pending' || !entry.hash) throw new IntentError('Only registered pending intents may be completed');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (entry.intent.method === 'create_job' && result.status === 'finalized') {
        if (!result.job_id) throw new IntentError('Final creation has no job mapping');
        if (this.db.prepare('SELECT local_id FROM near_job_links WHERE chain_id = ?').get(result.job_id)) {
          throw new IntentError('Finalized onchain job already belongs to another local job');
        }
        this.db.prepare('INSERT INTO near_job_links VALUES (?,?,?)').run(entry.scope, result.job_id, entry.intent.mode);
        this.db.prepare("UPDATE jobs SET status = 'indexed' WHERE id = ?").run(entry.scope);
      }
      if (entry.scope !== 'cleanup:0') {
        this.db.prepare(`INSERT INTO transaction_references (id, job_id, network, transaction_hash, action)
          VALUES (?, ?, 'testnet', ?, ?)`).run(id, entry.scope, entry.hash, entry.intent.method);
      }
      this.db.prepare('UPDATE near_intents SET status = ?, result = ? WHERE id = ?')
        .run(result.status, JSON.stringify(result), id);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return this.entry(id);
  }
}
