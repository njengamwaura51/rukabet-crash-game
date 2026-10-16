import { Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { User } from '../models/User.js'
import { AuthRequest } from '../middleware/auth.js'

const JWT_SECRET = process.env.JWT_SECRET || 'rukabet-jwt-secret-2026'
const JWT_EXPIRES_IN = '30d'

export async function register(req: Request, res: Response) {
  try {
    const { phone, password, username, referralCode } = req.body

    if (!phone || !password || !username) {
      return res.status(400).json({ error: 'Phone, password, and username are required' })
    }

    // Normalize phone (remove leading 0, ensure 9 digits)
    const normalizedPhone = phone.replace(/^0/, '').slice(-9)

    // Check if user exists
    const existingUser = await User.findOne({ phone: normalizedPhone })
    if (existingUser) {
      return res.status(400).json({ error: 'Phone number already registered' })
    }

    let referrerUser = null
    if (referralCode && typeof referralCode === 'string') {
      const cleanRef = referralCode.trim()
      const refDigits = cleanRef.replace(/\D/g, '')
      const refLast9 = refDigits.length >= 9 ? refDigits.slice(-9) : null
      
      const queryOr: any[] = [
        { username: { $regex: `^${cleanRef}$`, $options: 'i' } }
      ]
      if (refLast9) {
        queryOr.push({ phone: refLast9 })
      }
      if (cleanRef.length === 24 && /^[0-9a-fA-F]{24}$/.test(cleanRef)) {
        queryOr.push({ _id: cleanRef })
      }

      referrerUser = await User.findOne({ $or: queryOr })
    }

    // Create user
    const user = await User.create({
      phone: normalizedPhone,
      password,
      username: username.slice(0, 20),
      referredBy: referrerUser ? referrerUser._id : null
    })

    if (referrerUser) {
      await User.findByIdAndUpdate(referrerUser._id, { $inc: { referralsCount: 1 } })
      console.log(`🤝 Referral tracked: User ${normalizedPhone} referred by ${referrerUser.phone} (${referrerUser.username})`)
    }

    // Generate token
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })

    // Return user without password
    const userObj = user.toObject()
    delete (userObj as any).password

    return res.status(201).json({
      success: true,
      user: userObj,
      token
    })
  } catch (error: any) {
    console.error('Register error:', error)
    return res.status(500).json({ error: error.message || 'Registration failed' })
  }
}

export async function login(req: Request, res: Response) {
  try {
    const { phone, password } = req.body

    if (!phone || !password) {
      return res.status(400).json({ error: 'Phone and password are required' })
    }

    const normalizedPhone = phone.replace(/^0/, '').slice(-9)
    const user = await User.findOne({ phone: normalizedPhone })

    if (!user || !user.comparePassword(password)) {
      return res.status(401).json({ error: 'Invalid phone or password' })
    }

    if ((user as any).isFrozen) {
      return res.status(403).json({ error: 'Your account has been suspended. Please contact support.' })
    }

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })

    const userObj = user.toObject()
    delete (userObj as any).password

    return res.json({
      success: true,
      user: userObj,
      token
    })
  } catch (error: any) {
    console.error('Login error:', error)
    return res.status(500).json({ error: error.message || 'Login failed' })
  }
}

export async function getMe(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' })
    }

    const userObj = req.user.toObject()
    delete (userObj as any).password

    return res.json({
      success: true,
      user: userObj
    })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
}

export async function changePassword(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' })
    }

    const { currentPassword, newPassword } = req.body

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' })
    }

    if (typeof newPassword !== 'string' || newPassword.length < 4) {
      return res.status(400).json({ error: 'New password must be at least 4 characters' })
    }

    if (!req.user.comparePassword(currentPassword)) {
      return res.status(400).json({ error: 'Current password is incorrect' })
    }

    req.user.password = newPassword
    await req.user.save()

    return res.json({
      success: true,
      message: 'Password changed successfully'
    })
  } catch (error: any) {
    console.error('Change password error:', error)
    return res.status(500).json({ error: error.message || 'Failed to update password' })
  }
}
