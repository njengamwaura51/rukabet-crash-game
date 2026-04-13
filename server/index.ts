import express from 'express'
import cors from 'cors'
import path from 'path'
import { createServer } from 'http'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

// Load environment variables first
dotenv.config()

// Top-level error handling
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error)
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason)
  process.exit(1)
})

console.log('🔧 Starting RukaBet server...')
console.log(`🌍 NODE_ENV: ${process.env.NODE_ENV || 'development'}`)
console.log(`🔌 PORT: ${process.env.PORT || 3001}`)
console.log(`📦 MONGO_URI: ${process.env.MONGO_URI ? 'SET' : 'NOT SET'}`)

import { connectDB } from './db.js'
import { initializeSocket } from './socket.js'
import { Settings } from './models/Settings.js'

// Controllers
import { register, login, getMe } from './controllers/authController.js'
import { initiateDeposit } from './controllers/depositController.js'
import { intasendWebhook } from './controllers/webhookController.js'
import { getPublicConfig, getSettings, updateSettings } from './controllers/settingsController.js'
import { getAdminOverview } from './controllers/adminController.js'
import { authMiddleware, adminMiddleware } from './middleware/auth.js'
import { adminRateLimit } from './middleware/rateLimit.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const INTASEND_WEBHOOK_PATH = '/api/webhooks/intasend'
const INTASEND_PUBLIC_DOMAIN = process.env.PUBLIC_APP_URL || 'https://rukabet.live'
const INTASEND_WEBHOOK_URL = `${INTASEND_PUBLIC_DOMAIN}${INTASEND_WEBHOOK_PATH}`

const distPath = path.join(__dirname, '../dist')
console.log(`📁 Static files: ${distPath}`)

const app = express()
const httpServer = createServer(app)

// CORS - allow all origins in production (we serve everything from same domain)
// In production, static files and API are on same origin, so CORS is permissive
app.use(cors({ 
  origin: true,
  credentials: true 
}))

app.use(express.json())

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', env: process.env.NODE_ENV }))

// Auth routes
app.post('/api/auth/register', register)
app.post('/api/auth/login', login)
app.get('/api/auth/me', authMiddleware, getMe)

// Deposit routes
app.post('/api/deposit', authMiddleware, initiateDeposit)

// Public configuration
app.get('/api/public-config', getPublicConfig)

// Webhook (no auth - called by IntaSend)
app.post(INTASEND_WEBHOOK_PATH, intasendWebhook)
console.log(`🔔 IntaSend webhook URL: ${INTASEND_WEBHOOK_URL}`)

// Admin routes
app.get('/api/settings', adminRateLimit, adminMiddleware, getSettings)
app.put('/api/settings', adminRateLimit, adminMiddleware, updateSettings)
app.get('/api/admin/overview', adminRateLimit, adminMiddleware, getAdminOverview)

// Production: Serve static files from Vite build
const isProduction = process.env.NODE_ENV === 'production'
if (isProduction) {
  console.log(`📂 Serving static files from: ${distPath}`)
  app.use(express.static(distPath))
  
  // SPA catch-all - send all non-API routes to index.html
  // Express 5 requires named parameter for catch-all routes
  app.get('/{*splat}', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(distPath, 'index.html'))
    }
  })
}

// Initialize Socket.IO with Heroku-friendly settings
const io = initializeSocket(httpServer)

// Start server
const PORT = process.env.PORT || 3001

async function startServer() {
  try {
    console.log('🔄 Connecting to MongoDB...')
    
    // Connect to MongoDB
    await connectDB()
    
    // Ensure settings exist (no IntaSend keys required at startup)
    console.log('🔄 Initializing settings...')
    try {
      const existingSettings = await Settings.findOne()
      if (!existingSettings) {
        await Settings.create({
          adminToken: process.env.ADMIN_TOKEN || 'rukabet-admin-2026',
          jwtSecret: process.env.JWT_SECRET || 'rukabet-jwt-secret-2026',
          // IntaSend keys are optional - set via admin dashboard
          intasendPublicKey: '',
          intasendSecretKey: '',
          companyName: 'RUKA TECH SOLUTIONS'
        })
        console.log('✅ Default settings created (configure IntaSend in admin dashboard)')
      } else {
        console.log('✅ Settings loaded')
      }
    } catch (settingsError) {
      console.error('⚠️ Settings initialization error (non-fatal):', settingsError)
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
      `)
    })
  } catch (error) {
    console.error('❌ Failed to start server:', error)
    process.exit(1)
  }
}

startServer()

export { app, httpServer }
