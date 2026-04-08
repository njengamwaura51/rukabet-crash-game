import { useState, useEffect } from 'react'
import { Link } from 'wouter'
import { useConfig } from '@/hooks/useConfig'

const ADMIN_TOKEN_STORAGE_KEY = 'rukabet_admin_token'

type SettingsPayload = {
  intasendPublicKey?: string
  intasend_public_key?: string
  intasendSecretKey?: string
  intasend_secret_key?: string
  companyName?: string
  company_name?: string
}

function normalizeSettings(settings: SettingsPayload) {
  return {
    intasendPublicKey: settings.intasendPublicKey || settings.intasend_public_key || '',
    intasendSecretKey: settings.intasendSecretKey || settings.intasend_secret_key || '',
    companyName: settings.companyName || settings.company_name || 'RUKA TECH SOLUTIONS',
  }
}

export default function AdminDashboard() {
  const { config, updateConfig } = useConfig()
  const [adminToken, setAdminToken] = useState(() => localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) || '')
  const [tokenInput, setTokenInput] = useState(adminToken)
  const [isAuthenticated, setIsAuthenticated] = useState(!!adminToken)
  const [authError, setAuthError] = useState('')
  const [whatsapp, setWhatsapp] = useState(config.whatsappSupportNumber)
  const [saved, setSaved] = useState(false)

  const [paymentConfig, setPaymentConfig] = useState({
    intasendPublicKey: '',
    intasendSecretKey: '',
    companyName: 'RUKA TECH SOLUTIONS',
  })
  const [paymentSaved, setPaymentSaved] = useState(false)
  const [paymentLoading, setPaymentLoading] = useState(true)
  const [paymentError, setPaymentError] = useState('')

  useEffect(() => {
    const fetchSettings = async () => {
      if (!adminToken) {
        setIsAuthenticated(false)
        setPaymentLoading(false)
        return
      }

      setPaymentLoading(true)
      try {
        const response = await fetch(`${config.apiBaseUrl}/api/settings`, {
          headers: {
            'X-Admin-Token': adminToken,
          },
        })

        if (response.status === 403) {
          localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY)
          setAdminToken('')
          setIsAuthenticated(false)
          setAuthError('Invalid admin token')
          return
        }

        if (!response.ok) {
          setPaymentError('Failed to load settings')
          return
        }

        const data = await response.json()
        const settings = data.settings || data
        setPaymentConfig(normalizeSettings(settings))
        setIsAuthenticated(true)
        setAuthError('')
        setPaymentError('')
      } catch (error) {
        console.error('Failed to load settings:', error)
        setPaymentError('Network error. Is the backend running?')
      } finally {
        setPaymentLoading(false)
      }
    }
    fetchSettings()
  }, [config.apiBaseUrl, adminToken])

  const handleAdminLogin = () => {
    const token = tokenInput.trim()
    if (!token) {
      setAuthError('Admin token is required')
      return
    }
    localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token)
    setAdminToken(token)
    setAuthError('')
  }

  const handleAdminLogout = () => {
    localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY)
    setAdminToken('')
    setTokenInput('')
    setIsAuthenticated(false)
  }

  const handleSave = () => {
    const cleaned = whatsapp.replace(/\s+/g, '').replace(/^\+/, '')
    updateConfig({ whatsappSupportNumber: cleaned })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handlePaymentSave = async () => {
    if (!adminToken) {
      setIsAuthenticated(false)
      setAuthError('Admin token is required')
      return
    }

    setPaymentError('')
    setPaymentLoading(true)

    try {
      const response = await fetch(`${config.apiBaseUrl}/api/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Token': adminToken,
        },
        body: JSON.stringify({
          intasend_public_key: paymentConfig.intasendPublicKey,
          intasend_secret_key: paymentConfig.intasendSecretKey,
          company_name: paymentConfig.companyName,
        }),
      })

      if (response.ok) {
        setPaymentSaved(true)
        setTimeout(() => setPaymentSaved(false), 2000)
      } else {
        const data = await response.json()
        if (response.status === 403) {
          localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY)
          setAdminToken('')
          setIsAuthenticated(false)
          setAuthError('Invalid admin token')
          return
        }
        setPaymentError(data.error || 'Failed to save settings')
      }
    } catch (error) {
      setPaymentError('Network error. Is the backend running?')
    } finally {
      setPaymentLoading(false)
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#0b0e11] text-white p-6">
        <div className="max-w-md mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <img src="/logo.png" alt="RukaBet" className="h-10 w-auto" />
              <p className="text-white/50 text-sm mt-1">Admin Login</p>
            </div>
            <Link to="/">
              <button className="px-4 py-2 bg-[#1a1d24] border border-white/10 rounded-lg text-white/70 hover:text-white hover:border-white/20 transition-all text-sm font-bold">
                ← Back to Game
              </button>
            </Link>
          </div>

          <div className="bg-[#1a1d24] rounded-2xl border border-white/10 p-6">
            <h2 className="text-lg font-bold mb-4">Enter Admin Token</h2>
            {authError && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                {authError}
              </div>
            )}
            <input
              type="password"
              value={tokenInput}
              onChange={e => setTokenInput(e.target.value)}
              placeholder="Admin token"
              className="w-full bg-[#0f1318] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#00C74D] transition-colors mb-4"
            />
            <button
              onClick={handleAdminLogin}
              className="w-full py-3 rounded-lg font-bold bg-[#00C74D]/20 text-[#00C74D] hover:bg-[#00C74D]/30 transition-all"
            >
              Login to Admin Dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0b0e11] text-white p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <img src="/logo.png" alt="RukaBet" className="h-10 w-auto" />
            <p className="text-white/50 text-sm mt-1">Manage your game settings</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleAdminLogout}
              className="px-4 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 hover:text-red-300 transition-all text-sm font-bold"
            >
              Logout
            </button>
            <Link to="/">
              <button className="px-4 py-2 bg-[#1a1d24] border border-white/10 rounded-lg text-white/70 hover:text-white hover:border-white/20 transition-all text-sm font-bold">
                ← Back to Game
              </button>
            </Link>
          </div>
        </div>

        <div className="bg-[#1a1d24] rounded-2xl border border-white/10 p-6">
          <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
            <span className="text-xl">⚙️</span>
            Support Settings
          </h2>

          <div className="mb-6">
            <label className="block text-white/70 text-sm font-bold mb-2">
              WhatsApp Support Number
            </label>
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 text-sm">+</span>
                <input
                  type="tel"
                  value={whatsapp}
                  onChange={e => setWhatsapp(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="254713934411"
                  className="w-full bg-[#0f1318] border border-white/10 rounded-lg pl-8 pr-4 py-3 text-white font-mono focus:outline-none focus:border-[#00C74D] transition-colors"
                />
              </div>
              <button
                onClick={handleSave}
                className={`px-6 py-3 rounded-lg font-bold transition-all ${
                  saved
                    ? 'bg-[#00C74D] text-black'
                    : 'bg-[#00C74D]/20 text-[#00C74D] hover:bg-[#00C74D]/30'
                }`}
              >
                {saved ? '✓ Saved' : 'Save'}
              </button>
            </div>
            <p className="text-white/40 text-xs mt-2">
              Format: Country code + number (e.g., 254713934411)
            </p>
          </div>

          <div className="bg-[#0f1318] rounded-lg p-4 border border-white/5">
            <span className="text-white/50 text-xs font-bold uppercase tracking-wider">Preview</span>
            <div className="mt-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#25D366] flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
              </div>
              <div>
                <a
                  href={`https://wa.me/${config.whatsappSupportNumber}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white hover:text-[#00C74D] font-bold transition-colors"
                >
                  +{config.whatsappSupportNumber}
                </a>
                <p className="text-white/40 text-xs">Click to open WhatsApp</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-[#1a1d24] rounded-2xl border border-white/10 p-6 mt-6">
          <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
            <span className="text-xl">💳</span>
            Payment Gateway (IntaSend)
          </h2>

          {paymentError && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {paymentError}
            </div>
          )}

          <div className="mb-4">
            <label className="block text-white/70 text-sm font-bold mb-2">
              Company Name (M-Pesa Display)
            </label>
            <input
              type="text"
              value={paymentConfig.companyName}
              onChange={e => setPaymentConfig(prev => ({ ...prev, companyName: e.target.value }))}
              placeholder="RUKA TECH SOLUTIONS"
              className="w-full bg-[#0f1318] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#00C74D] transition-colors"
            />
            <p className="text-white/40 text-xs mt-1">This appears on customer's M-Pesa prompt</p>
          </div>

          <div className="mb-4">
            <label className="block text-white/70 text-sm font-bold mb-2">
              IntaSend Public Key
            </label>
            <input
              type="text"
              value={paymentConfig.intasendPublicKey}
              onChange={e => setPaymentConfig(prev => ({ ...prev, intasendPublicKey: e.target.value }))}
              placeholder="ISPubKey_live_xxx..."
              className="w-full bg-[#0f1318] border border-white/10 rounded-lg px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-[#00C74D] transition-colors"
            />
          </div>

          <div className="mb-4">
            <label className="block text-white/70 text-sm font-bold mb-2">
              IntaSend Secret Key
            </label>
            <input
              type="password"
              value={paymentConfig.intasendSecretKey}
              onChange={e => setPaymentConfig(prev => ({ ...prev, intasendSecretKey: e.target.value }))}
              placeholder="ISSecretKey_live_xxx..."
              className="w-full bg-[#0f1318] border border-white/10 rounded-lg px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-[#00C74D] transition-colors"
            />
            <p className="text-white/40 text-xs mt-1">Keep this secret! Never share publicly.</p>
          </div>

          <button
            onClick={handlePaymentSave}
            disabled={paymentLoading}
            className={`w-full py-3 rounded-lg font-bold transition-all ${
              paymentSaved
                ? 'bg-[#00C74D] text-black'
                : paymentLoading
                  ? 'bg-[#00C74D]/10 text-[#00C74D]/50 cursor-wait'
                  : 'bg-[#00C74D]/20 text-[#00C74D] hover:bg-[#00C74D]/30'
            }`}
          >
            {paymentSaved ? '✓ Saved' : paymentLoading ? 'Loading...' : 'Save Payment Settings'}
          </button>

          <div className="mt-4 bg-[#0f1318] rounded-lg p-4 border border-white/5">
            <span className="text-white/50 text-xs font-bold uppercase tracking-wider">IntaSend API</span>
            <p className="text-white/40 text-xs mt-2">
              Get your API keys from <a href="https://intasend.com" target="_blank" rel="noopener noreferrer" className="text-[#00C74D] hover:underline">intasend.com</a>.
              Use sandbox keys for testing, live keys for production.
            </p>
          </div>
        </div>

        <div className="mt-6 text-center text-white/30 text-xs">
          RukaBet Admin Panel v1.0
        </div>
      </div>
    </div>
  )
}
