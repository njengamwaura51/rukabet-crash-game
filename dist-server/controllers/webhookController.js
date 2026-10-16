import { Deposit } from '../models/Deposit.js';
import { User } from '../models/User.js';
import { Settings } from '../models/Settings.js';
import { emitUserBalanceUpdate } from '../socket.js';
import { normalizeKenyanPhone } from './depositController.js';
const AMOUNT_TOLERANCE = 0.05;
/**
 * Atomically marks a deposit as completed + credited, increments user balance,
 * unlocks freebet if eligible, credits referrer once, and emits real-time socket events.
 * Safe against concurrent webhook calls, late callbacks after timeouts, and manual verification.
 */
export async function creditDepositAtomically(depositId, meta = {}) {
    const existing = await Deposit.findById(depositId);
    if (!existing)
        return { creditedNow: false, deposit: null, user: null };
    const creditAmount = typeof meta.verifiedAmount === 'number' && Number.isFinite(meta.verifiedAmount) && meta.verifiedAmount > 0
        ? meta.verifiedAmount
        : existing.amount;
    const setFields = {
        status: 'completed',
        credited: true,
        creditedAt: new Date(),
        failureReason: null
    };
    if (meta.paydReference)
        setFields.paydReference = String(meta.paydReference);
    if (meta.externalRef)
        setFields.externalRef = String(meta.externalRef);
    if (meta.mpesaReceipt)
        setFields.mpesaReceipt = String(meta.mpesaReceipt).toUpperCase();
    if (meta.rawWebhookPayload !== undefined)
        setFields.rawWebhookPayload = meta.rawWebhookPayload;
    // Atomic guard: only credit if credited !== true
    const completedDeposit = await Deposit.findOneAndUpdate({ _id: existing._id, credited: { $ne: true } }, { $set: setFields }, { new: true });
    if (!completedDeposit) {
        // Already credited previously; still update any newly arrived receipt metadata
        if (meta.mpesaReceipt && !existing.mpesaReceipt) {
            await Deposit.findByIdAndUpdate(existing._id, {
                $set: { mpesaReceipt: String(meta.mpesaReceipt).toUpperCase() }
            });
        }
        const currentUser = await User.findById(existing.userId);
        return { creditedNow: false, deposit: existing, user: currentUser };
    }
    const settings = await Settings.getSettings();
    const freebetUnlockAmount = Number(settings?.freebetUnlockAmount ?? 50);
    const referralReward = Number(settings?.referralReward ?? 20);
    const updateOps = { $inc: { balance: creditAmount } };
    if (creditAmount >= freebetUnlockAmount) {
        updateOps.$set = { freebetLocked: false };
    }
    const user = await User.findByIdAndUpdate(completedDeposit.userId, updateOps, { new: true });
    if (!user) {
        return { creditedNow: true, deposit: completedDeposit, user: null };
    }
    // Atomic one-time referral reward claim
    if (user.referredBy && !user.hasReceivedReferralReward && creditAmount >= freebetUnlockAmount && referralReward > 0) {
        try {
            const claimedUser = await User.findOneAndUpdate({ _id: user._id, hasReceivedReferralReward: { $ne: true } }, { $set: { hasReceivedReferralReward: true } }, { new: true });
            if (claimedUser) {
                const referrer = await User.findByIdAndUpdate(user.referredBy, { $inc: { balance: referralReward, referralsEarnings: referralReward } }, { new: true });
                if (referrer) {
                    emitUserBalanceUpdate(referrer._id, {
                        amount: referralReward,
                        newBalance: referrer.balance,
                        freebet: referrer.freebet,
                        freebetLocked: referrer.freebetLocked,
                        type: 'referral_reward'
                    });
                }
            }
        }
        catch (refErr) {
            console.error('⚠️ Could not process referral reward:', refErr.message);
        }
    }
    emitUserBalanceUpdate(completedDeposit.userId, {
        amount: creditAmount,
        newBalance: user.balance,
        freebet: user.freebet,
        freebetLocked: user.freebetLocked,
        depositId: completedDeposit._id.toString(),
        apiRef: completedDeposit.apiRef,
        mpesaReceipt: completedDeposit.mpesaReceipt || completedDeposit.submittedReceipt || null,
        type: 'deposit'
    });
    return { creditedNow: true, deposit: completedDeposit, user };
}
export async function paydWebhook(req, res) {
    try {
        const payload = req.body || {};
        console.log('📥 Payd Webhook received:', JSON.stringify(payload, null, 2));
        const dataObj = payload.data || payload.transaction || {};
        const externalRef = payload.transaction_reference ||
            payload.correlator_id ||
            payload.reference ||
            payload.id ||
            dataObj.transaction_reference ||
            dataObj.correlator_id ||
            dataObj.reference ||
            null;
        const narrationText = typeof (payload.narration || dataObj.narration || payload.remarks) === 'string'
            ? (payload.narration || dataObj.narration || payload.remarks)
            : '';
        const refMatchInNarration = narrationText.match(/(DEP[_-]\d+[_-]\w+)/i);
        const extractedFromNarration = refMatchInNarration
            ? refMatchInNarration[1]
            : narrationText.replace(/^Deposit\s+/i, '').trim();
        const internalRef = payload.api_ref ||
            payload.merchant_reference ||
            payload.account_reference ||
            dataObj.api_ref ||
            dataObj.merchant_reference ||
            (extractedFromNarration.startsWith('DEP') ? extractedFromNarration : null);
        const mpesaReceipt = (payload.third_party_trans_id ||
            payload.mpesa_receipt ||
            payload.mpesa_reference ||
            payload.receipt_number ||
            payload.trans_id ||
            dataObj.third_party_trans_id ||
            dataObj.mpesa_receipt ||
            dataObj.receipt_number ||
            '').toString().trim().toUpperCase() || null;
        const rawPhone = payload.phone_number ||
            payload.msisdn ||
            payload.phone ||
            dataObj.phone_number ||
            dataObj.msisdn ||
            '';
        const webhookPhone = normalizeKenyanPhone(String(rawPhone));
        const rawAmount = payload.amount ?? payload.value ?? dataObj.amount ?? dataObj.value;
        const parsedAmount = rawAmount !== undefined && rawAmount !== null ? Number.parseFloat(String(rawAmount)) : null;
        const rawStatus = (payload.status || payload.state || dataObj.status || dataObj.state || '').toString().toUpperCase();
        const resultCode = payload.result_code ?? payload.status_code ?? payload.ResultCode ?? dataObj.result_code;
        const isSuccess = rawStatus === 'SUCCESS' ||
            rawStatus === 'SUCCESSFUL' ||
            rawStatus === 'COMPLETED' ||
            rawStatus === 'COMPLETE' ||
            rawStatus === 'PAID' ||
            rawStatus === 'SETTLED' ||
            resultCode === 0 ||
            resultCode === '0' ||
            (resultCode === 200 && rawStatus !== 'FAILED' && rawStatus !== 'PENDING' && rawStatus !== 'PROCESSING');
        const isPendingOrIntermediate = !isSuccess &&
            (rawStatus === 'PENDING' ||
                rawStatus === 'PROCESSING' ||
                rawStatus === 'INITIATED' ||
                rawStatus === 'QUEUED' ||
                rawStatus === 'SENT' ||
                rawStatus === '');
        const isExplicitFailure = !isSuccess &&
            !isPendingOrIntermediate &&
            (rawStatus === 'FAILED' ||
                rawStatus === 'CANCELLED' ||
                rawStatus === 'CANCELED' ||
                rawStatus === 'REJECTED' ||
                rawStatus === 'EXPIRED' ||
                (typeof resultCode === 'number' && resultCode > 0 && resultCode !== 200));
        // 1. Locate the Deposit by direct reference or receipt
        const queryConditions = [];
        if (externalRef) {
            queryConditions.push({ paydReference: String(externalRef) }, { externalRef: String(externalRef) });
        }
        if (internalRef) {
            queryConditions.push({ apiRef: String(internalRef) });
        }
        if (mpesaReceipt) {
            queryConditions.push({ mpesaReceipt }, { submittedReceipt: mpesaReceipt });
        }
        let deposit = null;
        if (queryConditions.length > 0) {
            deposit = await Deposit.findOne({ $or: queryConditions }).sort({ createdAt: -1 });
        }
        // 2. Fallback: If Payd callback omitted api_ref/correlator_id, match recent uncredited deposit by phone + amount
        if (!deposit && webhookPhone && parsedAmount && Number.isFinite(parsedAmount)) {
            const twentyMinutesAgo = new Date(Date.now() - 20 * 60 * 1000);
            deposit = await Deposit.findOne({
                phone: webhookPhone,
                credited: { $ne: true },
                amount: { $gte: parsedAmount - AMOUNT_TOLERANCE, $lte: parsedAmount + AMOUNT_TOLERANCE },
                createdAt: { $gte: twentyMinutesAgo }
            }).sort({ createdAt: -1 });
        }
        if (!deposit) {
            console.warn('⚠️ No matching deposit found for Payd webhook:', { externalRef, internalRef, webhookPhone, parsedAmount });
            return res.status(200).json({ status: 'ok', message: 'No matching deposit found' });
        }
        // 3. If already credited, just ensure receipt metadata is saved
        if (deposit.credited) {
            if (mpesaReceipt && !deposit.mpesaReceipt) {
                await Deposit.findByIdAndUpdate(deposit._id, { $set: { mpesaReceipt } });
            }
            return res.status(200).json({ status: 'ok', message: 'Already completed and credited' });
        }
        // 4. Handle intermediate/pending webhooks without overwriting status to 'failed'
        if (isPendingOrIntermediate) {
            await Deposit.findByIdAndUpdate(deposit._id, {
                $set: {
                    paydReference: externalRef ? String(externalRef) : deposit.paydReference,
                    externalRef: externalRef ? String(externalRef) : deposit.externalRef,
                    rawWebhookPayload: payload
                }
            });
            return res.status(200).json({ status: 'ok', message: 'Intermediate status recorded' });
        }
        // 5. Handle successful payment
        if (isSuccess) {
            if (parsedAmount !== null && Number.isFinite(parsedAmount) && parsedAmount > 0) {
                if (parsedAmount + AMOUNT_TOLERANCE < deposit.amount) {
                    await Deposit.findByIdAndUpdate(deposit._id, {
                        $set: {
                            failureReason: `Amount mismatch: expected ${deposit.amount}, received ${parsedAmount}`,
                            rawWebhookPayload: payload
                        }
                    });
                    return res.status(200).json({ status: 'ok', message: 'Amount underpaid' });
                }
            }
            await creditDepositAtomically(deposit._id, {
                externalRef: externalRef ? String(externalRef) : deposit.externalRef,
                paydReference: externalRef ? String(externalRef) : deposit.paydReference,
                mpesaReceipt,
                rawWebhookPayload: payload,
                verifiedAmount: deposit.amount
            });
            return res.status(200).json({ status: 'ok', message: 'Deposit credited' });
        }
        // 6. Handle explicit failure (only if not already credited)
        if (isExplicitFailure) {
            const failReason = payload.failed_reason ||
                payload.reason ||
                payload.message ||
                payload.result_desc ||
                dataObj.failed_reason ||
                dataObj.message ||
                `Transaction ${rawStatus || 'failed'}`;
            await Deposit.findOneAndUpdate({ _id: deposit._id, credited: { $ne: true } }, {
                $set: {
                    status: 'failed',
                    failureReason: String(failReason),
                    paydReference: externalRef ? String(externalRef) : deposit.paydReference,
                    externalRef: externalRef ? String(externalRef) : deposit.externalRef,
                    rawWebhookPayload: payload
                }
            });
        }
        return res.status(200).json({ status: 'ok' });
    }
    catch (error) {
        console.error('❌ Payd Callback Error:', error);
        return res.status(200).json({ status: 'error_logged', error: error.message });
    }
}
// Transitional legacy fallback for IntaSend
export async function intasendWebhook(req, res) {
    try {
        const payload = req.body || {};
        const { invoice_id, state, api_ref, mpesa_reference, failed_reason } = payload;
        const normalizedState = String(state || '').toUpperCase();
        const queryOr = [];
        if (api_ref)
            queryOr.push({ apiRef: String(api_ref) });
        if (invoice_id)
            queryOr.push({ intasendInvoiceId: String(invoice_id) }, { externalRef: String(invoice_id) });
        if (mpesa_reference)
            queryOr.push({ submittedReceipt: String(mpesa_reference).toUpperCase() });
        if (queryOr.length === 0) {
            return res.status(200).json({ received: true, message: 'No reference provided' });
        }
        const deposit = await Deposit.findOne({ $or: queryOr }).sort({ createdAt: -1 });
        if (!deposit) {
            return res.status(200).json({ received: true, message: 'Deposit not found' });
        }
        if (normalizedState === 'COMPLETE' || normalizedState === 'COMPLETED') {
            await creditDepositAtomically(deposit._id, {
                externalRef: invoice_id ? String(invoice_id) : deposit.externalRef,
                mpesaReceipt: mpesa_reference ? String(mpesa_reference).toUpperCase() : null,
                rawWebhookPayload: payload,
                verifiedAmount: deposit.amount
            });
            return res.status(200).json({ success: true });
        }
        if (normalizedState === 'FAILED' || normalizedState === 'CANCELLED') {
            await Deposit.findOneAndUpdate({ _id: deposit._id, credited: { $ne: true } }, {
                $set: {
                    status: 'failed',
                    failureReason: failed_reason || `IntaSend ${normalizedState}`,
                    rawWebhookPayload: payload
                }
            });
        }
        return res.status(200).json({ received: true });
    }
    catch (err) {
        console.error('❌ Legacy IntaSend Webhook error:', err?.message);
        return res.status(200).json({ received: true });
    }
}
