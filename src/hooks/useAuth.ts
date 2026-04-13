import { useState, useEffect, useCallback } from 'react'

export interface User {
  id: string
  phone: string
  username: string
  balance: number
  freebet: number
  freebetLocked: boolean // true until user deposits 20 and plays once
  hasDeposited: boolean
  hasPlayedWithMoney: boolean
  createdAt: number
  referredBy?: string // userId of referrer
  hasReceivedReferralReward?: boolean
}

const STORAGE_KEY = 'aspirebet_user'
const TOKEN_STORAGE_KEYS = ['rukabet_token', 'token', 'aspirebet_token'] as const
const PRIMARY_TOKEN_KEY = TOKEN_STORAGE_KEYS[0]
const INITIAL_FREEBET = 150
const LOCAL_API_BASE_URL = 'http://localhost:3001'

function getApiBaseUrl(): string {
  if (typeof window === 'undefined') return LOCAL_API_BASE_URL
  if (import.meta.env.VITE_API_BASE_URL) return import.meta.env.VITE_API_BASE_URL
  const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  return isLocal ? LOCAL_API_BASE_URL : ''
}

function getStoredToken() {
  return TOKEN_STORAGE_KEYS
    .map(key => localStorage.getItem(key))
    .find((value): value is string => !!value)
}

function setStoredToken(token: string) {
  for (const key of TOKEN_STORAGE_KEYS) {
    localStorage.removeItem(key)
  }
  localStorage.setItem(PRIMARY_TOKEN_KEY, token)
}

function clearStoredToken() {
  for (const key of TOKEN_STORAGE_KEYS) {
    localStorage.removeItem(key)
  }
}

function normalizeUser(apiUser: any): User {
  const rawPhone = String(apiUser?.phone || '')
  const phone = rawPhone.length === 9 ? `0${rawPhone}` : rawPhone

  return {
    id: apiUser?._id || apiUser?.id || `user_${Date.now()}`,
    phone,
    username: apiUser?.username || `User${phone.slice(-4)}`,
    balance: Number(apiUser?.balance || 0),
    freebet: Number(apiUser?.freebet ?? INITIAL_FREEBET),
    freebetLocked: Boolean(apiUser?.freebetLocked ?? true),
    hasDeposited: Number(apiUser?.balance || 0) >= 20,
    hasPlayedWithMoney: Boolean(apiUser?.hasPlayedWithMoney ?? false),
    createdAt: apiUser?.createdAt ? Date.parse(apiUser.createdAt) || Date.now() : Date.now(),
  }
}

// Referral system constants
export const MIN_DEPOSIT = 10
export const REFERRAL_REWARD = 20

// Process referral reward when a referred user makes their first qualifying deposit
export function processReferralReward(
  referredUser: User,
  depositAmount: number,
  updateReferrerBalance: (referrerId: string, amount: number) => void
): boolean {
  // Check if this is a referred user who hasn't received reward yet
  if (!referredUser.referredBy) return false
  if (referredUser.hasReceivedReferralReward) return false
  
  // Check if deposit meets minimum requirement
  if (depositAmount < MIN_DEPOSIT) return false
  
  // Credit the referrer with the reward
  updateReferrerBalance(referredUser.referredBy, REFERRAL_REWARD)
  
  return true
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Load user from localStorage on mount
  useEffect(() => {
    const loadAuth = async () => {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        try {
          const parsed = JSON.parse(stored)
          setUser(parsed)
        } catch {
          localStorage.removeItem(STORAGE_KEY)
        }
      }

      const token = getStoredToken()
      if (!token) {
        setIsLoading(false)
        return
      }

      try {
        const response = await fetch(`${getApiBaseUrl()}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (!response.ok) {
          clearStoredToken()
          setIsLoading(false)
          return
        }

        const data = await response.json()
        if (data?.user) {
          const normalized = normalizeUser(data.user)
          setUser(normalized)
          localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
        }
      } catch {
        // Keep local state for offline/local fallback mode
      } finally {
        setIsLoading(false)
      }
    }

    loadAuth()
  }, [])

  // Persist user to localStorage
  const persistUser = useCallback((userData: User | null) => {
    if (userData) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(userData))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
    setUser(userData)
  }, [])

  // Register new user (now accepts auto-generated username)
  const register = useCallback(async (phone: string, password: string, autoUsername?: string): Promise<{ success: boolean; error?: string }> => {
    // Phone should already be validated and normalized by AuthModal
    const cleanPhone = phone.replace(/\s+/g, '').replace(/^(\+254|254)/, '0')

    // Validate password
    if (password.length < 4) {
      return { success: false, error: 'Password must be at least 4 characters' }
    }

    // Use auto-generated username or fallback to phone-based
    const username = autoUsername || `User${cleanPhone.slice(-4)}`

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone, password, username }),
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        return { success: false, error: data?.error || 'Registration failed' }
      }

      if (data?.token && data?.user) {
        setStoredToken(data.token)
        persistUser(normalizeUser(data.user))
        return { success: true }
      }
    } catch {
      // Fall back to local-only auth mode if backend is unavailable
    }

    const existingUsers = JSON.parse(localStorage.getItem('aspirebet_users') || '[]')
    if (existingUsers.some((u: any) => u.phone === cleanPhone)) {
      return { success: false, error: 'This phone number is already registered' }
    }

    const newUser: User = {
      id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      phone: cleanPhone,
      username,
      balance: 0,
      freebet: INITIAL_FREEBET,
      freebetLocked: true,
      hasDeposited: false,
      hasPlayedWithMoney: false,
      createdAt: Date.now(),
    }

    existingUsers.push({ phone: cleanPhone, password, userId: newUser.id, username })
    localStorage.setItem('aspirebet_users', JSON.stringify(existingUsers))

    persistUser(newUser)
    return { success: true }
  }, [persistUser])

  // Login existing user
  const login = useCallback(async (phone: string, password: string): Promise<{ success: boolean; error?: string }> => {
    const cleanPhone = phone.replace(/\s+/g, '').replace(/^(\+254|254)/, '0')

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone, password }),
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        return { success: false, error: data?.error || 'Login failed' }
      }

      if (data?.token && data?.user) {
        setStoredToken(data.token)
        persistUser(normalizeUser(data.user))
        return { success: true }
      }
    } catch {
      // Fall back to local-only auth mode if backend is unavailable
    }

    const existingUsers = JSON.parse(localStorage.getItem('aspirebet_users') || '[]')
    const userCreds = existingUsers.find((u: any) => u.phone === cleanPhone)
    if (!userCreds) {
      return { success: false, error: 'Phone number not registered' }
    }
    if (userCreds.password !== password) {
      return { success: false, error: 'Incorrect password' }
    }

    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const userData = JSON.parse(stored)
      if (userData.phone === cleanPhone) {
        setUser(userData)
        return { success: true }
      }
    }

    // Reconstruct user if not found (fallback) - use stored username
    const fallbackUser: User = {
      id: userCreds.userId,
      phone: cleanPhone,
      username: userCreds.username || `User${cleanPhone.slice(-4)}`,
      balance: 0,
      freebet: INITIAL_FREEBET,
      freebetLocked: true,
      hasDeposited: false,
      hasPlayedWithMoney: false,
      createdAt: Date.now(),
    }
    persistUser(fallbackUser)
    return { success: true }
  }, [persistUser])

  // Logout
  const logout = useCallback(() => {
    clearStoredToken()
    persistUser(null)
  }, [persistUser])

  // Update balance
  const updateBalance = useCallback((delta: number, isFreebet = false) => {
    setUser(prev => {
      if (!prev) return prev
      const updated = {
        ...prev,
        balance: isFreebet ? prev.balance : prev.balance + delta,
        freebet: isFreebet ? Math.max(0, prev.freebet + delta) : prev.freebet,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
      return updated
    })
  }, [])

  // Process deposit
  const deposit = useCallback((amount: number) => {
    setUser(prev => {
      if (!prev) return prev
      const hasMetDepositRequirement = prev.hasDeposited || amount >= 20
      const updated = {
        ...prev,
        balance: prev.balance + amount,
        hasDeposited: hasMetDepositRequirement,
        // Unlock freebet if deposited 20+ and has played
        freebetLocked: hasMetDepositRequirement && prev.hasPlayedWithMoney ? false : prev.freebetLocked,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
      return updated
    })
  }, [])

  // Mark that user has played with real money
  const markPlayedWithMoney = useCallback(() => {
    setUser(prev => {
      if (!prev) return prev
      const updated = {
        ...prev,
        hasPlayedWithMoney: true,
        // Unlock freebet if deposited and now played
        freebetLocked: prev.hasDeposited ? false : prev.freebetLocked,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
      return updated
    })
  }, [])

  return {
    user,
    isLoading,
    isLoggedIn: !!user,
    register,
    login,
    logout,
    updateBalance,
    deposit,
    markPlayedWithMoney,
  }
}
