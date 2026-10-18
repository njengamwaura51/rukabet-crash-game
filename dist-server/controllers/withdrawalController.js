import { User } from '../models/User.js';
import { Withdrawal } from '../models/Withdrawal.js';
import { Deposit } from '../models/Deposit.js';
import { Settings } from '../models/Settings.js';
export async function requestWithdrawal(req, res) {
    try {
        const userId = req.userId;
        const { amount } = req.body;
        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const settings = await Settings.getSettings();
        const minWithdrawal = Number(settings?.minWithdrawal ?? 50);
        const withdrawAmount = Number(amount);
        if (!Number.isFinite(withdrawAmount) || withdrawAmount < minWithdrawal) {
            return res.status(400).json({ error: `Minimum withdrawal is KSH ${minWithdrawal}` });
        }
        // Atomically check balance and deduct
        const user = await User.findOneAndUpdate({ _id: userId, balance: { $gte: withdrawAmount } }, { $inc: { balance: -withdrawAmount } }, { new: true });
        if (!user) {
            return res.status(400).json({ error: 'Insufficient account balance' });
        }
        // Always enforce registered phone number for withdrawal
        const rawPhone = user.phone ? String(user.phone).replace(/\D/g, '') : '';
        const normalizedPhone = rawPhone.replace(/^254/, '').replace(/^0/, '').slice(-9);
        if (!/^[17]\d{8}$/.test(normalizedPhone)) {
            // Refund balance if user phone is invalid
            await User.findByIdAndUpdate(userId, { $inc: { balance: withdrawAmount } });
            return res.status(400).json({ error: 'Valid registered Safaricom phone number required for withdrawal' });
        }
        const fullPhone = `254${normalizedPhone}`;
        const withdrawal = await Withdrawal.create({
            userId,
            phone: fullPhone,
            amount: withdrawAmount,
            status: 'pending'
        });
        console.log(`💸 Withdrawal requested: User ${user.phone}, Amount KSH ${withdrawAmount}, WithdrawalID ${withdrawal._id}`);
        return res.json({
            success: true,
            message: `Withdrawal request of KSH ${withdrawAmount} submitted to 0${normalizedPhone}. Funds will be sent shortly.`,
            withdrawalId: withdrawal._id,
            newBalance: user.balance
        });
    }
    catch (error) {
        console.error('Withdrawal error:', error);
        return res.status(500).json({ error: error.message || 'Withdrawal processing failed' });
    }
}
export async function getUserTransactions(req, res) {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const [deposits, withdrawals] = await Promise.all([
            Deposit.find({ userId }).sort({ createdAt: -1 }).limit(20).lean(),
            Withdrawal.find({ userId }).sort({ createdAt: -1 }).limit(20).lean()
        ]);
        const transactions = [
            ...deposits.map((d) => ({
                id: d._id.toString(),
                type: 'Deposit',
                amount: d.amount,
                status: d.status,
                date: new Date(d.createdAt).toLocaleString(),
                timestamp: new Date(d.createdAt).getTime()
            })),
            ...withdrawals.map((w) => ({
                id: w._id.toString(),
                type: 'Withdrawal',
                amount: w.amount,
                status: w.status,
                date: new Date(w.createdAt).toLocaleString(),
                timestamp: new Date(w.createdAt).getTime()
            }))
        ].sort((a, b) => b.timestamp - a.timestamp);
        return res.json({
            success: true,
            transactions
        });
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
