import { User } from '../models/User.js';
import { Bet } from '../models/Bet.js';
import { Deposit } from '../models/Deposit.js';
export async function getAdminOverview(req, res) {
    try {
        const [totalUsers, usersCreatedPast24Hours, totalBets, activeBets, completedDeposits, pendingDeposits] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
            Bet.countDocuments(),
            Bet.countDocuments({ status: 'active' }),
            Deposit.countDocuments({ status: 'completed' }),
            Deposit.countDocuments({ status: 'pending' })
        ]);
        const [totalDepositsAmountAgg, totalWageredAgg, totalWinsAgg, recentUsers, recentDeposits, recentBets, topPlayers] = await Promise.all([
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
                    totalDepositsAmount,
                    totalWagered,
                    totalWins,
                    houseGross
                },
                recentUsers,
                recentDeposits,
                recentBets,
                topPlayers
            }
        });
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
