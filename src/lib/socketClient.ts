import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null

function getSocketUrl(): string {
  if (typeof window === 'undefined') return ''

  const configured = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL
  if (configured) return configured

  if (import.meta.env.DEV) {
    return 'http://localhost:3001'
  }

  return window.location.origin
}

export function getSocket(): Socket {
  if (socket) return socket

  socket = io(getSocketUrl(), {
    transports: ['websocket', 'polling'],
    withCredentials: true,
    autoConnect: true
  })

  return socket
}
