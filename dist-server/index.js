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
import { connectDB } from './db.js';
import { initializeSocket } from './socket.js';
import { Settings } from './models/Settings.js';
// Controllers
import { register, login, getMe } from './controllers/authController.js';
import { initiateDeposit } from './controllers/depositController.js';
import { intasendWebhook } from './controllers/webhookController.js';
import { getSettings, updateSettings } from './controllers/settingsController.js';
import { authMiddleware, adminMiddleware } from './middleware/auth.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, '../dist');
console.log(`📁 Static files: ${distPath}`);
const app = express();
const httpServer = createServer(app);
// CORS for development and production
const allowedOrigins = [
    'http://localhost:5175',
    'http://localhost:3000',
    process.env.FRONTEND_URL
].filter(Boolean);
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        }
        else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));
app.use(express.json());
// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', env: process.env.NODE_ENV }));
// Auth routes
app.post('/api/auth/register', register);
app.post('/api/auth/login', login);
app.get('/api/auth/me', authMiddleware, getMe);
// Deposit routes
app.post('/api/deposit', authMiddleware, initiateDeposit);
// Webhook (no auth - called by IntaSend)
app.post('/api/webhooks/intasend', intasendWebhook);
// Admin routes
app.get('/api/settings', adminMiddleware, getSettings);
app.put('/api/settings', adminMiddleware, updateSettings);
// Production: Serve static files from Vite build
const isProduction = process.env.NODE_ENV === 'production';
if (isProduction) {
    console.log(`📂 Serving static files from: ${distPath}`);
    app.use(express.static(distPath));
    // SPA catch-all - send all non-API routes to index.html
    // Express 5 requires named parameter for catch-all routes
    app.get('/{*splat}', (req, res) => {
        if (!req.path.startsWith('/api')) {
            res.sendFile(path.join(distPath, 'index.html'));
        }
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
        // Ensure settings exist (no IntaSend keys required at startup)
        console.log('🔄 Initializing settings...');
        try {
            const existingSettings = await Settings.findOne();
            if (!existingSettings) {
                await Settings.create({
                    adminToken: process.env.ADMIN_TOKEN || 'rukabet-admin-2026',
                    jwtSecret: process.env.JWT_SECRET || 'rukabet-jwt-secret-2026',
                    // IntaSend keys are optional - set via admin dashboard
                    intasendPublicKey: '',
                    intasendSecretKey: '',
                    companyName: 'RUKA TECH SOLUTIONS'
                });
                console.log('✅ Default settings created (configure IntaSend in admin dashboard)');
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
