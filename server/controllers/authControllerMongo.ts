import { Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { User } from '../models/UserMongo.js'
import { AuthRequest } from '../middleware/authMongo.js'

const JWT_SECRET = process.env.JWT_SECRET || 'rukabet-jwt-secret-2026'
const JWT_EXPIRES_IN = '30d'

export async function registerMongo(req: Request, res: Response) {
  try {
    const { phone, password, username } = req.body

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

    // Create user
    const user = await User.create({
      phone: normalizedPhone,
      password,
      username: username.slice(0, 20)
    })

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

export async function loginMongo(req: Request, res: Response) {
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

export async function getMeMongo(req: AuthRequest, res: Response) {
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
