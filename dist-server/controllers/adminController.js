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
export async function getAdminUsers(req, res) {
    try {
        const { search, status, sortBy = 'createdAt', sortOrder = 'desc', page = '1', limit = '20' } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
        const skip = (pageNum - 1) * limitNum;
        const query = {};
        if (search && typeof search === 'string' && search.trim()) {
            const cleanSearch = search.trim().replace(/^0/, '');
            query.$or = [
                { phone: { $regex: cleanSearch, $options: 'i' } },
                { username: { $regex: search.trim(), $options: 'i' } }
            ];
        }
        if (status === 'frozen') {
            query.isFrozen = true;
        }
        else if (status === 'active') {
            query.isFrozen = { $ne: true };
        }
        const sortObj = {};
        sortObj[sortBy] = sortOrder === 'asc' ? 1 : -1;
        const [users, total] = await Promise.all([
            User.find(query).sort(sortObj).skip(skip).limit(limitNum).select('-password'),
            User.countDocuments(query)
        ]);
        return res.json({
            success: true,
            users,
            total,
            page: pageNum,
            totalPages: Math.ceil(total / limitNum)
        });
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
export async function getAdminUserDetail(req, res) {
    try {
        const { id } = req.params;
        const user = await User.findById(id).select('-password');
        if (!user)
            return res.status(404).json({ error: 'User not found' });
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
                    } }
            ])
        ]);
        const stats = {
            totalBets: betsAgg[0]?.totalBets || 0,
            totalWagered: betsAgg[0]?.totalWagered || 0,
            totalWon: betsAgg[0]?.totalWon || 0,
            netProfitLoss: (betsAgg[0]?.totalWon || 0) - (betsAgg[0]?.totalWagered || 0)
        };
        return res.json({
            success: true,
            user,
            stats,
            recentBets,
            recentDeposits,
            recentWithdrawals
        });
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
export async function adjustUserBalance(req, res) {
    try {
        const { id } = req.params;
        const { amount, type } = req.body;
        const numAmount = Number(amount);
        if (!Number.isFinite(numAmount) || numAmount <= 0) {
            return res.status(400).json({ error: 'Amount must be a positive number' });
        }
        if (type !== 'credit' && type !== 'debit') {
            return res.status(400).json({ error: 'Type must be credit or debit' });
        }
        const user = await User.findById(id);
        if (!user)
            return res.status(404).json({ error: 'User not found' });
        if (type === 'debit' && user.balance < numAmount) {
            return res.status(400).json({ error: `Cannot debit KSH ${numAmount}. User balance is only KSH ${user.balance}` });
        }
        const delta = type === 'credit' ? numAmount : -numAmount;
        user.balance = Math.max(0, Math.round((user.balance + delta) * 100) / 100);
        await user.save();
        return res.json({
            success: true,
            message: `Successfully ${type}ed KSH ${numAmount}. New balance: KSH ${user.balance}`,
            user: {
                _id: user._id,
                username: user.username,
                phone: user.phone,
                balance: user.balance
            }
        });
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
export async function adjustUserFreebet(req, res) {
    try {
        const { id } = req.params;
        const { amount, freebetLocked } = req.body;
        const user = await User.findById(id);
        if (!user)
            return res.status(404).json({ error: 'User not found' });
        if (amount !== undefined) {
            const num = Number(amount);
            if (Number.isFinite(num) && num >= 0)
                user.freebet = num;
        }
        if (typeof freebetLocked === 'boolean') {
            user.freebetLocked = freebetLocked;
        }
        await user.save();
        return res.json({
            success: true,
            message: 'Freebet updated successfully',
            user: {
                _id: user._id,
                freebet: user.freebet,
                freebetLocked: user.freebetLocked
            }
        });
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
export async function toggleUserFreeze(req, res) {
    try {
        const { id } = req.params;
        const user = await User.findById(id);
        if (!user)
            return res.status(404).json({ error: 'User not found' });
        const currentFrozen = !!user.isFrozen;
        user.isFrozen = !currentFrozen;
        await user.save();
        const statusMsg = !currentFrozen ? 'suspended' : 'activated';
        return res.json({
            success: true,
            message: `User account has been ${statusMsg}`,
            isFrozen: !currentFrozen
        });
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
export async function resetUserPassword(req, res) {
    try {
        const { id } = req.params;
        const { newPassword } = req.body;
        if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 4) {
            return res.status(400).json({ error: 'New password must be at least 4 characters' });
        }
        const user = await User.findById(id);
        if (!user)
            return res.status(404).json({ error: 'User not found' });
        user.password = newPassword;
        await user.save();
        return res.json({
            success: true,
            message: `Password reset successfully for ${user.username}`
        });
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
export async function getAdminWithdrawals(req, res) {
    try {
        const { status = 'all' } = req.query;
        const query = {};
        if (status && status !== 'all') {
            query.status = status;
        }
        const withdrawals = await Withdrawal.find(query)
            .sort({ createdAt: -1 })
            .limit(60)
            .populate('userId', 'username phone balance');
        return res.json({ success: true, withdrawals });
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
export async function updateWithdrawalStatus(req, res) {
    try {
        const { id } = req.params;
        const { status } = req.body;
        if (!['completed', 'rejected'].includes(status)) {
            return res.status(400).json({ error: 'Status must be completed or rejected' });
        }
        const withdrawal = await Withdrawal.findById(id);
        if (!withdrawal)
            return res.status(404).json({ error: 'Withdrawal not found' });
        // If rejecting a pending withdrawal, refund user's balance!
        if (withdrawal.status === 'pending' && status === 'rejected') {
            await User.findByIdAndUpdate(withdrawal.userId, {
                $inc: { balance: withdrawal.amount }
            });
        }
        withdrawal.status = status;
        await withdrawal.save();
        return res.json({
            success: true,
            message: status === 'rejected'
                ? `Withdrawal of KSH ${withdrawal.amount} rejected and balance refunded to user`
                : `Withdrawal marked as completed`,
            withdrawal
        });
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
