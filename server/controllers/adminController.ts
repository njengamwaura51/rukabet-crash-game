import { Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { User } from '../models/User.js'
import { Bet } from '../models/Bet.js'
import { Deposit } from '../models/Deposit.js'
import { Withdrawal } from '../models/Withdrawal.js'
import { OddsControl } from '../models/OddsControl.js'
import { getOddsEngineState, applyOddsEngineRule, resetOddsEngineToNormal } from '../socket.js'

const JWT_SECRET = process.env.JWT_SECRET || 'rukabet-jwt-secret-2026'

function safeCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const aBuffer = Buffer.from(a)
  const bBuffer = Buffer.from(b)
  if (aBuffer.length !== bBuffer.length) return false
  return crypto.timingSafeEqual(aBuffer, bBuffer)
}

export async function adminLogin(req: Request, res: Response) {
  try {
    const { username, password } = req.body
    const validUser = process.env.ADMIN_USERNAME || 'pirate101'
    const validPass = process.env.ADMIN_PASSWORD || '117402'
    const validToken = process.env.ADMIN_TOKEN || '117402'

    const isMatch = (
      typeof username === 'string' &&
      typeof password === 'string' &&
      safeCompare(username.trim(), validUser) &&
      safeCompare(password, validPass)
    ) || (
      typeof password === 'string' &&
      safeCompare(password, validToken)
    )

    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid admin username or password' })
    }

    const token = jwt.sign({ role: 'admin', username: validUser }, JWT_SECRET, { expiresIn: '7d' })
    return res.json({
      success: true,
      token,
      admin: { username: validUser }
    })
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Login failed' })
  }
}

export async function getAdminOverview(req: Request, res: Response) {
  try {
    const [
      totalUsers,
      usersCreatedPast24Hours,
      totalBets,
      activeBets,
      completedDeposits,
      pendingDeposits,
      totalWithdrawals
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
      Bet.countDocuments(),
      Bet.countDocuments({ status: 'active' }),
      Deposit.countDocuments({ status: 'completed' }),
      Deposit.countDocuments({ status: 'pending' }),
      Withdrawal.countDocuments()
    ])

    const [totalDepositsAmountAgg, totalWageredAgg, totalWinsAgg, recentUsers, recentDeposits, recentWithdrawals, recentBets, topPlayers] = await Promise.all([
      Deposit.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Bet.aggregate([
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Bet.aggregate([
        { $match: { status: 'won' } },
        { $group: { _id: null, total: { $sum: '$winAmount' } } }
      ]),
      User.find({})
        .sort({ createdAt: -1 })
        .limit(10)
        .select('_id username phone balance createdAt'),
      Deposit.find({})
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('userId', 'username phone')
        .select('_id userId amount status apiRef createdAt'),
      Withdrawal.find({})
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('userId', 'username phone')
        .select('_id userId amount status phone createdAt'),
      Bet.find({})
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('userId', 'username phone')
        .select('_id userId roundId amount status multiplierCaught winAmount createdAt'),
      Bet.aggregate([
        {
          $group: {
            _id: '$userId',
            totalBetAmount: { $sum: '$amount' },
            totalWinAmount: { $sum: '$winAmount' },
            totalBets: { $sum: 1 }
          }
        },
        { $sort: { totalBetAmount: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user'
          }
        },
        {
          $project: {
            userId: '$_id',
            totalBetAmount: 1,
            totalWinAmount: 1,
            totalBets: 1,
            username: { $ifNull: [{ $arrayElemAt: ['$user.username', 0] }, 'Unknown'] },
            phone: { $ifNull: [{ $arrayElemAt: ['$user.phone', 0] }, 'N/A'] }
          }
        }
      ])
    ])

    const totalDepositsAmount = totalDepositsAmountAgg[0]?.total || 0
    const totalWagered = totalWageredAgg[0]?.total || 0
    const totalWins = totalWinsAgg[0]?.total || 0
    const houseGross = totalWagered - totalWins

    return res.json({
      success: true,
      overview: {
        totals: {
          users: totalUsers,
          newUsers24h: usersCreatedPast24Hours,
          bets: totalBets,
          activeBets,
          completedDeposits,
          pendingDeposits,
          totalWithdrawals,
          totalDepositsAmount,
          totalWagered,
          totalWins,
          houseGross
        },
        recentUsers,
        recentDeposits,
        recentWithdrawals,
        recentBets,
        topPlayers
      }
    })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
}

export async function getAdminUsers(req: Request, res: Response) {
  try {
    const { search, status, sortBy = 'createdAt', sortOrder = 'desc', page = '1', limit = '20' } = req.query
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1)
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20))
    const skip = (pageNum - 1) * limitNum

    const query: any = {}
    if (search && typeof search === 'string' && search.trim()) {
      const cleanSearch = search.trim().replace(/^0/, '')
      query.$or = [
        { phone: { $regex: cleanSearch, $options: 'i' } },
        { username: { $regex: search.trim(), $options: 'i' } }
      ]
    }
    if (status === 'frozen') {
      query.isFrozen = true
    } else if (status === 'active') {
      query.isFrozen = { $ne: true }
    }

    const sortObj: any = {}
    sortObj[sortBy as string] = sortOrder === 'asc' ? 1 : -1

    const [users, total] = await Promise.all([
      User.find(query).sort(sortObj).skip(skip).limit(limitNum).select('-password'),
      User.countDocuments(query)
    ])

    return res.json({
      success: true,
      users,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum)
    })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
}

export async function getAdminUserDetail(req: Request, res: Response) {
  try {
    const { id } = req.params
    const user = await User.findById(id).select('-password')
    if (!user) return res.status(404).json({ error: 'User not found' })

    const [recentBets, recentDeposits, recentWithdrawals, betsAgg] = await Promise.all([
      Bet.find({ userId: id }).sort({ createdAt: -1 }).limit(15),
      Deposit.find({ userId: id }).sort({ createdAt: -1 }).limit(15),
      Withdrawal.find({ userId: id }).sort({ createdAt: -1 }).limit(15),
      Bet.aggregate([
        { $match: { userId: user._id } },
        { $group: {
          _id: null,
          totalBets: { $sum: 1 },
          totalWagered: { $sum: '$amount' },
          totalWon: { $sum: '$winAmount' }
        }}
      ])
    ])

    const stats = {
      totalBets: betsAgg[0]?.totalBets || 0,
      totalWagered: betsAgg[0]?.totalWagered || 0,
      totalWon: betsAgg[0]?.totalWon || 0,
      netProfitLoss: (betsAgg[0]?.totalWon || 0) - (betsAgg[0]?.totalWagered || 0)
    }

    return res.json({
      success: true,
      user,
      stats,
      recentBets,
      recentDeposits,
      recentWithdrawals
    })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
}

export async function adjustUserBalance(req: Request, res: Response) {
  try {
    const { id } = req.params
    const { amount, type } = req.body
    const numAmount = Number(amount)
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number' })
    }
    if (type !== 'credit' && type !== 'debit') {
      return res.status(400).json({ error: 'Type must be credit or debit' })
    }

    const user = await User.findById(id)
    if (!user) return res.status(404).json({ error: 'User not found' })

    if (type === 'debit' && user.balance < numAmount) {
      return res.status(400).json({ error: `Cannot debit KSH ${numAmount}. User balance is only KSH ${user.balance}` })
    }

    const delta = type === 'credit' ? numAmount : -numAmount
    user.balance = Math.max(0, Math.round((user.balance + delta) * 100) / 100)
    await user.save()

    return res.json({
      success: true,
      message: `Successfully ${type}ed KSH ${numAmount}. New balance: KSH ${user.balance}`,
      user: {
        _id: user._id,
        username: user.username,
        phone: user.phone,
        balance: user.balance
      }
    })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
}

export async function adjustUserFreebet(req: Request, res: Response) {
  try {
    const { id } = req.params
    const { amount, freebetLocked } = req.body
    const user = await User.findById(id)
    if (!user) return res.status(404).json({ error: 'User not found' })

    if (amount !== undefined) {
      const num = Number(amount)
      if (Number.isFinite(num) && num >= 0) user.freebet = num
    }
    if (typeof freebetLocked === 'boolean') {
      user.freebetLocked = freebetLocked
    }
    await user.save()

    return res.json({
      success: true,
      message: 'Freebet updated successfully',
      user: {
        _id: user._id,
        freebet: user.freebet,
        freebetLocked: user.freebetLocked
      }
    })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
}

export async function toggleUserFreeze(req: Request, res: Response) {
  try {
    const { id } = req.params
    const user = await User.findById(id)
    if (!user) return res.status(404).json({ error: 'User not found' })

    const currentFrozen = !!(user as any).isFrozen
    ;(user as any).isFrozen = !currentFrozen
    await user.save()

    const statusMsg = !currentFrozen ? 'suspended' : 'activated'
    return res.json({
      success: true,
      message: `User account has been ${statusMsg}`,
      isFrozen: !currentFrozen
    })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
}

export async function resetUserPassword(req: Request, res: Response) {
  try {
    const { id } = req.params
    const { newPassword } = req.body
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 4) {
      return res.status(400).json({ error: 'New password must be at least 4 characters' })
    }

    const user = await User.findById(id)
    if (!user) return res.status(404).json({ error: 'User not found' })

    user.password = newPassword
    await user.save()

    return res.json({
      success: true,
      message: `Password reset successfully for ${user.username}`
    })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
}

export async function getAdminWithdrawals(req: Request, res: Response) {
  try {
    const { status = 'all' } = req.query
    const query: any = {}
    if (status && status !== 'all') {
      query.status = status
    }
    const withdrawals = await Withdrawal.find(query)
      .sort({ createdAt: -1 })
      .limit(60)
      .populate('userId', 'username phone balance')

    return res.json({ success: true, withdrawals })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
}

export async function updateWithdrawalStatus(req: Request, res: Response) {
  try {
    const { id } = req.params
    const { status } = req.body
    if (!['completed', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Status must be completed or rejected' })
    }

    const withdrawal = await Withdrawal.findById(id)
    if (!withdrawal) return res.status(404).json({ error: 'Withdrawal not found' })

    // If rejecting a pending withdrawal, refund user's balance!
    if (withdrawal.status === 'pending' && status === 'rejected') {
      await User.findByIdAndUpdate(withdrawal.userId, {
        $inc: { balance: withdrawal.amount }
      })
    }

    withdrawal.status = status
    await withdrawal.save()

    return res.json({
      success: true,
      message: status === 'rejected' 
        ? `Withdrawal of KSH ${withdrawal.amount} rejected and balance refunded to user`
        : `Withdrawal marked as completed`,
      withdrawal
    })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   ADMIN ODDS ENGINE CONTROLS
   Manage multiplier range rules, scheduled reward windows, and reset to normal
   ═══════════════════════════════════════════════════════════════════════════ */

export async function getOddsEngineConfig(req: Request, res: Response) {
  try {
    const liveState = getOddsEngineState()
    const doc = await OddsControl.getOddsControl()
    return res.json({
      success: true,
      state: liveState,
      config: doc,
      auditLogs: (doc.auditLogs || []).slice(-30).reverse()
    })
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to fetch odds engine config' })
  }
}

export async function setOddsEngineRule(req: Request, res: Response) {
  try {
    const {
      mode = 'range',
      minMultiplier = 2.0,
      maxMultiplier = 5.0,
      exactMultiplier,
      durationType = 'minutes',
      durationMinutes = 15,
      roundsTotal = 10,
      scheduledStartTime,
      scheduledEndTime,
      note
    } = req.body

    const parsedMin = Math.max(1.01, Number(minMultiplier) || 2.0)
    const parsedMax = Math.min(200, Math.max(parsedMin, Number(maxMultiplier) || 5.0))

    if (mode === 'exact' && (!exactMultiplier || Number(exactMultiplier) < 1.01)) {
      return res.status(400).json({ error: 'Exact multiplier must be at least 1.01' })
    }

    if (parsedMin < 1.01) {
      return res.status(400).json({ error: 'Minimum multiplier must be at least 1.01' })
    }

    if (mode === 'range' && parsedMax < parsedMin) {
      return res.status(400).json({ error: 'Maximum multiplier must be greater than or equal to minimum' })
    }

    const updatedState = await applyOddsEngineRule({
      mode,
      minMultiplier: parsedMin,
      maxMultiplier: parsedMax,
      exactMultiplier: exactMultiplier ? Number(exactMultiplier) : undefined,
      durationType,
      durationMinutes: Math.max(1, Number(durationMinutes) || 15),
      roundsTotal: Math.max(1, Number(roundsTotal) || 10),
      scheduledStartTime: scheduledStartTime ? new Date(scheduledStartTime) : undefined,
      scheduledEndTime: scheduledEndTime ? new Date(scheduledEndTime) : undefined,
      activatedBy: (req as any).admin?.username || 'admin',
      note: note || `Admin set ${mode} [${parsedMin}x - ${parsedMax}x]`
    })

    return res.json({
      success: true,
      message: `Odds Engine active: ${mode} [${parsedMin}x - ${parsedMax}x]`,
      state: updatedState
    })
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to set odds engine rule' })
  }
}

export async function resetOddsEngine(req: Request, res: Response) {
  try {
    const { reason = 'Admin manual reset' } = req.body || {}
    const updatedState = await resetOddsEngineToNormal(reason)
    return res.json({
      success: true,
      message: 'Odds engine successfully reset to standard provably fair mode',
      state: updatedState
    })
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to reset odds engine' })
  }
}
