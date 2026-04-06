import axios from 'axios';
import { Deposit } from '../models/Deposit.js';
import { Settings } from '../models/Settings.js';
const INTASEND_SANDBOX_URL = 'https://sandbox.intasend.com/api/v1/payment/mpesa-stk-push/';
const INTASEND_LIVE_URL = 'https://payment.intasend.com/api/v1/payment/mpesa-stk-push/';
export async function initiateDeposit(req, res) {
    try {
        const { amount, phone } = req.body;
        const userId = req.userId;
        if (!amount || amount < 10) {
            return res.status(400).json({ error: 'Minimum deposit is KSH 10' });
        }
        if (!phone || !/^[17]\d{8}$/.test(phone)) {
            return res.status(400).json({ error: 'Invalid phone number' });
        }
        // Get IntaSend config from database
        const settings = await Settings.findOne();
        if (!settings?.intasendPublicKey || !settings?.intasendSecretKey) {
            return res.status(500).json({ error: 'Payment gateway not configured' });
        }
        const normalizedPhone = `254${phone}`;
        const apiRef = `${phone}-RUKABET-${Date.now()}`;
        // Create pending deposit record
        const deposit = await Deposit.create({
            userId,
            phone: normalizedPhone,
            amount,
            apiRef,
            status: 'pending'
        });
        // Determine API URL based on key prefix
        const isLive = settings.intasendPublicKey.includes('live');
        const apiUrl = isLive ? INTASEND_LIVE_URL : INTASEND_SANDBOX_URL;
        // Call IntaSend STK Push API
        const response = await axios.post(apiUrl, {
            public_key: settings.intasendPublicKey,
            amount: amount,
            phone_number: normalizedPhone,
            api_ref: apiRef,
            narrative: `Deposit to ${settings.companyName || 'RukaBet'}`
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.intasendSecretKey}`
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
        console.error('❌ Deposit error:', error.response?.data || error.message);
        return res.status(500).json({
            error: error.response?.data?.message || error.message || 'Deposit failed'
        });
    }
}
