import axios from 'axios';
import { Deposit } from '../models/Deposit.js';
import { Settings } from '../models/Settings.js';
const INTASEND_SANDBOX_URL = 'https://sandbox.intasend.com/api/v1/payment/mpesa-stk-push/';
const INTASEND_LIVE_URL = 'https://payment.intasend.com/api/v1/payment/mpesa-stk-push/';
const MIN_DEPOSIT = 10;
// IntaSend-provided challenge for this merchant integration, sent with each STK payload.
const parsedIntaSendChallenge = Number.parseInt(process.env.INTASEND_CHALLENGE || '117402', 10);
const INTASEND_CHALLENGE = Number.isFinite(parsedIntaSendChallenge) ? parsedIntaSendChallenge : 117402;
function sanitizeKey(value) {
    return typeof value === 'string' ? value.trim() : '';
}
function isLiveKey(publicKey, secretKey) {
    const normalizedPublicKey = publicKey.toLowerCase();
    const normalizedSecretKey = secretKey.toLowerCase();
    return normalizedPublicKey.includes('_live_') || normalizedSecretKey.includes('_live_');
}
export async function initiateDeposit(req, res) {
    let depositId = null;
    try {
        const { amount, phone } = req.body;
        const userId = req.userId;
        const normalizedInputPhone = typeof phone === 'string' ? phone.replace(/\D/g, '') : '';
        const accountPhone = typeof req.user?.phone === 'string' ? req.user.phone.replace(/\D/g, '') : '';
        const resolvedPhone = normalizedInputPhone || accountPhone;
        const depositAmount = Number(amount);
        if (!Number.isFinite(depositAmount) || depositAmount < MIN_DEPOSIT) {
            return res.status(400).json({ error: 'Minimum deposit is KSH 10' });
        }
        if (!/^[17]\d{8}$/.test(resolvedPhone)) {
            return res.status(400).json({ error: 'Invalid phone number' });
        }
        // Get IntaSend config from environment first, with database settings as fallback
        const settings = await Settings.findOne();
        const intasendPublicKey = sanitizeKey(process.env.INTASEND_PUBLIC_KEY) || sanitizeKey(settings?.intasendPublicKey);
        const intasendSecretKey = sanitizeKey(process.env.INTASEND_SECRET_KEY) || sanitizeKey(settings?.intasendSecretKey);
        if (!intasendPublicKey || !intasendSecretKey) {
            return res.status(500).json({ error: 'Payment gateway not configured' });
        }
        const normalizedPhone = `254${resolvedPhone}`;
        const apiRef = `${resolvedPhone}-RUKABET-${Date.now()}`;
        // Create pending deposit record
        const deposit = await Deposit.create({
            userId,
            phone: normalizedPhone,
            amount: depositAmount,
            apiRef,
            status: 'pending'
        });
        depositId = deposit._id.toString();
        // Determine API URL based on key prefix
        const isLive = isLiveKey(intasendPublicKey, intasendSecretKey);
        const apiUrl = isLive ? INTASEND_LIVE_URL : INTASEND_SANDBOX_URL;
        // Call IntaSend STK Push API
        const response = await axios.post(apiUrl, {
            public_key: intasendPublicKey,
            challenge: INTASEND_CHALLENGE,
            amount: depositAmount,
            phone_number: normalizedPhone,
            api_ref: apiRef,
            narrative: `Deposit to ${settings?.companyName || 'RukaBet'}`
        }, {
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer ' + intasendSecretKey
            }
        });
        console.log('✅ IntaSend STK Push sent:', response.data);
        // Update deposit with IntaSend invoice ID
        if (response.data.invoice?.invoice_id) {
            deposit.intasendInvoiceId = response.data.invoice.invoice_id;
            await deposit.save();
        }
        return res.json({
            success: true,
            message: 'STK Push sent. Check your phone.',
            depositId: deposit._id,
            apiRef
        });
    }
    catch (error) {
        if (depositId) {
            await Deposit.findByIdAndUpdate(depositId, { $set: { status: 'failed' } }, { new: false }).catch((updateError) => {
                console.error('⚠️ Failed to mark deposit as failed:', updateError?.message || updateError);
            });
        }
        console.error('❌ Deposit error:', error.response?.data || error.message);
        return res.status(500).json({
            error: error.response?.data?.message || error.message || 'Deposit failed'
        });
    }
}
