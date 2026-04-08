import { useState, useEffect, useCallback, createContext, useContext } from 'react'

// Global app configuration
interface AppConfig {
  brandName: string
  whatsappSupportNumber: string
  apiBaseUrl: string
}

const STORAGE_KEY = 'rukabet_config'
const LOCAL_API_BASE_URL = 'http://localhost:3001'

function getDefaultApiBaseUrl(): string {
  if (typeof window === 'undefined') return LOCAL_API_BASE_URL
  if (import.meta.env.VITE_API_BASE_URL) return import.meta.env.VITE_API_BASE_URL
  const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  return isLocal ? LOCAL_API_BASE_URL : ''
}

const DEFAULT_CONFIG: AppConfig = {
  brandName: 'RukaBet',
  whatsappSupportNumber: '254713934411',
  apiBaseUrl: getDefaultApiBaseUrl(),
}

// Custom hook for config management
export function useConfigState() {
  const [config, setConfig] = useState<AppConfig>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        return { ...DEFAULT_CONFIG, ...JSON.parse(stored) }
      } catch {
        return DEFAULT_CONFIG
      }
    }
    return DEFAULT_CONFIG
  })

  const updateConfig = useCallback((updates: Partial<AppConfig>) => {
    setConfig(prev => {
      const newConfig = { ...prev, ...updates }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig))
      return newConfig
    })
  }, [])

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
