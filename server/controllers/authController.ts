import { Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { UserModel } from '../models/User.js'

const JWT_SECRET = process.env.JWT_SECRET || 'rukabet-secret-2026'

export function register(req: Request, res: Response) {
  try {
    const { phone, password, username } = req.body
    if (!phone || !password || !username) return res.status(400).json({ error: 'All fields required' })
    if (UserModel.findByPhone(phone)) return res.status(400).json({ error: 'Phone already registered' })
    
    const user = UserModel.create(phone, password, username)
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' })
    return res.json({ success: true, user, token })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
}

export function login(req: Request, res: Response) {
  try {
    const { phone, password } = req.body
    if (!phone || !password) return res.status(400).json({ error: 'Phone and password required' })
    
    const user = UserModel.findByPhone(phone)
    if (!user || !UserModel.verifyPassword(user, password)) return res.status(401).json({ error: 'Invalid credentials' })
    
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' })
    return res.json({ success: true, user: UserModel.toSafe(user), token })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
}

export function getMe(req: Request, res: Response) {
  try {
    const user = UserModel.findById((req as any).userId)
    if (!user) return res.status(404).json({ error: 'User not found' })
    return res.json({ success: true, user: UserModel.toSafe(user) })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
}
