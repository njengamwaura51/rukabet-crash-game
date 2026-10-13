import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { User } from '../models/User.js';
import { Bet } from '../models/Bet.js';
import { Deposit } from '../models/Deposit.js';
import { Withdrawal } from '../models/Withdrawal.js';
const JWT_SECRET = process.env.JWT_SECRET || 'rukabet-jwt-secret-2026';
function safeCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string')
        return false;
    const aBuffer = Buffer.from(a);
    const bBuffer = Buffer.from(b);
    if (aBuffer.length !== bBuffer.length)
        return false;
    return crypto.timingSafeEqual(aBuffer, bBuffer);
}
export async function adminLogin(req, res) {
    try {
        const { username, password } = req.body;
        const validUser = process.env.ADMIN_USERNAME || 'pirate101';
        const validPass = process.env.ADMIN_PASSWORD || '117402';
        const validToken = process.env.ADMIN_TOKEN || '117402';
        const isMatch = (typeof username === 'string' &&
            typeof password === 'string' &&
            safeCompare(username.trim(), validUser) &&
            safeCompare(password, validPass)) || (typeof password === 'string' &&
            safeCompare(password, validToken));
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid admin username or password' });
        }
        const token = jwt.sign({ role: 'admin', username: validUser }, JWT_SECRET, { expiresIn: '7d' });
        return res.json({
            success: true,
            token,
            admin: { username: validUser }
        });
    }
    catch (error) {
        return res.status(500).json({ error: error.message || 'Login failed' });
    }
}
export async function getAdminOverview(req, res) {
    try {
        const [totalUsers, usersCreatedPast24Hours, totalBets, activeBets, completedDeposits, pendingDeposits, totalWithdrawals] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
            Bet.countDocuments(),
            Bet.countDocuments({ status: 'active' }),
            Deposit.countDocuments({ status: 'completed' }),
            Deposit.countDocuments({ status: 'pending' }),
            Withdrawal.countDocuments()
        ]);
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
        ]);
        const totalDepositsAmount = totalDepositsAmountAgg[0]?.total || 0;
        const totalWagered = totalWageredAgg[0]?.total || 0;
        const totalWins = totalWinsAgg[0]?.total || 0;
        const houseGross = totalWagered - totalWins;
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
        });
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
