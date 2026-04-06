import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'rukabet-secret-2026'

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' })
    
    const token = authHeader.substring(7)
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number }
    ;(req as any).userId = decoded.userId
    next()
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' })
  }
}

export function adminMiddleware(req: Request, res: Response, next: NextFunction) {
  const adminToken = req.headers['x-admin-token']
  if (adminToken !== 'rukabet-admin-2026') return res.status(403).json({ error: 'Admin access required' })
  next()
}
