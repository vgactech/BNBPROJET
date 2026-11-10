import { DatabaseSync } from 'node:sqlite';
import type { AuditReport } from './auditor.ts';

export type StoredAudit = AuditReport & { reviewApproved: boolean; rewardState: string; recipient: string | null; transactionHash: string | null };
export class AuditStore {
  readonly db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS audits (id TEXT PRIMARY KEY, report TEXT NOT NULL,
      review_approved INTEGER NOT NULL DEFAULT 0, recipient TEXT,
      reward_state TEXT NOT NULL DEFAULT 'unreviewed', transaction_hash TEXT);`);
  }
  private decode(row: Record<string, unknown> | undefined): StoredAudit | null {
    if (!row) return null;
    return { ...JSON.parse(String(row.report)) as AuditReport, reviewApproved: row.review_approved === 1,
      rewardState: String(row.reward_state), recipient: row.recipient as string | null, transactionHash: row.transaction_hash as string | null };
  }
  get(id: string): StoredAudit | null { return this.decode(this.db.prepare('SELECT * FROM audits WHERE id = ?').get(id)); }
  list(): StoredAudit[] { return this.db.prepare('SELECT * FROM audits ORDER BY rowid DESC LIMIT 50').all().map(row => this.decode(row)!); }
  save(report: AuditReport): StoredAudit {
    this.db.prepare('INSERT OR IGNORE INTO audits (id, report) VALUES (?, ?)').run(report.id, JSON.stringify(report));
    return this.get(report.id)!;
  }
  review(id: string, approved: boolean, recipient: string | null): StoredAudit | null {
    const report = this.get(id);
    if (!report) return null;
    if (['sending', 'submitted', 'uncertain'].includes(report.rewardState)) throw new Error('locked');
    const eligible = approved && report.rewardEligible && report.findings.length > 0;
    this.db.prepare("UPDATE audits SET review_approved=?, recipient=?, reward_state=? WHERE id=? AND reward_state NOT IN ('sending','submitted','uncertain')")
      .run(eligible ? 1 : 0, recipient, eligible ? 'pending' : 'rejected', id);
    return this.get(id);
  }
  reserveReward(id: string, recipient: string): boolean {
    return this.db.prepare("UPDATE audits SET reward_state='sending', recipient=? WHERE id=? AND review_approved=1 AND reward_state='pending' AND (recipient IS NULL OR recipient=?)")
      .run(recipient, id, recipient).changes === 1;
  }
  recordSubmitted(id: string, transactionHash: string): void {
    this.db.prepare("UPDATE audits SET reward_state='submitted', transaction_hash=? WHERE id=? AND reward_state='sending'").run(transactionHash, id);
  }
  recordUncertain(id: string): void { this.db.prepare("UPDATE audits SET reward_state='uncertain' WHERE id=? AND reward_state='sending'").run(id); }
  close(): void { this.db.close(); }
}
