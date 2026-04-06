import express from 'express'
import cors from 'cors'
import path from 'path'
import { createServer } from 'http'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

dotenv.config()

import { connectDB } from './db.js'
import { initializeSocket } from './socket.js'
import { Settings } from './models/Settings.js'

// Controllers
import { register, login, getMe } from './controllers/authController.js'
import { initiateDeposit } from './controllers/depositController.js'
import { intasendWebhook } from './controllers/webhookController.js'
import { getSettings, updateSettings } from './controllers/settingsController.js'
import { authMiddleware, adminMiddleware } from './middleware/auth.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// In production, dist-server is at root level, so dist is a sibling folder
const isProduction = process.env.NODE_ENV === 'production'
const distPath = path.join(__dirname, '../dist')

console.log('🔧 Server starting...')
console.log(`📁 __dirname: ${__dirname}`)
console.log(`📁 distPath: ${distPath}`)
console.log(`🌍 NODE_ENV: ${process.env.NODE_ENV}`)

const app = express()
const httpServer = createServer(app)

// CORS for development and production
const allowedOrigins = [
  'http://localhost:5175',
  'http://localhost:3000',
  process.env.FRONTEND_URL
].filter(Boolean)

app.use(cors({ 
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },
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

// Webhook (no auth - called by IntaSend)
app.post('/api/webhooks/intasend', intasendWebhook)

// Admin routes
app.get('/api/settings', adminMiddleware, getSettings)
app.put('/api/settings', adminMiddleware, updateSettings)

// Production: Serve static files from Vite build
if (isProduction) {
  console.log(`📂 Serving static files from: ${distPath}`)
  app.use(express.static(distPath))
  
  // SPA catch-all - send all non-API routes to index.html
  app.get('*', (req, res) => {
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
    // Connect to MongoDB
    await connectDB()
    
    // Ensure settings exist
    await Settings.findOne() || await Settings.create({
      adminToken: process.env.ADMIN_TOKEN || 'rukabet-admin-2026',
      jwtSecret: process.env.JWT_SECRET || 'rukabet-jwt-secret-2026'
    })
    
    httpServer.listen(PORT, () => {
      console.log(`
╔═══════════════════════════════════════════════════════════════╗
║   🚀 RukaBet Production Server                                ║
║   📡 API: ${process.env.NODE_ENV === 'production' ? 'https://your-app.herokuapp.com' : `http://localhost:${PORT}`}
║   🔌 WebSocket: Connected with ping/pong keepalive            ║
║   🗄️  Database: MongoDB Atlas                                 ║
║   ⚡ Environment: ${process.env.NODE_ENV || 'development'}                              ║
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
