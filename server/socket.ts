import { Server as SocketIOServer } from 'socket.io'
import { Server as HTTPServer } from 'http'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'rukabet-secret-2026'
let io: SocketIOServer | null = null

export function initializeSocket(httpServer: HTTPServer) {
  io = new SocketIOServer(httpServer, {
    cors: { origin: ['http://localhost:5175', 'http://localhost:3000'], credentials: true }
  })

  io.on('connection', (socket) => {
    console.log('🔌 Client connected:', socket.id)
    
    socket.on('authenticate', (token: string) => {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as { userId: number }
        const userRoom = `user:${decoded.userId}`
        socket.join(userRoom)
        console.log(`✅ User ${decoded.userId} joined room: ${userRoom}`)
        socket.emit('authenticated', { userId: decoded.userId })
      } catch (error) {
        socket.emit('auth_error', { error: 'Invalid token' })
      }
    })

    socket.on('disconnect', () => console.log('🔌 Client disconnected:', socket.id))
  })

  console.log('✅ Socket.IO initialized')
  return io
}

export function getIO(): SocketIOServer | null {
  return io
}
