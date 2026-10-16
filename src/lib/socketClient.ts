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

export function getStoredAuthToken(): string | null {
  if (typeof window === 'undefined') return null
  const keys = ['rukabet_token', 'token', 'aspirebet_token']
  for (const k of keys) {
    const val = localStorage.getItem(k)
    if (val) return val
  }
  return null
}

export function getSocket(): Socket {
  if (socket) return socket

  const token = getStoredAuthToken()

  socket = io(getSocketUrl(), {
    transports: ['websocket', 'polling'],
    withCredentials: true,
    autoConnect: true,
    auth: { token }
  })

  socket.on('connect', () => {
    const currentToken = getStoredAuthToken()
    if (currentToken) {
      socket?.emit('AUTHENTICATE', { token: currentToken })
    }
  })

  return socket
}

export function syncSocketAuth(token?: string | null): void {
  const t = token !== undefined ? token : getStoredAuthToken()
  if (socket) {
    if (t) {
      socket.auth = { token: t }
      socket.emit('AUTHENTICATE', { token: t })
    }
  }
}
