import { useState, useEffect } from 'react'
import { Link } from 'wouter'
import { useConfig } from '@/hooks/useConfig'

type SettingsPayload = {
  intasendPublicKey?: string
  intasend_public_key?: string
  isSecretConfigured?: boolean
  isManagedViaEnv?: boolean
  companyName?: string
  company_name?: string
  whatsappSupport?: string
  whatsapp_support?: string
}

type AdminOverviewPayload = {
  totals: {
    users: number
    newUsers24h: number
    bets: number
    activeBets: number
    completedDeposits: number
    pendingDeposits: number
    totalWithdrawals?: number
    totalDepositsAmount: number
    totalWagered: number
    totalWins: number
    houseGross: number
  }
  recentUsers: Array<{
    _id: string
    username: string
    phone: string
    balance: number
    createdAt: string
  }>
  recentDeposits: Array<{
    _id: string
    amount: number
    status: string
    apiRef: string
    createdAt: string
    userId?: { username?: string; phone?: string }
  }>
  recentWithdrawals?: Array<{
    _id: string
    amount: number
    status: string
    phone: string
    createdAt: string
    userId?: { username?: string; phone?: string }
  }>
  recentBets: Array<{
    _id: string
    roundId: string
    amount: number
    status: string
    multiplierCaught: number | null
    winAmount: number
    createdAt: string
    userId?: { username?: string; phone?: string }
  }>
  topPlayers: Array<{
    userId: string
    username: string
    phone: string
    totalBetAmount: number
    totalWinAmount: number
    totalBets: number
  }>
}

function formatMoney(value: number) {
  return `KSH ${Number(value || 0).toLocaleString()}`
}

function formatDate(value: string) {
  return new Date(value).toLocaleString()
}

export default function AdminDashboard() {
  const { config, updateConfig } = useConfig()
  const [adminToken, setAdminToken] = useState<string | null>(() => {
    return typeof window !== 'undefined' ? sessionStorage.getItem('rukabet_admin_token') : null
  })
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return typeof window !== 'undefined' ? !!sessionStorage.getItem('rukabet_admin_token') : false
  })

  const [usernameInput, setUsernameInput] = useState('')
  const [passwordInput, setPasswordInput] = useState('')
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [authError, setAuthError] = useState('')

  const [whatsapp, setWhatsapp] = useState(config.whatsappSupportNumber)
  const [saved, setSaved] = useState(false)

  const [paymentConfig, setPaymentConfig] = useState({
    intasendPublicKey: '',
    companyName: 'RUKA TECH SOLUTIONS',
  })
  const [newSecretKey, setNewSecretKey] = useState('')
  const [isSecretConfigured, setIsSecretConfigured] = useState(false)
  const [isManagedViaEnv, setIsManagedViaEnv] = useState(false)

  const [paymentSaved, setPaymentSaved] = useState(false)
  const [paymentLoading, setPaymentLoading] = useState(true)
  const [paymentError, setPaymentError] = useState('')
  const [overview, setOverview] = useState<AdminOverviewPayload | null>(null)
  const [overviewLoading, setOverviewLoading] = useState(true)
  const [overviewError, setOverviewError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  // Fetch settings & overview when authenticated
  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!adminToken) {
        setIsAuthenticated(false)
        setPaymentLoading(false)
        setOverviewLoading(false)
        setIsAuthenticating(false)
        return
      }

      setPaymentLoading(true)
      setOverviewLoading(true)
      try {
        const [settingsResponse, overviewResponse] = await Promise.all([
          fetch(`${config.apiBaseUrl}/api/settings`, {
            headers: {
              Authorization: `Bearer ${adminToken}`,
            },
          }),
          fetch(`${config.apiBaseUrl}/api/admin/overview`, {
            headers: {
              Authorization: `Bearer ${adminToken}`,
            },
          }),
        ])

        if (settingsResponse.status === 401 || settingsResponse.status === 403 ||
            overviewResponse.status === 401 || overviewResponse.status === 403) {
          sessionStorage.removeItem('rukabet_admin_token')
          setAdminToken(null)
          setIsAuthenticated(false)
          setAuthError('Admin session expired. Please sign in again.')
          return
        }

        if (settingsResponse.ok) {
          const data = await settingsResponse.json()
          const settings: SettingsPayload = data.settings || data
          setPaymentConfig({
            intasendPublicKey: settings.intasendPublicKey || settings.intasend_public_key || '',
            companyName: settings.companyName || settings.company_name || 'RUKA TECH SOLUTIONS',
          })
          setIsSecretConfigured(Boolean(settings.isSecretConfigured))
          setIsManagedViaEnv(Boolean(settings.isManagedViaEnv))

          const supportNum = settings.whatsappSupport || settings.whatsapp_support || ''
          if (supportNum) {
            setWhatsapp(supportNum)
            updateConfig({ whatsappSupportNumber: supportNum })
          }
          setIsAuthenticated(true)
          setAuthError('')
          setPaymentError('')
        }

        if (overviewResponse.ok) {
          const overviewData = await overviewResponse.json()
          setOverview(overviewData.overview)
          setOverviewError('')
        } else {
          setOverviewError('Failed to load admin analytics')
        }
      } catch (error) {
        console.error('Failed to load admin dashboard data:', error)
        setPaymentError('Network error connecting to backend')
        setOverviewError('Network error loading analytics')
      } finally {
        setPaymentLoading(false)
        setOverviewLoading(false)
      }
    }

    fetchDashboardData()
  }, [config.apiBaseUrl, adminToken, refreshKey, updateConfig])

  const handleAdminLogin = async (event?: React.FormEvent) => {
    event?.preventDefault()
    const username = usernameInput.trim()
    const password = passwordInput

    if (!username || !password) {
      setAuthError('Username and password are required')
      return
    }

    setIsAuthenticating(true)
    setAuthError('')

    try {
      const response = await fetch(`${config.apiBaseUrl}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      const data = await response.json().catch(() => null)
      if (response.ok && data?.token) {
        sessionStorage.setItem('rukabet_admin_token', data.token)
        setAdminToken(data.token)
        setIsAuthenticated(true)
        setUsernameInput('')
        setPasswordInput('')
      } else {
        setAuthError(data?.error || 'Invalid admin credentials')
      }
    } catch {
      setAuthError('Network error connecting to server')
    } finally {
      setIsAuthenticating(false)
    }
  }

  const handleAdminLogout = () => {
    sessionStorage.removeItem('rukabet_admin_token')
    setAdminToken(null)
    setIsAuthenticated(false)
    setOverview(null)
    setUsernameInput('')
    setPasswordInput('')
  }

  const handleSaveSupport = async () => {
    if (!adminToken) return

    const cleaned = whatsapp.replace(/\s+/g, '').replace(/^\+/, '')
    setPaymentError('')
    try {
      const response = await fetch(`${config.apiBaseUrl}/api/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          whatsapp_support: cleaned,
        }),
      })

      if (response.ok) {
        updateConfig({ whatsappSupportNumber: cleaned })
        setWhatsapp(cleaned)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } else {
        const data = await response.json().catch(() => null)
        setPaymentError(data?.error || 'Failed to save WhatsApp support number')
      }
    } catch {
      setPaymentError('Network error. Is the backend running?')
    }
  }

  const handlePaymentSave = async () => {
    if (!adminToken) return

    setPaymentError('')
    setPaymentLoading(true)

    try {
      const payload: any = {
        company_name: paymentConfig.companyName,
        intasend_public_key: paymentConfig.intasendPublicKey,
      }

      // Only send secret key if admin explicitly typed a new one
      if (newSecretKey.trim().length > 0) {
        payload.intasend_secret_key = newSecretKey.trim()
      }

      const response = await fetch(`${config.apiBaseUrl}/api/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        const data = await response.json()
        setPaymentSaved(true)
        setNewSecretKey('')
        if (data?.settings) {
          setIsSecretConfigured(Boolean(data.settings.isSecretConfigured))
          setIsManagedViaEnv(Boolean(data.settings.isManagedViaEnv))
        }
        setTimeout(() => setPaymentSaved(false), 2000)
      } else {
        const data = await response.json()
        setPaymentError(data?.error || 'Failed to save payment settings')
      }
    } catch {
      setPaymentError('Network error. Is the backend running?')
    } finally {
      setPaymentLoading(false)
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-dvh bg-page text-ink p-4 sm:p-6">
        <div className="max-w-md mx-auto">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
            <div>
              <img src="/logo.png" alt="RukaBet" className="h-10 w-auto" />
              <p className="text-ink-2 text-sm mt-1">Admin Portal</p>
            </div>
            <Link to="/">
              <button className="min-h-10 px-4 py-2 bg-panel border border-line rounded-lg text-ink-2 hover:text-ink hover:border-line-strong transition-all text-sm font-bold">
                Back to game
              </button>
            </Link>
          </div>

          <div className="bg-panel rounded-lg border border-line p-4 sm:p-6">
            <h2 className="text-lg font-semibold mb-4">Admin Login</h2>
            {authError && (
              <div className="mb-4 p-3 bg-loss/10 border border-loss/30 rounded-lg text-loss text-sm">
                {authError}
              </div>
            )}
            <form onSubmit={handleAdminLogin}>
              <div className="mb-4">
                <label className="block text-ink-2 text-xs font-bold mb-1">Username</label>
                <input
                  type="text"
                  value={usernameInput}
                  onChange={e => setUsernameInput(e.target.value)}
                  placeholder="pirate101"
                  className="w-full bg-field border border-line rounded-lg px-4 py-3 text-ink focus-visible:border-brand transition-colors"
                  required
                />
              </div>
              <div className="mb-5">
                <label className="block text-ink-2 text-xs font-bold mb-1">Password</label>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={e => setPasswordInput(e.target.value)}
                  placeholder="••••••"
                  className="w-full bg-field border border-line rounded-lg px-4 py-3 text-ink focus-visible:border-brand transition-colors"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={isAuthenticating}
                className="w-full py-3 rounded-lg font-bold bg-brand text-brand-ink hover:bg-brand-hover transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isAuthenticating ? 'Signing in...' : 'Login to Admin Dashboard'}
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-page text-ink p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div>
            <img src="/logo.png" alt="RukaBet" className="h-10 w-auto" />
            <p className="text-ink-2 text-sm mt-1">Manage game operations and payments</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setRefreshKey(prev => prev + 1)}
              disabled={overviewLoading || paymentLoading}
              className="min-h-10 px-4 py-2 bg-field border border-line-strong rounded-lg text-ink hover:bg-raised transition-all text-sm font-bold disabled:opacity-50"
            >
              {overviewLoading ? 'Refreshing...' : 'Refresh Data'}
            </button>
            <button
              onClick={handleAdminLogout}
              className="min-h-10 px-4 py-2 bg-field border border-line-strong rounded-lg text-loss hover:bg-raised transition-all text-sm font-bold"
            >
              Logout
            </button>
            <Link to="/">
              <button className="min-h-10 px-4 py-2 bg-panel border border-line rounded-lg text-ink-2 hover:text-ink hover:border-line-strong transition-all text-sm font-bold">
                Back to game
              </button>
            </Link>
          </div>
        </div>

        {/* Support Settings */}
        <div className="bg-panel rounded-lg border border-line p-4 sm:p-6">
          <h2 className="text-lg font-semibold mb-5">
            Support Settings
          </h2>

          <div className="mb-6">
            <label className="block text-ink-2 text-sm font-bold mb-2">
              WhatsApp Support Number
            </label>
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-3 text-sm">+</span>
                <input
                  type="tel"
                  value={whatsapp}
                  onChange={e => setWhatsapp(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="254713934411"
                  className="w-full bg-field border border-line rounded-lg pl-8 pr-4 py-3 text-ink font-mono focus-visible:border-brand transition-colors"
                />
              </div>
              <button
                onClick={handleSaveSupport}
                className="px-6 py-3 rounded-lg font-bold bg-brand text-brand-ink hover:bg-brand-hover transition-all"
              >
                {saved ? 'Saved' : 'Save'}
              </button>
            </div>
            <p className="text-ink-3 text-xs mt-2">
              Format: Country code + number (e.g., 254713934411)
            </p>
          </div>
        </div>

        {/* Payment Gateway (IntaSend) */}
        <div className="bg-panel rounded-lg border border-line p-4 sm:p-6 mt-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold">
              Payment Gateway (IntaSend M-Pesa)
            </h2>
            {isManagedViaEnv && (
              <span className="text-xs bg-brand/10 border border-brand/30 text-brand px-2.5 py-1 rounded-md font-semibold">
                Protected by Heroku Secrets
              </span>
            )}
          </div>

          {paymentError && (
            <div className="mb-4 p-3 bg-loss/10 border border-loss/30 rounded-lg text-loss text-sm">
              {paymentError}
            </div>
          )}

          <div className="mb-4">
            <label className="block text-ink-2 text-sm font-bold mb-2">
              Company Name (M-Pesa Display)
            </label>
            <input
              type="text"
              value={paymentConfig.companyName}
              onChange={e => setPaymentConfig(prev => ({ ...prev, companyName: e.target.value }))}
              placeholder="RUKA TECH SOLUTIONS"
              className="w-full bg-field border border-line rounded-lg px-4 py-3 text-ink focus-visible:border-brand transition-colors"
            />
          </div>

          <div className="mb-4">
            <label className="block text-ink-2 text-sm font-bold mb-2">
              IntaSend Public Key
            </label>
            <input
              type="text"
              value={paymentConfig.intasendPublicKey}
              onChange={e => setPaymentConfig(prev => ({ ...prev, intasendPublicKey: e.target.value }))}
              placeholder="ISPubKey_live_xxx..."
              className="w-full bg-field border border-line rounded-lg px-4 py-3 text-ink font-mono text-base focus-visible:border-brand transition-colors"
            />
          </div>

          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-ink-2 text-sm font-bold">
                IntaSend Secret Key
              </label>
              <span className={`text-xs font-semibold ${isSecretConfigured ? 'text-brand' : 'text-loss'}`}>
                {isSecretConfigured ? '● Stored Securely on Server' : '○ Not Configured'}
              </span>
            </div>
            <input
              type="password"
              value={newSecretKey}
              onChange={e => setNewSecretKey(e.target.value)}
              placeholder={isSecretConfigured ? '•••••••••••••••••••••••••••••••• (Leave blank to keep active secret)' : 'Enter Secret Key'}
              className="w-full bg-field border border-line rounded-lg px-4 py-3 text-ink font-mono text-base focus-visible:border-brand transition-colors"
            />
            <p className="text-ink-3 text-xs mt-1">
              Your secret key is stored securely in environment variables and never transmitted to client browsers.
            </p>
          </div>

          <button
            onClick={handlePaymentSave}
            disabled={paymentLoading}
            className="w-full py-3 rounded-lg font-bold transition-all bg-brand text-brand-ink hover:bg-brand-hover disabled:opacity-60"
          >
            {paymentSaved ? 'Saved Settings' : paymentLoading ? 'Saving...' : 'Save Payment Settings'}
          </button>
        </div>

        {/* Analytics & Overview */}
        <div className="bg-panel rounded-lg border border-line p-4 sm:p-6 mt-6">
          <h2 className="text-lg font-semibold mb-5">
            Game & User Tracking
          </h2>

          {overviewError && (
            <div className="mb-4 p-3 bg-loss/10 border border-loss/30 rounded-lg text-loss text-sm">
              {overviewError}
            </div>
          )}

          {overviewLoading && !overview ? (
            <div className="text-ink-2 text-sm py-8 text-center">Loading analytics...</div>
          ) : overview ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="bg-field border border-line rounded-lg p-4">
                  <p className="text-ink-2 text-xs">Total Users</p>
                  <p className="text-2xl font-bold mt-1">{overview.totals.users}</p>
                  <p className="text-brand text-xs mt-1">+{overview.totals.newUsers24h} last 24h</p>
                </div>
                <div className="bg-field border border-line rounded-lg p-4">
                  <p className="text-ink-2 text-xs">Total Bets</p>
                  <p className="text-2xl font-bold mt-1">{overview.totals.bets}</p>
                  <p className="text-brand text-xs mt-1">{overview.totals.activeBets} active</p>
                </div>
                <div className="bg-field border border-line rounded-lg p-4">
                  <p className="text-ink-2 text-xs">Deposits</p>
                  <p className="text-2xl font-bold mt-1">{formatMoney(overview.totals.totalDepositsAmount)}</p>
                  <p className="text-brand text-xs mt-1">
                    {overview.totals.completedDeposits} complete / {overview.totals.pendingDeposits} pending
                  </p>
                </div>
                <div className="bg-field border border-line rounded-lg p-4">
                  <p className="text-ink-2 text-xs">House Gross</p>
                  <p className="text-2xl font-bold mt-1">{formatMoney(overview.totals.houseGross)}</p>
                  <p className="text-ink-2 text-xs mt-1">Wagered {formatMoney(overview.totals.totalWagered)}</p>
                </div>
              </div>

              {/* Recent Deposits & Withdrawals */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-6">
                <div className="bg-field border border-line rounded-lg p-4 overflow-x-auto">
                  <h3 className="text-sm font-bold text-ink/80 mb-3">Recent Deposits</h3>
                  <table className="w-full min-w-[28rem] text-sm">
                    <thead>
                      <tr className="text-ink-3 text-left">
                        <th className="pb-2">User</th>
                        <th className="pb-2">Amount</th>
                        <th className="pb-2">Status</th>
                        <th className="pb-2">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.recentDeposits.length === 0 ? (
                        <tr><td colSpan={4} className="py-4 text-center text-ink-3">No deposits yet</td></tr>
                      ) : (
                        overview.recentDeposits.map(deposit => (
                          <tr key={deposit._id} className="border-t border-line">
                            <td className="py-2">{deposit.userId?.username || 'Player'}</td>
                            <td className="py-2 text-brand font-semibold">{formatMoney(deposit.amount)}</td>
                            <td className="py-2 text-ink-2">{deposit.status}</td>
                            <td className="py-2 text-ink-2">{formatDate(deposit.createdAt)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="bg-field border border-line rounded-lg p-4 overflow-x-auto">
                  <h3 className="text-sm font-bold text-ink/80 mb-3">Recent Withdrawals</h3>
                  <table className="w-full min-w-[28rem] text-sm">
                    <thead>
                      <tr className="text-ink-3 text-left">
                        <th className="pb-2">Phone</th>
                        <th className="pb-2">Amount</th>
                        <th className="pb-2">Status</th>
                        <th className="pb-2">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(!overview.recentWithdrawals || overview.recentWithdrawals.length === 0) ? (
                        <tr><td colSpan={4} className="py-4 text-center text-ink-3">No withdrawals yet</td></tr>
                      ) : (
                        overview.recentWithdrawals.map(withdrawal => (
                          <tr key={withdrawal._id} className="border-t border-line">
                            <td className="py-2">{withdrawal.phone}</td>
                            <td className="py-2 text-loss font-semibold">{formatMoney(withdrawal.amount)}</td>
                            <td className="py-2 text-ink-2">{withdrawal.status}</td>
                            <td className="py-2 text-ink-2">{formatDate(withdrawal.createdAt)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Recent Users & Recent Bets */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-6">
                <div className="bg-field border border-line rounded-lg p-4 overflow-x-auto">
                  <h3 className="text-sm font-bold text-ink/80 mb-3">Recent Users</h3>
                  <table className="w-full min-w-[28rem] text-sm">
                    <thead>
                      <tr className="text-ink-3 text-left">
                        <th className="pb-2">User</th>
                        <th className="pb-2">Phone</th>
                        <th className="pb-2">Balance</th>
                        <th className="pb-2">Joined</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.recentUsers.map(user => (
                        <tr key={user._id} className="border-t border-line">
                          <td className="py-2">{user.username}</td>
                          <td className="py-2 text-ink-2">{user.phone}</td>
                          <td className="py-2">{formatMoney(user.balance)}</td>
                          <td className="py-2 text-ink-2">{formatDate(user.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="bg-field border border-line rounded-lg p-4 overflow-x-auto">
                  <h3 className="text-sm font-bold text-ink/80 mb-3">Recent Bets</h3>
                  <table className="w-full min-w-[28rem] text-sm">
                    <thead>
                      <tr className="text-ink-3 text-left">
                        <th className="pb-2">User</th>
                        <th className="pb-2">Round</th>
                        <th className="pb-2">Bet</th>
                        <th className="pb-2">Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.recentBets.map(bet => (
                        <tr key={bet._id} className="border-t border-line">
                          <td className="py-2">{bet.userId?.username || 'Player'}</td>
                          <td className="py-2 text-ink-2">{bet.roundId}</td>
                          <td className="py-2">{formatMoney(bet.amount)}</td>
                          <td className="py-2 text-ink-2">
                            {bet.status} {bet.status === 'won' ? `(${formatMoney(bet.winAmount)})` : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="text-ink-2 text-sm">No analytics data available.</div>
          )}
        </div>

        <div className="mt-6 text-center text-ink-3 text-xs">
          RukaBet Admin Panel · Secure Console
        </div>
      </div>
    </div>
  )
}
