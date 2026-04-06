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
const INITIAL_FREEBET = 150

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
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        setUser(parsed)
      } catch {
        localStorage.removeItem(STORAGE_KEY)
      }
    }
    setIsLoading(false)
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
  const register = useCallback((phone: string, password: string, autoUsername?: string): { success: boolean; error?: string } => {
    // Phone should already be validated and normalized by AuthModal
    const cleanPhone = phone.replace(/\s+/g, '').replace(/^(\+254|254)/, '0')

    // Validate password
    if (password.length < 4) {
      return { success: false, error: 'Password must be at least 4 characters' }
    }

    // Check if user already exists
    const existingUsers = JSON.parse(localStorage.getItem('aspirebet_users') || '[]')
    if (existingUsers.some((u: any) => u.phone === cleanPhone)) {
      return { success: false, error: 'This phone number is already registered' }
    }

    // Use auto-generated username or fallback to phone-based
    const username = autoUsername || `User${cleanPhone.slice(-4)}`

    // Create new user
    const newUser: User = {
      id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      phone: cleanPhone,
      username,
      balance: 0,
      freebet: INITIAL_FREEBET,
      freebetLocked: true, // Locked until deposit 20 and play
      hasDeposited: false,
      hasPlayedWithMoney: false,
      createdAt: Date.now(),
    }

    // Store user credentials (in real app, this would be server-side)
    existingUsers.push({ phone: cleanPhone, password, userId: newUser.id, username })
    localStorage.setItem('aspirebet_users', JSON.stringify(existingUsers))

    persistUser(newUser)
    return { success: true }
  }, [persistUser])

  // Login existing user
  const login = useCallback((phone: string, password: string): { success: boolean; error?: string } => {
    const cleanPhone = phone.replace(/\s+/g, '').replace(/^(\+254|254)/, '0')
    
    const existingUsers = JSON.parse(localStorage.getItem('aspirebet_users') || '[]')
    const userCreds = existingUsers.find((u: any) => u.phone === cleanPhone)
    
    if (!userCreds) {
      return { success: false, error: 'Phone number not registered' }
    }
    
    if (userCreds.password !== password) {
      return { success: false, error: 'Incorrect password' }
    }

    // Load user data
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
