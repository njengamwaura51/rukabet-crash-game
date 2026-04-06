import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { User } from '../models/UserMongo.js'
import { Settings } from '../models/SettingsMongo.js'

const JWT_SECRET = process.env.JWT_SECRET || 'rukabet-jwt-secret-2026'

export interface AuthRequest extends Request {
  user?: any
  userId?: string
}

export async function authMiddlewareMongo(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' })
    }

    const token = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string }
    
    const user = await User.findById(decoded.userId)
    if (!user) {
      return res.status(401).json({ error: 'User not found' })
    }

    req.user = user
    req.userId = decoded.userId
    next()
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' })
  }
}

export async function adminMiddlewareMongo(req: Request, res: Response, next: NextFunction) {
  try {
    const adminToken = req.headers['x-admin-token'] as string
    const settings = await Settings.findOne()
    
    const validToken = settings?.adminToken || process.env.ADMIN_TOKEN || 'rukabet-admin-2026'
    
    if (!adminToken || adminToken !== validToken) {
      return res.status(403).json({ error: 'Admin access required' })
    }
    
    next()
  } catch (error) {
    return res.status(500).json({ error: 'Auth check failed' })
  }
}
