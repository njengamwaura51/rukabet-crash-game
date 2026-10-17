import express from 'express';
import cors from 'cors';
import path from 'path';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
// Load environment variables first
dotenv.config();
// Top-level error handling
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});
console.log('🔧 Starting RukaBet server...');
console.log(`🌍 NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
console.log(`🔌 PORT: ${process.env.PORT || 3001}`);
console.log(`📦 MONGO_URI: ${process.env.MONGO_URI ? 'SET' : 'NOT SET'}`);
import fs from 'fs';
import { connectDB } from './db.js';
import { initializeSocket } from './socket.js';
import { Settings } from './models/Settings.js';
import { User } from './models/User.js';
import { OddsControl } from './models/OddsControl.js';
// Controllers
import { register, login, getMe, changePassword } from './controllers/authController.js';
import { initiateDeposit, verifyPendingDeposit, getDepositStatus } from './controllers/depositController.js';
import { requestWithdrawal, getUserTransactions } from './controllers/withdrawalController.js';
import { paydWebhook, intasendWebhook } from './controllers/webhookController.js';
import { getPublicConfig, getSettings, updateSettings } from './controllers/settingsController.js';
import { getAdminOverview, adminLogin, getAdminUsers, getAdminUserDetail, adjustUserBalance, adjustUserFreebet, toggleUserFreeze, resetUserPassword, getAdminWithdrawals, updateWithdrawalStatus, getAdminDeposits, updateAdminDepositStatus, getOddsEngineConfig, setOddsEngineRule, resetOddsEngine, syncDatabaseUsers, getAdminBets, reconcileUserBalance, reconcileAllBalances, exportDatabase } from './controllers/adminController.js';
import { Deposit } from './models/Deposit.js';
import { Withdrawal } from './models/Withdrawal.js';
import { Bet } from './models/Bet.js';
import { Round } from './models/Round.js';
import { authMiddleware, adminMiddleware } from './middleware/auth.js';
import { adminRateLimit, depositRateLimit, webhookRateLimit } from './middleware/rateLimit.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PAYD_WEBHOOK_PATH = '/api/webhooks/payd';
const INTASEND_WEBHOOK_PATH = '/api/webhooks/intasend';
const PUBLIC_DOMAIN = process.env.PUBLIC_APP_URL || 'https://rukabet.live';
const PAYD_WEBHOOK_URL = `${PUBLIC_DOMAIN}${PAYD_WEBHOOK_PATH}`;
const distPath = path.join(__dirname, '../dist');
const isProduction = process.env.NODE_ENV === 'production';
console.log(`📁 Static files: ${distPath}`);
const app = express();
const httpServer = createServer(app);
app.set('trust proxy', 1);
// CORS - allow all origins in production (we serve everything from same domain)
// In production, static files and API are on same origin, so CORS is permissive
app.use(cors({
    origin: true,
    credentials: true
}));
app.use(express.json());
if (isProduction) {
    app.use((req, res, next) => {
        const forwardedProto = req.headers['x-forwarded-proto'];
        const protocol = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
        if (protocol && protocol !== 'https') {
            return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
        }
        next();
    });
}
// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', env: process.env.NODE_ENV }));
// Auth routes
app.post('/api/auth/register', register);
app.post('/api/auth/login', login);
app.get('/api/auth/me', authMiddleware, getMe);
app.post('/api/auth/change-password', authMiddleware, changePassword);
// Deposit & Withdrawal routes
app.post('/api/deposit', depositRateLimit, authMiddleware, initiateDeposit);
app.get('/api/deposit/:id/status', authMiddleware, getDepositStatus);
app.post('/api/deposit/verify', authMiddleware, verifyPendingDeposit);
app.post('/api/withdraw', depositRateLimit, authMiddleware, requestWithdrawal);
app.get('/api/user/transactions', authMiddleware, getUserTransactions);
// Public configuration
app.get('/api/public-config', getPublicConfig);
app.get('/api/config', getPublicConfig);
app.get('/api/settings/public', getPublicConfig);
// Webhook for Payd payments
app.post(PAYD_WEBHOOK_PATH, webhookRateLimit, paydWebhook);
// Transitional legacy IntaSend webhook
app.post(INTASEND_WEBHOOK_PATH, webhookRateLimit, intasendWebhook);
console.log(`🔔 Payd webhook URL: ${PAYD_WEBHOOK_URL}`);
// Admin routes
app.post('/api/admin/login', adminRateLimit, adminLogin);
app.get('/api/settings', adminRateLimit, adminMiddleware, getSettings);
app.get('/api/admin/settings', adminRateLimit, adminMiddleware, getSettings);
app.put('/api/settings', adminRateLimit, adminMiddleware, updateSettings);
app.put('/api/admin/settings', adminRateLimit, adminMiddleware, updateSettings);
app.get('/api/admin/overview', adminRateLimit, adminMiddleware, getAdminOverview);
// Advanced admin user tracking & operations
app.get('/api/admin/users', adminRateLimit, adminMiddleware, getAdminUsers);
app.post('/api/admin/users/sync-db', adminRateLimit, adminMiddleware, syncDatabaseUsers);
app.get('/api/admin/users/:id', adminRateLimit, adminMiddleware, getAdminUserDetail);
app.post('/api/admin/users/:id/adjust-balance', adminRateLimit, adminMiddleware, adjustUserBalance);
app.post('/api/admin/users/:id/adjust-freebet', adminRateLimit, adminMiddleware, adjustUserFreebet);
app.post('/api/admin/users/:id/toggle-freeze', adminRateLimit, adminMiddleware, toggleUserFreeze);
app.post('/api/admin/users/:id/reset-password', adminRateLimit, adminMiddleware, resetUserPassword);
app.post('/api/admin/users/:id/reconcile-balance', adminRateLimit, adminMiddleware, reconcileUserBalance);
app.post('/api/admin/users/reconcile-all', adminRateLimit, adminMiddleware, reconcileAllBalances);
// Admin bet management & audit ledger
app.get('/api/admin/bets', adminRateLimit, adminMiddleware, getAdminBets);
// Admin deposit management
app.get('/api/admin/deposits', adminRateLimit, adminMiddleware, getAdminDeposits);
app.post('/api/admin/deposits/:id/status', adminRateLimit, adminMiddleware, updateAdminDepositStatus);
// Admin withdrawal management
app.get('/api/admin/withdrawals', adminRateLimit, adminMiddleware, getAdminWithdrawals);
app.post('/api/admin/withdrawals/:id/status', adminRateLimit, adminMiddleware, updateWithdrawalStatus);
// Admin odds engine management
app.get('/api/admin/odds-engine', adminRateLimit, adminMiddleware, getOddsEngineConfig);
app.post('/api/admin/odds-engine', adminRateLimit, adminMiddleware, setOddsEngineRule);
app.post('/api/admin/odds-engine/reset', adminRateLimit, adminMiddleware, resetOddsEngine);
// Admin database snapshot export
app.get('/api/admin/database/export', adminRateLimit, adminMiddleware, exportDatabase);
app.post('/api/admin/database/export', adminRateLimit, adminMiddleware, exportDatabase);
// Catch-all 404 for unhandled API requests
app.all('/api/{*splat}', (req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
});
// Production: Serve static files from Vite build
if (isProduction) {
    console.log(`📂 Serving static files from: ${distPath}`);
    app.use(express.static(distPath));
    // SPA catch-all - send all non-API routes to index.html
    // Express 5 requires named parameter for catch-all routes
    app.get('/{*splat}', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
    });
}
// Initialize Socket.IO with Heroku-friendly settings
const io = initializeSocket(httpServer);
// Start server
const PORT = process.env.PORT || 3001;
async function startServer() {
    try {
        console.log('🔄 Connecting to MongoDB...');
        // Connect to MongoDB
        await connectDB();
        // Auto-seed empty database from production snapshot if available (ideal for fresh Render deployment)
        try {
            const userCount = await User.countDocuments();
            if (userCount === 0) {
                const snapshotFile = path.join(__dirname, '../data/production_snapshot.json');
                if (fs.existsSync(snapshotFile)) {
                    console.log('🌱 Empty database detected on boot! Auto-seeding from production snapshot...');
                    const rawData = fs.readFileSync(snapshotFile, 'utf-8');
                    const snapshot = JSON.parse(rawData);
                    const { users = [], settings: snapSettings = [], oddsControls = [], deposits = [], withdrawals = [], rounds = [], bets = [] } = snapshot.data || {};
                    if (users.length > 0) {
                        await User.insertMany(users);
                        console.log(`✅ Auto-seeded ${users.length} users.`);
                    }
                    if (snapSettings.length > 0) {
                        await Settings.insertMany(snapSettings);
                        console.log(`✅ Auto-seeded settings.`);
                    }
                    if (oddsControls.length > 0) {
                        await OddsControl.insertMany(oddsControls);
                        console.log(`✅ Auto-seeded odds engine config.`);
                    }
                    if (deposits.length > 0) {
                        await Deposit.insertMany(deposits);
                        console.log(`✅ Auto-seeded ${deposits.length} deposits.`);
                    }
                    if (withdrawals.length > 0) {
                        await Withdrawal.insertMany(withdrawals);
                        console.log(`✅ Auto-seeded ${withdrawals.length} withdrawals.`);
                    }
                    if (rounds.length > 0) {
                        await Round.insertMany(rounds);
                        console.log(`✅ Auto-seeded ${rounds.length} rounds.`);
                    }
                    if (bets.length > 0) {
                        await Bet.insertMany(bets);
                        console.log(`✅ Auto-seeded ${bets.length} bets.`);
                    }
                }
            }
        }
        catch (seedErr) {
            console.error('⚠️ Auto-seed from snapshot error (non-fatal):', seedErr);
        }
        // Backfill credited: true for historical completed deposits
        await Deposit.updateMany({ status: 'completed', credited: { $ne: true } }, { $set: { credited: true } }).catch(() => { });
        // Clean up any historical reconciliation adjustment deposits from deposits collection
        await Deposit.deleteMany({ apiRef: { $regex: /^RECON-/ } }).catch(() => { });
        // Ensure settings exist (no payment gateway keys required at startup)
        console.log('🔄 Initializing settings...');
        try {
            const existingSettings = await Settings.findOne();
            if (!existingSettings) {
                await Settings.create({
                    adminToken: process.env.ADMIN_TOKEN || 'rukabet-admin-2026',
                    jwtSecret: process.env.JWT_SECRET || 'rukabet-jwt-secret-2026',
                    paydWalletUsername: '',
                    paydApiUsername: '',
                    paydApiPassword: '',
                    paydApiBaseUrl: 'https://api.payd.money/api/v2/payments',
                    companyName: 'RUKA TECH SOLUTIONS'
                });
                console.log('✅ Default settings created (configure Payd in admin dashboard)');
            }
            else {
                console.log('✅ Settings loaded');
            }
        }
        catch (settingsError) {
            console.error('⚠️ Settings initialization error (non-fatal):', settingsError);
            // Continue anyway - settings can be created later
        }
        httpServer.listen(PORT, () => {
            console.log(`
╔═══════════════════════════════════════════════════════════════╗
║   🚀 RukaBet Server Running                                   ║
║   📡 Port: ${PORT}                                               ║
║   🔌 WebSocket: Enabled                                       ║
║   🗄️  Database: MongoDB                                        ║
║   ⚡ Environment: ${(process.env.NODE_ENV || 'development').padEnd(10)}                         ║
╚═══════════════════════════════════════════════════════════════╝
      `);
        });
    }
    catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}
startServer();
export { app, httpServer };
