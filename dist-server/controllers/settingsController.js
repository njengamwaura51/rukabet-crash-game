import { Settings } from '../models/Settings.js';
export async function getPublicConfig(req, res) {
    try {
        const settings = await Settings.getSettings();
        return res.json({
            success: true,
            config: {
                brandName: settings?.companyName || 'RukaBet',
                companyName: settings?.companyName || 'RukaBet',
                whatsappSupportNumber: settings?.whatsappSupport || '254712345678',
                minDeposit: Number(settings?.minDeposit ?? 10),
                minWithdrawal: Number(settings?.minWithdrawal ?? 50),
                freebetUnlockAmount: Number(settings?.freebetUnlockAmount ?? 50),
                initialFreebet: Number(settings?.initialFreebet ?? 150),
                referralReward: Number(settings?.referralReward ?? 20),
                minBet: Number(settings?.minBet ?? 10),
                maxBet: Number(settings?.maxBet ?? 10000),
            },
        });
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
function sanitizeKey(value) {
    if (typeof value !== 'string')
        return '';
    return value.trim().replace(/^["']|["']$/g, '');
}
export async function getSettings(req, res) {
    try {
        let settings = await Settings.getSettings();
        const hasPassword = Boolean(settings.paydApiPassword);
        const hasSecret = Boolean(settings.paydApiSecret);
        return res.json({
            success: true,
            settings: {
                paydWalletUsername: settings.paydWalletUsername || '',
                paydApiUsername: settings.paydApiUsername || '',
                paydApiBaseUrl: (settings.paydApiBaseUrl || 'https://api.payd.money/api/v2/payments').replace('api.mypayd.app', 'api.payd.money').replace('mypayd.app', 'payd.money'),
                paydCallbackUrl: settings.paydCallbackUrl || '',
                isPasswordConfigured: hasPassword,
                isSecretConfigured: hasSecret,
                isManagedViaAdmin: Boolean(settings.paydWalletUsername || settings.paydApiUsername || settings.paydApiSecret),
                companyName: settings.companyName,
                whatsappSupport: settings.whatsappSupport,
                minDeposit: settings.minDeposit ?? 10,
                minWithdrawal: settings.minWithdrawal ?? 50,
                freebetUnlockAmount: settings.freebetUnlockAmount ?? 50,
                initialFreebet: settings.initialFreebet ?? 150,
                referralReward: settings.referralReward ?? 20,
                minBet: settings.minBet ?? 10,
                maxBet: settings.maxBet ?? 10000,
                updatedAt: settings.updatedAt,
                // Legacy compatibility
                intasendPublicKey: ''
            }
        });
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
export async function updateSettings(req, res) {
    try {
        const updates = req.body;
        // Sanitize - only allow specific fields to be updated
        const allowedFields = [
            'paydWalletUsername',
            'paydApiUsername',
            'paydApiPassword',
            'paydApiSecret',
            'paydApiBaseUrl',
            'paydCallbackUrl',
            'companyName',
            'whatsappSupport',
            'minDeposit',
            'minWithdrawal',
            'freebetUnlockAmount',
            'initialFreebet',
            'referralReward',
            'minBet',
            'maxBet'
        ];
        const numericFields = [
            'minDeposit',
            'minWithdrawal',
            'freebetUnlockAmount',
            'initialFreebet',
            'referralReward',
            'minBet',
            'maxBet'
        ];
        const sanitizedUpdates = {};
        for (const key of allowedFields) {
            const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
            const val = updates[key] !== undefined ? updates[key] : updates[snakeKey];
            if (val !== undefined) {
                // If updating password or secret, set if valid new secret/password, or clear if explicitly empty
                if (key === 'paydApiPassword' || key === 'paydApiSecret') {
                    if (val === '' || val === null) {
                        sanitizedUpdates[key] = '';
                    }
                    else if (typeof val === 'string' && val.trim().length > 0 && !val.includes('•') && !val.includes('*')) {
                        sanitizedUpdates[key] = sanitizeKey(val);
                    }
                }
                else if (numericFields.includes(key)) {
                    const num = Number(val);
                    if (!Number.isNaN(num) && num >= 0) {
                        sanitizedUpdates[key] = num;
                    }
                }
                else {
                    sanitizedUpdates[key] = typeof val === 'string' ? sanitizeKey(val) : val;
                }
            }
        }
        const settings = await Settings.findOneAndUpdate({}, { $set: sanitizedUpdates }, { new: true, upsert: true });
        const hasPassword = Boolean(settings.paydApiPassword);
        const hasSecret = Boolean(settings.paydApiSecret);
        return res.json({
            success: true,
            message: 'Settings updated successfully',
            settings: {
                paydWalletUsername: settings.paydWalletUsername || '',
                paydApiUsername: settings.paydApiUsername || '',
                paydApiBaseUrl: (settings.paydApiBaseUrl || 'https://api.payd.money/api/v2/payments').replace('api.mypayd.app', 'api.payd.money').replace('mypayd.app', 'payd.money'),
                paydCallbackUrl: settings.paydCallbackUrl || '',
                isPasswordConfigured: hasPassword,
                isSecretConfigured: hasSecret,
                isManagedViaAdmin: true,
                companyName: settings.companyName,
                whatsappSupport: settings.whatsappSupport,
                minDeposit: settings.minDeposit ?? 10,
                minWithdrawal: settings.minWithdrawal ?? 50,
                freebetUnlockAmount: settings.freebetUnlockAmount ?? 50,
                initialFreebet: settings.initialFreebet ?? 150,
                referralReward: settings.referralReward ?? 20,
                minBet: settings.minBet ?? 10,
                maxBet: settings.maxBet ?? 10000,
                updatedAt: settings.updatedAt
            }
        });
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
