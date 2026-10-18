import { useState, useEffect, useCallback, createContext, useContext } from 'react'

// Global app configuration
export interface AppConfig {
  brandName: string
  companyName?: string
  whatsappSupportNumber: string
  apiBaseUrl: string
  minDeposit?: number
  minWithdrawal?: number
  freebetUnlockAmount?: number
  initialFreebet?: number
  referralReward?: number
  minBet?: number
  maxBet?: number
}

const STORAGE_KEY = 'rukabet_config'
const LOCAL_API_BASE_URL = 'http://localhost:3001'

function getDefaultApiBaseUrl(): string {
  if (typeof window === 'undefined') return LOCAL_API_BASE_URL
  if (import.meta.env.VITE_API_BASE_URL) return import.meta.env.VITE_API_BASE_URL
  const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  return isLocal ? LOCAL_API_BASE_URL : ''
}

function normalizeApiBaseUrl(value?: string): string {
  if (typeof window === 'undefined') {
    return (value || getDefaultApiBaseUrl()).trim()
  }

  const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  const fallback = getDefaultApiBaseUrl()
  const raw = (value || '').trim()

  if (!raw) return fallback

  try {
    const parsed = new URL(raw, window.location.origin)
    const isLocalTarget = ['localhost', '127.0.0.1'].includes(parsed.hostname)

    // Prevent stale localhost API URLs from breaking production sessions.
    if (!isLocalHost && isLocalTarget) return ''

    // Avoid mixed-content failures in HTTPS environments.
    if (window.location.protocol === 'https:' && parsed.protocol === 'http:' && !isLocalTarget) {
      parsed.protocol = 'https:'
    }

    // Same-origin API can use relative paths.
    if (!isLocalHost && parsed.origin === window.location.origin) return ''

    return parsed.origin
  } catch {
    return fallback
  }
}

const DEFAULT_CONFIG: AppConfig = {
  brandName: 'RukaBet',
  companyName: 'RUKA TECH SOLUTIONS',
  whatsappSupportNumber: '254713934411',
  apiBaseUrl: getDefaultApiBaseUrl(),
  minDeposit: 10,
  minWithdrawal: 50,
  freebetUnlockAmount: 50,
  initialFreebet: 150,
  referralReward: 20,
  minBet: 10,
  maxBet: 10000,
}

// Custom hook for config management
export function useConfigState() {
  const [config, setConfig] = useState<AppConfig>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const merged = { ...DEFAULT_CONFIG, ...JSON.parse(stored) }
        return { ...merged, apiBaseUrl: normalizeApiBaseUrl(merged.apiBaseUrl) }
      } catch {
        return { ...DEFAULT_CONFIG, apiBaseUrl: normalizeApiBaseUrl(DEFAULT_CONFIG.apiBaseUrl) }
      }
    }
    return { ...DEFAULT_CONFIG, apiBaseUrl: normalizeApiBaseUrl(DEFAULT_CONFIG.apiBaseUrl) }
  })

  const updateConfig = useCallback((updates: Partial<AppConfig>) => {
    setConfig(prev => {
      const merged = { ...prev, ...updates }
      const newConfig = { ...merged, apiBaseUrl: normalizeApiBaseUrl(merged.apiBaseUrl) }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig))
      return newConfig
    })
  }, [])

  useEffect(() => {
    const syncPublicConfig = async () => {
      try {
        const response = await fetch(`${config.apiBaseUrl}/api/public-config`)
        if (!response.ok) return
        const data = await response.json()
        if (data?.config) {
          const updates: Partial<AppConfig> = {}
          if (data.config.brandName) updates.brandName = data.config.brandName
          if (data.config.companyName) updates.companyName = data.config.companyName
          if (typeof data.config.whatsappSupportNumber === 'string' && data.config.whatsappSupportNumber.trim()) {
            updates.whatsappSupportNumber = data.config.whatsappSupportNumber.trim()
          }
          if (typeof data.config.minDeposit === 'number') updates.minDeposit = data.config.minDeposit
          if (typeof data.config.minWithdrawal === 'number') updates.minWithdrawal = data.config.minWithdrawal
          if (typeof data.config.freebetUnlockAmount === 'number') updates.freebetUnlockAmount = data.config.freebetUnlockAmount
          if (typeof data.config.initialFreebet === 'number') updates.initialFreebet = data.config.initialFreebet
          if (typeof data.config.referralReward === 'number') updates.referralReward = data.config.referralReward
          if (typeof data.config.minBet === 'number') updates.minBet = data.config.minBet
          if (typeof data.config.maxBet === 'number') updates.maxBet = data.config.maxBet
          updateConfig(updates)
        }
      } catch {
        // keep local config if public config is unavailable
      }
    }

    void syncPublicConfig()
  }, [config.apiBaseUrl, updateConfig])

  return { config, updateConfig }
}

// Context for global access
interface ConfigContextType {
  config: AppConfig
  updateConfig: (updates: Partial<AppConfig>) => void
}

export const ConfigContext = createContext<ConfigContextType>({
  config: DEFAULT_CONFIG,
  updateConfig: () => {},
})

export function useConfig() {
  return useContext(ConfigContext)
}
