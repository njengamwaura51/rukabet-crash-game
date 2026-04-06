import db from '../database.js'
export interface Deposit {
  id: number; user_id: number; phone: string; amount: number; api_ref: string
  status: 'pending'|'completed'|'failed'; intasend_invoice_id: string|null
  intasend_tracking_id: string|null; created_at: string; completed_at: string|null
}
export class DepositModel {
  static create(userId: number, phone: string, amount: number, apiRef: string): Deposit {
    const stmt = db.prepare(`INSERT INTO deposits (user_id, phone, amount, api_ref, status) VALUES (?, ?, ?, ?, 'pending')`)
    const info = stmt.run(userId, phone, amount, apiRef)
    return this.findById(info.lastInsertRowid as number)!
  }
  static findById(id: number): Deposit|null {
    return db.prepare('SELECT * FROM deposits WHERE id = ?').get(id) as Deposit|null
  }
  static findByApiRef(apiRef: string): Deposit|null {
    return db.prepare('SELECT * FROM deposits WHERE api_ref = ?').get(apiRef) as Deposit|null
  }
  static updateStatus(id: number, status: 'completed'|'failed', invoiceId?: string, trackingId?: string): void {
    db.prepare(`UPDATE deposits SET status=?, completed_at=?, intasend_invoice_id=COALESCE(?,intasend_invoice_id), intasend_tracking_id=COALESCE(?,intasend_tracking_id) WHERE id=?`)
      .run(status, new Date().toISOString(), invoiceId||null, trackingId||null, id)
  }
}
