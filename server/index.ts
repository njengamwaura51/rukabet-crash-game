import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { initializeSocket } from './socket.js'
import './database.js'

import { register, login, getMe } from './controllers/authController.js'
import { initiateDeposit } from './controllers/depositController.js'
import { intasendWebhook } from './controllers/webhookController.js'
import { getSettings, updateSettings } from './controllers/settingsController.js'
import { authMiddleware, adminMiddleware } from './middleware/auth.js'

const app = express()
const httpServer = createServer(app)

app.use(cors({ origin: ['http://localhost:5175', 'http://localhost:3000'], credentials: true }))
app.use(express.json())

app.get('/api/health', (req, res) => res.json({ status: 'ok' }))
app.post('/api/auth/register', register)
app.post('/api/auth/login', login)
app.get('/api/auth/me', authMiddleware, getMe)
app.post('/api/deposit', authMiddleware, initiateDeposit)
app.post('/api/webhooks/intasend', intasendWebhook)
app.get('/api/settings', adminMiddleware, getSettings)
app.put('/api/settings', adminMiddleware, updateSettings)

initializeSocket(httpServer)

const PORT = process.env.PORT || 3001
httpServer.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║   🚀 RukaBet Backend Server                               ║
║   📡 API: http://localhost:${PORT}                           ║
║   🔌 WebSocket: ws://localhost:${PORT}                       ║
║   🔐 Admin Token: rukabet-admin-2026                      ║
╚═══════════════════════════════════════════════════════════╝
  `)
})
