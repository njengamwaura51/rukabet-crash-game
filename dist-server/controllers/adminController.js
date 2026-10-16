import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { User } from '../models/User.js';
import { Bet } from '../models/Bet.js';
import { Deposit } from '../models/Deposit.js';
import { Withdrawal } from '../models/Withdrawal.js';
import { OddsControl } from '../models/OddsControl.js';
import { Settings } from '../models/Settings.js';
import { getOddsEngineState, applyOddsEngineRule, resetOddsEngineToNormal, getIO, emitUserBalanceUpdate } from '../socket.js';
import { creditDepositAtomically } from './webhookController.js';
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
        const { search, status, sortBy = 'createdAt', sortOrder = 'desc', page = '1', limit = '50' } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const isAll = limit === 'all';
        const limitNum = isAll ? 500 : Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
        const skip = (pageNum - 1) * limitNum;
        const query = {};
        if (search && typeof search === 'string' && search.trim()) {
            const trimmed = search.trim();
            const digits = trimmed.replace(/\D/g, '');
            const last9 = digits.length >= 9 ? digits.slice(-9) : digits;
            const orConditions = [
                { username: { $regex: trimmed, $options: 'i' } }
            ];
            // If valid 24-character hex ID, search by ID
            if (trimmed.length === 24 && /^[0-9a-fA-F]{24}$/.test(trimmed)) {
                orConditions.push({ _id: trimmed });
            }
            // Robust phone matching across raw 9 digits, 07..., 254... formats
            if (last9.length >= 3) {
                orConditions.push({ phone: { $regex: last9, $options: 'i' } });
                orConditions.push({ phone: { $regex: `0${last9}`, $options: 'i' } });
                orConditions.push({ phone: { $regex: `254${last9}`, $options: 'i' } });
            }
            else {
                orConditions.push({ phone: { $regex: trimmed, $options: 'i' } });
            }
            query.$or = orConditions;
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
            User.find(query).sort(sortObj).skip(skip).limit(limitNum).select('-password').lean(),
            User.countDocuments(query)
        ]);
        // Normalize users to guarantee numbers for balance, freebet, and sensible fallbacks for early users
        const normalizedUsers = users.map((u) => ({
            ...u,
            balance: Number.isFinite(Number(u.balance)) ? Number(u.balance) : 0,
            freebet: Number.isFinite(Number(u.freebet)) ? Number(u.freebet) : 0,
            freebetLocked: typeof u.freebetLocked === 'boolean' ? u.freebetLocked : true,
            isFrozen: Boolean(u.isFrozen),
            username: u.username || `User_${u.phone ? u.phone.slice(-4) : 'Player'}`
        }));
        return res.json({
            success: true,
            users: normalizedUsers,
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.max(1, Math.ceil(total / limitNum))
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
            user: {
                ...user.toObject(),
                balance: Number.isFinite(Number(user.balance)) ? Number(user.balance) : 0,
                freebet: Number.isFinite(Number(user.freebet)) ? Number(user.freebet) : 0
            },
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
        const { amount, type, reason } = req.body;
        const numAmount = Number(amount);
        if (!Number.isFinite(numAmount) || numAmount < 0) {
            return res.status(400).json({ error: 'Amount must be a valid non-negative number' });
        }
        if (type !== 'credit' && type !== 'debit' && type !== 'set') {
            return res.status(400).json({ error: 'Type must be credit, debit, or set' });
        }
        const user = await User.findById(id);
        if (!user)
            return res.status(404).json({ error: 'User not found' });
        const currentBalance = Number.isFinite(Number(user.balance)) ? Number(user.balance) : 0;
        let newBalance = currentBalance;
        if (type === 'set') {
            newBalance = Math.round(numAmount * 100) / 100;
        }
        else if (type === 'debit') {
            if (currentBalance < numAmount) {
                return res.status(400).json({ error: `Cannot debit KSH ${numAmount}. Current balance is KSH ${currentBalance}` });
            }
            newBalance = Math.max(0, Math.round((currentBalance - numAmount) * 100) / 100);
        }
        else if (type === 'credit') {
            newBalance = Math.round((currentBalance + numAmount) * 100) / 100;
        }
        user.balance = newBalance;
        await user.save();
        // Create a transaction tracking record for complete wallet auditing
        const adjustmentDelta = newBalance - currentBalance;
        if (adjustmentDelta !== 0) {
            const apiRef = `ADM-ADJ-${Date.now()}-${user._id.toString().slice(-4)}`;
            await Deposit.create({
                userId: user._id,
                phone: user.phone || '0700000000',
                amount: Math.abs(adjustmentDelta),
                apiRef,
                status: adjustmentDelta > 0 ? 'completed' : 'failed',
                failureReason: adjustmentDelta < 0 ? `Admin Debit: ${reason || 'Manual deduction'}` : null
            }).catch((err) => console.warn('⚠️ Could not log adjustment record to deposits:', err.message));
        }
        // Real-time WebSocket emission to instant-update user's active game screen
        const io = getIO();
        if (io) {
            io.to(`user:${user._id}`).emit('DEPOSIT_SUCCESS', {
                amount: Math.abs(adjustmentDelta),
                newBalance: user.balance,
                apiRef: `ADM-BALANCE-UPDATE-${Date.now()}`,
                timestamp: new Date().toISOString()
            });
            io.to(`user:${user._id}`).emit('BALANCE_UPDATE', {
                balance: user.balance,
                freebet: user.freebet
            });
        }
        return res.json({
            success: true,
            message: `Successfully updated balance for ${user.username} (${user.phone}). New balance: KSH ${user.balance}`,
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
// Database refresh & early user synchronization endpoint
export async function syncDatabaseUsers(req, res) {
    try {
        const settings = await Settings.getSettings();
        const defaultFreebet = Number(settings?.initialFreebet ?? 150);
        const allUsers = await User.find({});
        let normalizedCount = 0;
        for (const u of allUsers) {
            let changed = false;
            if (u.balance === undefined || u.balance === null || isNaN(u.balance)) {
                u.balance = 0;
                changed = true;
            }
            if (u.freebet === undefined || u.freebet === null || isNaN(u.freebet)) {
                u.freebet = defaultFreebet;
                changed = true;
            }
            if (u.freebetLocked === undefined || u.freebetLocked === null) {
                u.freebetLocked = true;
                changed = true;
            }
            if (u.isFrozen === undefined || u.isFrozen === null) {
                u.isFrozen = false;
                changed = true;
            }
            if (!u.username || !u.username.trim()) {
                u.username = `User_${u.phone ? u.phone.slice(-4) : Math.random().toString(36).slice(-4)}`;
                changed = true;
            }
            if (changed) {
                await u.save();
                normalizedCount++;
            }
        }
        const totalUsers = await User.countDocuments({});
        return res.json({
            success: true,
            message: `Database synced successfully! ${totalUsers} total users tracked (${normalizedCount} early user records normalized).`,
            totalUsers,
            normalizedCount
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
/* ═══════════════════════════════════════════════════════════════════════════
   ADMIN ODDS ENGINE CONTROLS
   Manage multiplier range rules, scheduled reward windows, and reset to normal
   ═══════════════════════════════════════════════════════════════════════════ */
export async function getOddsEngineConfig(req, res) {
    try {
        const liveState = getOddsEngineState();
        const doc = await OddsControl.getOddsControl();
        return res.json({
            success: true,
            state: liveState,
            config: doc,
            auditLogs: (doc.auditLogs || []).slice(-30).reverse()
        });
    }
    catch (error) {
        return res.status(500).json({ error: error.message || 'Failed to fetch odds engine config' });
    }
}
export async function setOddsEngineRule(req, res) {
    try {
        const { mode = 'range', minMultiplier = 2.0, maxMultiplier = 5.0, exactMultiplier, durationType = 'minutes', durationMinutes = 15, roundsTotal = 10, scheduledStartTime, scheduledEndTime, note } = req.body;
        const parsedMin = Math.max(1.01, Number(minMultiplier) || 2.0);
        const parsedMax = Math.min(200, Math.max(parsedMin, Number(maxMultiplier) || 5.0));
        if (mode === 'exact' && (!exactMultiplier || Number(exactMultiplier) < 1.01)) {
            return res.status(400).json({ error: 'Exact multiplier must be at least 1.01' });
        }
        if (parsedMin < 1.01) {
            return res.status(400).json({ error: 'Minimum multiplier must be at least 1.01' });
        }
        if (mode === 'range' && parsedMax < parsedMin) {
            return res.status(400).json({ error: 'Maximum multiplier must be greater than or equal to minimum' });
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
            activatedBy: req.admin?.username || 'admin',
            note: note || `Admin set ${mode} [${parsedMin}x - ${parsedMax}x]`
        });
        return res.json({
            success: true,
            message: `Odds Engine active: ${mode} [${parsedMin}x - ${parsedMax}x]`,
            state: updatedState
        });
    }
    catch (error) {
        return res.status(500).json({ error: error.message || 'Failed to set odds engine rule' });
    }
}
export async function resetOddsEngine(req, res) {
    try {
        const { reason = 'Admin manual reset' } = req.body || {};
        const updatedState = await resetOddsEngineToNormal(reason);
        return res.json({
            success: true,
            message: 'Odds engine successfully reset to standard provably fair mode',
            state: updatedState
        });
    }
    catch (error) {
        return res.status(500).json({ error: error.message || 'Failed to reset odds engine' });
    }
}
export async function getAdminDeposits(req, res) {
    try {
        const { status = 'all', search = '', limit = 100, page = 1 } = req.query;
        const query = {};
        if (status && status !== 'all')
            query.status = status;
        if (search) {
            query.$or = [
                { apiRef: { $regex: search, $options: 'i' } },
                { externalRef: { $regex: search, $options: 'i' } },
                { paydReference: { $regex: search, $options: 'i' } },
                { mpesaReceipt: { $regex: search, $options: 'i' } },
                { submittedReceipt: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } }
            ];
        }
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 100));
        const skip = (pageNum - 1) * limitNum;
        const [deposits, total, completedSumAgg] = await Promise.all([
            Deposit.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum).populate('userId', 'username phone balance'),
            Deposit.countDocuments(query),
            Deposit.aggregate([{ $match: { status: 'completed' } }, { $group: { _id: null, total: { $sum: '$amount' } } }])
        ]);
        return res.json({
            success: true,
            deposits,
            totalCompletedAmount: completedSumAgg[0]?.total || 0,
            pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) || 1 }
        });
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
export async function updateAdminDepositStatus(req, res) {
    try {
        const { id } = req.params;
        const { status, mpesaReceipt, failureReason } = req.body;
        if (!['completed', 'failed'].includes(status)) {
            return res.status(400).json({ error: 'Status must be completed or failed' });
        }
        const deposit = await Deposit.findById(id);
        if (!deposit)
            return res.status(404).json({ error: 'Deposit not found' });
        if (status === 'completed') {
            const result = await creditDepositAtomically(deposit._id, {
                mpesaReceipt: mpesaReceipt || deposit.submittedReceipt || deposit.mpesaReceipt || 'ADMIN-VERIFIED',
                verifiedAmount: deposit.amount
            });
            return res.json({
                success: true,
                creditedNow: result.creditedNow,
                deposit: result.deposit,
                userBalance: result.user?.balance
            });
        }
        if (deposit.credited) {
            return res.status(400).json({ error: 'Cannot mark an already-credited deposit as failed' });
        }
        deposit.status = 'failed';
        deposit.failureReason = failureReason || 'Rejected by admin';
        await deposit.save();
        return res.json({ success: true, deposit });
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
export async function getAdminBets(req, res) {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
        const status = req.query.status || 'all';
        const type = req.query.type || 'all';
        const search = (req.query.search || '').trim();
        const roundId = (req.query.roundId || '').trim();
        const query = {};
        if (status && status !== 'all') {
            query.status = status;
        }
        if (type === 'money') {
            query.isFreebet = { $ne: true };
        }
        else if (type === 'freebet') {
            query.isFreebet = true;
        }
        if (roundId) {
            query.roundId = new RegExp(roundId, 'i');
        }
        if (search) {
            const matchingUsers = await User.find({
                $or: [
                    { phone: new RegExp(search, 'i') },
                    { username: new RegExp(search, 'i') }
                ]
            }).select('_id');
            query.userId = { $in: matchingUsers.map(u => u._id) };
        }
        const skip = (page - 1) * limit;
        const [bets, total, metricsAgg] = await Promise.all([
            Bet.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate('userId', 'username phone balance'),
            Bet.countDocuments(query),
            Bet.aggregate([
                { $match: query },
                {
                    $group: {
                        _id: null,
                        totalWagered: { $sum: '$amount' },
                        totalWon: {
                            $sum: { $cond: [{ $eq: ['$status', 'won'] }, '$winAmount', 0] }
                        },
                        countWon: {
                            $sum: { $cond: [{ $eq: ['$status', 'won'] }, 1, 0] }
                        },
                        countLost: {
                            $sum: { $cond: [{ $eq: ['$status', 'lost'] }, 1, 0] }
                        },
                        countActive: {
                            $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
                        }
                    }
                }
            ])
        ]);
        const totalWagered = metricsAgg[0]?.totalWagered || 0;
        const totalWon = metricsAgg[0]?.totalWon || 0;
        const countWon = metricsAgg[0]?.countWon || 0;
        const countLost = metricsAgg[0]?.countLost || 0;
        const countActive = metricsAgg[0]?.countActive || 0;
        const resolvedCount = countWon + countLost;
        const winRate = resolvedCount > 0 ? Math.round((countWon / resolvedCount) * 1000) / 10 : 0;
        const houseGross = Math.round((totalWagered - totalWon) * 100) / 100;
        return res.json({
            success: true,
            bets,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit) || 1
            },
            metrics: {
                totalBets: total,
                totalWagered,
                totalWon,
                houseGross,
                countWon,
                countLost,
                countActive,
                winRate
            }
        });
    }
    catch (error) {
        console.error('getAdminBets error:', error);
        return res.status(500).json({ error: error.message || 'Failed to fetch bets' });
    }
}
export async function reconcileUserBalance(req, res) {
    try {
        const { id } = req.params;
        const { apply } = req.body;
        const user = await User.findById(id);
        if (!user)
            return res.status(404).json({ error: 'User not found' });
        const [depositsAgg, withdrawalsAgg, betsAgg] = await Promise.all([
            Deposit.aggregate([
                { $match: { userId: user._id, status: 'completed' } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]),
            Withdrawal.aggregate([
                { $match: { userId: user._id, status: 'completed' } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]),
            Bet.aggregate([
                { $match: { userId: user._id } },
                {
                    $group: {
                        _id: null,
                        realWagered: {
                            $sum: { $cond: [{ $eq: ['$isFreebet', true] }, 0, '$amount'] }
                        },
                        wonPayout: {
                            $sum: { $cond: [{ $eq: ['$status', 'won'] }, '$winAmount', 0] }
                        },
                        freebetProfit: {
                            $sum: {
                                $cond: [
                                    { $and: [{ $eq: ['$isFreebet', true] }, { $eq: ['$status', 'won'] }] },
                                    { $max: [0, { $subtract: ['$winAmount', '$amount'] }] },
                                    0
                                ]
                            }
                        }
                    }
                }
            ])
        ]);
        const totalDeposits = depositsAgg[0]?.total || 0;
        const totalWithdrawals = withdrawalsAgg[0]?.total || 0;
        const referralEarnings = user.referralsEarnings || 0;
        const realWagered = betsAgg[0]?.realWagered || 0;
        const realWonPayout = (betsAgg[0]?.wonPayout || 0) - (betsAgg[0]?.freebetProfit || 0);
        const freebetProfit = betsAgg[0]?.freebetProfit || 0;
        // Expected balance = Deposits - Withdrawals + ReferralEarnings - RealWagered + RealWonPayout + FreebetProfit
        const calculatedBalance = Math.max(0, Math.round((totalDeposits - totalWithdrawals + referralEarnings - realWagered + realWonPayout + freebetProfit) * 100) / 100);
        const currentBalance = Number(user.balance) || 0;
        const discrepancy = Math.round((currentBalance - calculatedBalance) * 100) / 100;
        let applied = false;
        if (apply === true && discrepancy !== 0) {
            user.balance = calculatedBalance;
            await user.save();
            applied = true;
            const apiRef = `RECON-${Date.now()}-${user._id.toString().slice(-4)}`;
            await Deposit.create({
                userId: user._id,
                phone: user.phone,
                amount: Math.abs(discrepancy),
                apiRef,
                status: discrepancy < 0 ? 'completed' : 'failed',
                failureReason: `Balance reconciliation adjustment: from ${currentBalance} to ${calculatedBalance}`
            });
            emitUserBalanceUpdate(user._id, {
                balance: calculatedBalance,
                newBalance: calculatedBalance,
                type: 'reconciliation'
            });
        }
        return res.json({
            success: true,
            user: {
                _id: user._id,
                phone: user.phone,
                username: user.username,
                balance: user.balance
            },
            audit: {
                totalDeposits,
                totalWithdrawals,
                referralEarnings,
                realWagered,
                realWonPayout,
                freebetProfit,
                calculatedBalance,
                currentBalance,
                discrepancy,
                applied
            }
        });
    }
    catch (error) {
        console.error('reconcileUserBalance error:', error);
        return res.status(500).json({ error: error.message || 'Failed to reconcile user balance' });
    }
}
export async function reconcileAllBalances(req, res) {
    try {
        const { apply } = req.body;
        const users = await User.find({ role: { $ne: 'admin' } });
        const results = [];
        for (const user of users) {
            const [depositsAgg, withdrawalsAgg, betsAgg] = await Promise.all([
                Deposit.aggregate([
                    { $match: { userId: user._id, status: 'completed' } },
                    { $group: { _id: null, total: { $sum: '$amount' } } }
                ]),
                Withdrawal.aggregate([
                    { $match: { userId: user._id, status: 'completed' } },
                    { $group: { _id: null, total: { $sum: '$amount' } } }
                ]),
                Bet.aggregate([
                    { $match: { userId: user._id } },
                    {
                        $group: {
                            _id: null,
                            realWagered: {
                                $sum: { $cond: [{ $eq: ['$isFreebet', true] }, 0, '$amount'] }
                            },
                            wonPayout: {
                                $sum: { $cond: [{ $eq: ['$status', 'won'] }, '$winAmount', 0] }
                            },
                            freebetProfit: {
                                $sum: {
                                    $cond: [
                                        { $and: [{ $eq: ['$isFreebet', true] }, { $eq: ['$status', 'won'] }] },
                                        { $max: [0, { $subtract: ['$winAmount', '$amount'] }] },
                                        0
                                    ]
                                }
                            }
                        }
                    }
                ])
            ]);
            const totalDeposits = depositsAgg[0]?.total || 0;
            const totalWithdrawals = withdrawalsAgg[0]?.total || 0;
            const referralEarnings = user.referralsEarnings || 0;
            const realWagered = betsAgg[0]?.realWagered || 0;
            const realWonPayout = (betsAgg[0]?.wonPayout || 0) - (betsAgg[0]?.freebetProfit || 0);
            const freebetProfit = betsAgg[0]?.freebetProfit || 0;
            const calculatedBalance = Math.max(0, Math.round((totalDeposits - totalWithdrawals + referralEarnings - realWagered + realWonPayout + freebetProfit) * 100) / 100);
            const currentBalance = Number(user.balance) || 0;
            const discrepancy = Math.round((currentBalance - calculatedBalance) * 100) / 100;
            if (discrepancy !== 0) {
                let applied = false;
                if (apply === true) {
                    user.balance = calculatedBalance;
                    await user.save();
                    applied = true;
                    emitUserBalanceUpdate(user._id, {
                        balance: calculatedBalance,
                        newBalance: calculatedBalance,
                        type: 'reconciliation'
                    });
                }
                results.push({
                    userId: user._id,
                    phone: user.phone,
                    username: user.username,
                    currentBalance,
                    calculatedBalance,
                    discrepancy,
                    applied
                });
            }
        }
        return res.json({
            success: true,
            totalAudited: users.length,
            discrepanciesFound: results.length,
            applied: Boolean(apply),
            discrepancies: results
        });
    }
    catch (error) {
        console.error('reconcileAllBalances error:', error);
        return res.status(500).json({ error: error.message || 'Failed to reconcile all balances' });
    }
}
