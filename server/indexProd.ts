import express from 'express'
import cors from 'cors'
import path from 'path'
import { createServer } from 'http'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

dotenv.config()

import { connectDB } from './db.js'
import { initializeSocket } from './socketProd.js'
import { Settings } from './models/SettingsMongo.js'

// Controllers
import { registerMongo, loginMongo, getMeMongo } from './controllers/authControllerMongo.js'
import { initiateDepositMongo } from './controllers/depositControllerMongo.js'
import { intasendWebhookMongo } from './controllers/webhookControllerMongo.js'
import { getSettingsMongo, updateSettingsMongo } from './controllers/settingsControllerMongo.js'
import { authMiddlewareMongo, adminMiddlewareMongo } from './middleware/authMongo.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

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
app.post('/api/auth/register', registerMongo)
app.post('/api/auth/login', loginMongo)
app.get('/api/auth/me', authMiddlewareMongo, getMeMongo)

// Deposit routes
app.post('/api/deposit', authMiddlewareMongo, initiateDepositMongo)

// Webhook (no auth - called by IntaSend)
app.post('/api/webhooks/intasend', intasendWebhookMongo)

// Admin routes
app.get('/api/settings', adminMiddlewareMongo, getSettingsMongo)
app.put('/api/settings', adminMiddlewareMongo, updateSettingsMongo)

// Production: Serve static files from Vite build
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '../dist')
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
