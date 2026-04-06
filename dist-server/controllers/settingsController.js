import { Settings } from '../models/Settings.js';
export async function getSettings(req, res) {
    try {
        let settings = await Settings.findOne();
        if (!settings) {
            settings = await Settings.create({
                adminToken: process.env.ADMIN_TOKEN || 'rukabet-admin-2026',
                jwtSecret: process.env.JWT_SECRET || 'rukabet-jwt-secret-2026'
            });
        }
        // Don't expose secrets in response
        return res.json({
            success: true,
            settings: {
                intasendPublicKey: settings.intasendPublicKey,
                companyName: settings.companyName,
                whatsappSupport: settings.whatsappSupport,
                minDeposit: settings.minDeposit,
                minWithdrawal: settings.minWithdrawal,
                updatedAt: settings.updatedAt
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
            'intasendPublicKey',
            'intasendSecretKey',
            'companyName',
            'whatsappSupport',
            'minDeposit',
            'minWithdrawal'
        ];
        const sanitizedUpdates = {};
        for (const key of allowedFields) {
            // Handle both camelCase and snake_case input
            const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
            if (updates[key] !== undefined) {
                sanitizedUpdates[key] = updates[key];
            }
            else if (updates[snakeKey] !== undefined) {
                sanitizedUpdates[key] = updates[snakeKey];
            }
        }
        const settings = await Settings.findOneAndUpdate({}, { $set: sanitizedUpdates }, { new: true, upsert: true });
        return res.json({
            success: true,
            message: 'Settings updated',
            settings: {
                intasendPublicKey: settings.intasendPublicKey,
                companyName: settings.companyName,
                whatsappSupport: settings.whatsappSupport,
                minDeposit: settings.minDeposit,
                minWithdrawal: settings.minWithdrawal,
                updatedAt: settings.updatedAt
            }
        });
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
