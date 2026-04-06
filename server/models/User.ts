import db from '../database.js'
import bcrypt from 'bcryptjs'

export interface User {
  id: number
  phone: string
  password: string
  username: string
  balance: number
  freebet: number
  freebet_locked: number
  has_played_with_money: number
  created_at: string
  updated_at: string
}

export interface SafeUser extends Omit<User, 'password'> {}

export class UserModel {
  static findByPhone(phone: string): User | null {
    const stmt = db.prepare('SELECT * FROM users WHERE phone = ?')
    return stmt.get(phone) as User | null
  }

  static findById(id: number): User | null {
    const stmt = db.prepare('SELECT * FROM users WHERE id = ?')
    return stmt.get(id) as User | null
  }

  static create(phone: string, password: string, username: string): SafeUser {
    const hashedPassword = bcrypt.hashSync(password, 10)
    const stmt = db.prepare(`INSERT INTO users (phone, password, username, balance, freebet, freebet_locked) VALUES (?, ?, ?, 0, 150, 1)`)
    const info = stmt.run(phone, hashedPassword, username)
    const user = this.findById(info.lastInsertRowid as number)!
    return this.toSafe(user)
  }

  static verifyPassword(user: User, password: string): boolean {
    return bcrypt.compareSync(password, user.password)
  }

  static updateBalance(userId: number, amount: number): void {
    const stmt = db.prepare('UPDATE users SET balance = balance + ?, updated_at = ? WHERE id = ?')
    stmt.run(amount, new Date().toISOString(), userId)
  }

  static toSafe(user: User): SafeUser {
    const { password, ...safe } = user
    return safe
  }
}
