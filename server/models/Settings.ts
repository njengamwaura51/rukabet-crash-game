import db from '../database.js'

export interface Settings {
  id: number
  intasend_public_key: string | null
  intasend_secret_key: string | null
  company_name: string
  whatsapp_support: string
  min_deposit: number
  min_withdrawal: number
  updated_at: string
}

export class SettingsModel {
  static get(): Settings | null {
    const stmt = db.prepare('SELECT * FROM settings WHERE id = 1')
    return stmt.get() as Settings | null
  }

  static update(data: Partial<Settings>): Settings {
    const allowed = ['intasend_public_key', 'intasend_secret_key', 'company_name', 'whatsapp_support', 'min_deposit', 'min_withdrawal']
    const updates: string[] = []
    const values: any[] = []
    Object.entries(data).forEach(([key, value]) => {
      if (allowed.includes(key)) {
        updates.push(`${key} = ?`)
        values.push(value)
      }
    })
    if (updates.length === 0) throw new Error('No valid fields to update')
    values.push(new Date().toISOString())
    updates.push('updated_at = ?')
    const stmt = db.prepare(`UPDATE settings SET ${updates.join(', ')} WHERE id = 1`)
    stmt.run(...values)
    return this.get()!
  }

  static getIntaSendConfig(): { publicKey: string; secretKey: string; companyName: string } | null {
    const settings = this.get()
    if (!settings?.intasend_public_key || !settings?.intasend_secret_key) return null
    return {
      publicKey: settings.intasend_public_key,
      secretKey: settings.intasend_secret_key,
      companyName: settings.company_name
    }
  }
}
