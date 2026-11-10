import { DatabaseSync } from 'node:sqlite';
import type { AuditReport } from './auditor.ts';

export type StoredAudit = AuditReport & { reviewApproved: boolean; rewardState: string; recipient: string | null; transactionHash: string | null; receiptBlockNumber: string | null; rewardAmountWei: string | null };
export class AuditStore {
  readonly db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS audits (id TEXT PRIMARY KEY, report TEXT NOT NULL,
      review_approved INTEGER NOT NULL DEFAULT 0, recipient TEXT,
      reward_state TEXT NOT NULL DEFAULT 'unreviewed', transaction_hash TEXT, receipt_block_number TEXT, reward_amount_wei TEXT);`);
    const columns = this.db.prepare('PRAGMA table_info(audits)').all();
    if (!columns.some(column => column.name === 'receipt_block_number')) this.db.exec('ALTER TABLE audits ADD COLUMN receipt_block_number TEXT');
    if (!columns.some(column => column.name === 'reward_amount_wei')) this.db.exec('ALTER TABLE audits ADD COLUMN reward_amount_wei TEXT');
  }
  private decode(row: Record<string, unknown> | undefined): StoredAudit | null {
    if (!row) return null;
    return { ...JSON.parse(String(row.report)) as AuditReport, reviewApproved: row.review_approved === 1,
      rewardState: String(row.reward_state), recipient: row.recipient as string | null, transactionHash: row.transaction_hash as string | null, receiptBlockNumber: row.receipt_block_number as string | null, rewardAmountWei: row.reward_amount_wei as string | null };
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
    if (['sending', 'submitted', 'uncertain', 'paid', 'reverted'].includes(report.rewardState)) throw new Error('locked');
    const eligible = approved && report.rewardEligible && report.findings.length > 0;
    const updated = this.db.prepare("UPDATE audits SET review_approved=?, recipient=?, reward_state=? WHERE id=? AND reward_state NOT IN ('sending','submitted','uncertain','paid','reverted')")
      .run(eligible ? 1 : 0, recipient, eligible ? 'pending' : 'rejected', id);
    if (updated.changes !== 1) throw new Error('locked');
    return this.get(id);
  }
  reserveReward(id: string, recipient: string, amountWei: bigint): boolean {
    return this.db.prepare("UPDATE audits SET reward_state='sending', recipient=?, reward_amount_wei=? WHERE id=? AND review_approved=1 AND reward_state='pending' AND (recipient IS NULL OR recipient=?)")
      .run(recipient, amountWei.toString(), id, recipient).changes === 1;
  }
  recordSubmitted(id: string, transactionHash: string): void {
    this.db.prepare("UPDATE audits SET reward_state='submitted', transaction_hash=? WHERE id=? AND reward_state='sending'").run(transactionHash, id);
  }
  recordUncertain(id: string): void { this.db.prepare("UPDATE audits SET reward_state='uncertain' WHERE id=? AND reward_state='sending'").run(id); }
  recordReceipt(id: string, transactionHash: string, state: 'paid' | 'reverted', blockNumber: string): void {
    this.db.prepare("UPDATE audits SET reward_state=?, receipt_block_number=? WHERE id=? AND reward_state='submitted' AND transaction_hash=?").run(state, blockNumber, id, transactionHash);
  }
  close(): void { this.db.close(); }
}
