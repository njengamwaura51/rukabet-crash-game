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

interface StoredUserCredential {
  phone: string
  password: string
  userId?: string
  username?: string
}

const STORAGE_KEY = 'aspirebet_user'
const USERS_STORAGE_KEY = 'aspirebet_users'
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

function normalizeLocalPhone(phone: string): string {
  return phone.replace(/\s+/g, '').replace(/^(\+254|254)/, '0')
}

function normalizeApiPhone(phone: string): string {
  return normalizeLocalPhone(phone).replace(/^0/, '').slice(-9)
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

  // Persist user to localStorage
  const persistUser = useCallback((userData: User | null) => {
    if (userData) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(userData))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
    setUser(userData)
  }, [])

  const readStoredCredentials = useCallback((): StoredUserCredential[] => {
    const raw = localStorage.getItem(USERS_STORAGE_KEY)
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }, [])

  const upsertStoredCredentials = useCallback((phone: string, password: string, userData: User) => {
    const existingUsers = readStoredCredentials().filter(
      entry => normalizeLocalPhone(entry.phone) !== normalizeLocalPhone(phone)
    )

    existingUsers.push({
      phone: normalizeLocalPhone(phone),
      password,
      userId: userData.id,
      username: userData.username,
    })

    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(existingUsers))
  }, [readStoredCredentials])

  const ensureBackendSession = useCallback(async (currentUser: User, password: string) => {
    if (!password) return

    const apiBaseUrl = getApiBaseUrl()
    const existingToken = getStoredToken()

    if (existingToken) {
      try {
        const meResponse = await fetch(`${apiBaseUrl}/api/auth/me`, {
          headers: { Authorization: `Bearer ${existingToken}` },
        })

        if (meResponse.ok) {
          const meData = await meResponse.json()
          if (meData?.user) {
            persistUser(normalizeUser(meData.user))
          }
          return
        }

        clearStoredToken()
      } catch (error) {
        console.error('Auth session check failed:', error)
      }
    }

    try {
      const loginResponse = await fetch(`${apiBaseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: normalizeApiPhone(currentUser.phone),
          password,
        }),
      })

      const loginData = await loginResponse.json().catch(() => null)
      if (loginResponse.ok && loginData?.token && loginData?.user) {
        setStoredToken(loginData.token)
        persistUser(normalizeUser(loginData.user))
        return
      }

      if (loginResponse.status !== 401 && loginResponse.status !== 404) {
        console.error('Backend login sync failed:', loginData?.error || loginResponse.statusText)
        return
      }

      const registerResponse = await fetch(`${apiBaseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: normalizeApiPhone(currentUser.phone),
          password,
          username: currentUser.username,
        }),
      })

      const registerData = await registerResponse.json().catch(() => null)
      if (registerResponse.ok && registerData?.token && registerData?.user) {
        setStoredToken(registerData.token)
        persistUser(normalizeUser(registerData.user))
        return
      }

      console.error('Backend register sync failed:', registerData?.error || registerResponse.statusText)
    } catch (error) {
      console.error('Backend auth sync failed:', error)
    }
  }, [persistUser])

  // Load user from localStorage and recover backend session on mount
  useEffect(() => {
    const loadAuth = async () => {
      let storedUser: User | null = null
      const stored = localStorage.getItem(STORAGE_KEY)

      if (stored) {
        try {
          storedUser = JSON.parse(stored)
          setUser(storedUser)
        } catch {
          localStorage.removeItem(STORAGE_KEY)
        }
      }

      const token = getStoredToken()
      if (token) {
        try {
          const response = await fetch(`${getApiBaseUrl()}/api/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
          })

          if (response.ok) {
            const data = await response.json()
            if (data?.user) {
              const normalized = normalizeUser(data.user)
              persistUser(normalized)
            }
          } else {
            clearStoredToken()
          }
        } catch (error) {
          console.error('Auth bootstrap failed:', error)
        } finally {
          setIsLoading(false)
        }
        return
      }

      if (storedUser) {
        const credentials = readStoredCredentials()
        const matchingCredentials = credentials.find(
          entry => normalizeLocalPhone(entry.phone) === normalizeLocalPhone(storedUser!.phone)
        )

        if (matchingCredentials?.password) {
          await ensureBackendSession(storedUser, matchingCredentials.password)
        }
      }

      setIsLoading(false)
    }

    void loadAuth()
  }, [ensureBackendSession, persistUser, readStoredCredentials])

  // Register new user (now accepts auto-generated username)
  const register = useCallback(async (phone: string, password: string, autoUsername?: string): Promise<{ success: boolean; error?: string }> => {
    const cleanPhone = normalizeLocalPhone(phone)

    if (password.length < 4) {
      return { success: false, error: 'Password must be at least 4 characters' }
    }

    const username = autoUsername || `User${cleanPhone.slice(-4)}`
    const apiBaseUrl = getApiBaseUrl()

    try {
      const response = await fetch(`${apiBaseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone, password, username }),
      })

      const data = await response.json().catch(() => null)
      if (response.ok && data?.token && data?.user) {
        setStoredToken(data.token)
        const normalized = normalizeUser(data.user)
        persistUser(normalized)
        upsertStoredCredentials(cleanPhone, password, normalized)
        return { success: true }
      }

      if (response.ok) {
        return { success: false, error: 'Registration failed' }
      }

      if (data?.error) {
        return { success: false, error: data.error }
      }
    } catch {
      // Fall back to local-only auth mode if backend is unavailable
    }

    const existingUsers = readStoredCredentials()
    if (existingUsers.some((entry) => normalizeLocalPhone(entry.phone) === cleanPhone)) {
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
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(existingUsers))

    clearStoredToken()
    persistUser(newUser)
    void ensureBackendSession(newUser, password)
    return { success: true }
  }, [ensureBackendSession, persistUser, readStoredCredentials, upsertStoredCredentials])

  // Login existing user
  const login = useCallback(async (phone: string, password: string): Promise<{ success: boolean; error?: string }> => {
    const cleanPhone = normalizeLocalPhone(phone)
    const apiBaseUrl = getApiBaseUrl()

    try {
      const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone, password }),
      })

      const data = await response.json().catch(() => null)
      if (response.ok && data?.token && data?.user) {
        setStoredToken(data.token)
        const normalized = normalizeUser(data.user)
        persistUser(normalized)
        upsertStoredCredentials(cleanPhone, password, normalized)
        return { success: true }
      }

      if (!response.ok) {
        const existingUsers = readStoredCredentials()
        const userCreds = existingUsers.find(
          (entry) => normalizeLocalPhone(entry.phone) === cleanPhone
        )

        if (!userCreds || userCreds.password !== password) {
          return { success: false, error: data?.error || 'Login failed' }
        }
      }
    } catch {
      // Fall back to local-only auth mode if backend is unavailable
    }

    const existingUsers = readStoredCredentials()
    const userCreds = existingUsers.find((entry) => normalizeLocalPhone(entry.phone) === cleanPhone)
    if (!userCreds) {
      return { success: false, error: 'Phone number not registered' }
    }
    if (userCreds.password !== password) {
      return { success: false, error: 'Incorrect password' }
    }

    clearStoredToken()

    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const userData = JSON.parse(stored)
        if (userData.phone === cleanPhone) {
          persistUser(userData)
          void ensureBackendSession(userData, password)
          return { success: true }
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY)
      }
    }

    const fallbackUser: User = {
      id: userCreds.userId || `user_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
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
    void ensureBackendSession(fallbackUser, password)
    return { success: true }
  }, [ensureBackendSession, persistUser, readStoredCredentials, upsertStoredCredentials])

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
