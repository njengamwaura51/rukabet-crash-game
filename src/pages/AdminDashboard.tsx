import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link } from 'wouter'
import { 
  Users, DollarSign, Activity, TrendingUp, Key, Lock, Unlock, Shield, 
  Search, RefreshCw, CheckCircle2, XCircle, AlertTriangle, Eye, EyeOff, 
  CreditCard, ArrowDownRight, ArrowUpRight, Settings as SettingsIcon, 
  Copy, Check, LogOut, ChevronRight, UserCheck, UserX, AlertCircle, ArrowRight,
  Zap, Sparkles, Timer, Sliders, Flame, Clock
} from 'lucide-react'
import { useConfig } from '@/hooks/useConfig'

type OddsEngineLiveState = {
  enabled: boolean
  mode: 'normal' | 'range' | 'min_multiplier' | 'exact'
  minMultiplier: number
  maxMultiplier: number
  exactMultiplier?: number
  durationType: 'minutes' | 'rounds' | 'scheduled_window' | 'indefinite'
  durationMinutes: number
  roundsTotal: number
  roundsRemaining: number
  scheduledStartTime?: number
  scheduledEndTime?: number
  startedAt?: number
  expiresAt?: number
  timeRemainingMs: number
  timeRemainingSeconds: number
  lastActivatedBy: string
}

type OddsAuditLog = {
  activatedAt: string
  expiredAt?: string
  mode: string
  minMultiplier: number
  maxMultiplier?: number
  durationType: string
  durationMinutes?: number
  roundsTotal?: number
  activatedBy: string
  reason?: string
}

type SettingsPayload = {
  intasendPublicKey?: string
  intasend_public_key?: string
  isSecretConfigured?: boolean
  isManagedViaAdmin?: boolean
  companyName?: string
  company_name?: string
  whatsappSupport?: string
  whatsapp_support?: string
  minDeposit?: number
  minWithdrawal?: number
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

type AdminUser = {
  _id: string
  username: string
  phone: string
  balance: number
  freebet: number
  freebetLocked: boolean
  isFrozen?: boolean
  referralsCount?: number
  referralsEarnings?: number
  wagerProgress?: number
  wagerRequired?: number
  createdAt: string
}

type AdminWithdrawal = {
  _id: string
  phone: string
  amount: number
  status: 'pending' | 'completed' | 'failed' | 'rejected'
  createdAt: string
  userId?: {
    _id: string
    username: string
    phone: string
    balance?: number
  }
}

type UserDetailData = {
  user: AdminUser
  stats: {
    totalBets: number
    totalWagered: number
    totalWon: number
    netProfitLoss: number
  }
  recentBets: Array<any>
  recentDeposits: Array<any>
  recentWithdrawals: Array<any>
}

function formatMoney(value: number) {
  return `KSH ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function formatDate(value: string) {
  if (!value) return '-'
  const d = new Date(value)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function AdminDashboard() {
  const { config, updateConfig } = useConfig()
  const [adminToken, setAdminToken] = useState<string | null>(() => {
    return typeof window !== 'undefined' ? sessionStorage.getItem('rukabet_admin_token') : null
  })
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return typeof window !== 'undefined' ? !!sessionStorage.getItem('rukabet_admin_token') : false
  })

  // Auth Inputs
  const [usernameInput, setUsernameInput] = useState('')
  const [passwordInput, setPasswordInput] = useState('')
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [authError, setAuthError] = useState('')

  // Active Tab
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'withdrawals' | 'odds' | 'gateway' | 'settings'>('overview')

  // Odds Engine State
  const [oddsEngine, setOddsEngine] = useState<OddsEngineLiveState | null>(null)
  const [oddsAuditLogs, setOddsAuditLogs] = useState<OddsAuditLog[]>([])
  const [oddsSubmitting, setOddsSubmitting] = useState(false)
  const [oddsToast, setOddsToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Odds Form State
  const [oddsMode, setOddsMode] = useState<'range' | 'min_multiplier' | 'exact'>('range')
  const [oddsMin, setOddsMin] = useState('2.0')
  const [oddsMax, setOddsMax] = useState('5.0')
  const [oddsExact, setOddsExact] = useState('3.5')
  const [oddsDurationType, setOddsDurationType] = useState<'minutes' | 'rounds' | 'scheduled_window'>('minutes')
  const [oddsDurationMinutes, setOddsDurationMinutes] = useState('15')
  const [oddsRoundsTotal, setOddsRoundsTotal] = useState('10')
  const [oddsScheduledStart, setOddsScheduledStart] = useState('')
  const [oddsScheduledEnd, setOddsScheduledEnd] = useState('')
  const [oddsNote, setOddsNote] = useState('Reward active users promotional multiplier boost')

  // Overview Data
  const [overview, setOverview] = useState<AdminOverviewPayload | null>(null)
  const [overviewLoading, setOverviewLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  // Users Tab State
  const [usersList, setUsersList] = useState<AdminUser[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [userStatusFilter, setUserStatusFilter] = useState<'all' | 'active' | 'frozen'>('all')
  const [selectedUserForDetail, setSelectedUserForDetail] = useState<UserDetailData | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Modals State
  const [balanceModalUser, setBalanceModalUser] = useState<AdminUser | null>(null)
  const [balanceAmount, setBalanceAmount] = useState('')
  const [balanceType, setBalanceType] = useState<'credit' | 'debit'>('credit')
  const [balanceReason, setBalanceReason] = useState('')
  const [isSubmittingBalance, setIsSubmittingBalance] = useState(false)

  const [freebetModalUser, setFreebetModalUser] = useState<AdminUser | null>(null)
  const [freebetAmount, setFreebetAmount] = useState('')
  const [freebetLocked, setFreebetLocked] = useState(true)
  const [isSubmittingFreebet, setIsSubmittingFreebet] = useState(false)

  const [passwordModalUser, setPasswordModalUser] = useState<AdminUser | null>(null)
  const [newPasswordVal, setNewPasswordVal] = useState('')
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false)

  // Withdrawals Tab State
  const [withdrawalsList, setWithdrawalsList] = useState<AdminWithdrawal[]>([])
  const [withdrawalsLoading, setWithdrawalsLoading] = useState(false)
  const [withdrawalFilter, setWithdrawalFilter] = useState<'all' | 'pending' | 'completed' | 'rejected'>('pending')
  const [updatingWithdrawalId, setUpdatingWithdrawalId] = useState<string | null>(null)

  // Gateway & System Settings State
  const [paymentConfig, setPaymentConfig] = useState({
    intasendPublicKey: '',
    companyName: 'RUKA TECH SOLUTIONS',
    whatsappSupport: '254719858034',
    minDeposit: 10,
    minWithdrawal: 50,
  })
  const [newSecretKey, setNewSecretKey] = useState('')
  const [showSecretKey, setShowSecretKey] = useState(false)
  const [isSecretConfigured, setIsSecretConfigured] = useState(false)
  const [paymentSaved, setPaymentSaved] = useState(false)
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [paymentMessage, setPaymentMessage] = useState('')
  const [copiedWebhook, setCopiedWebhook] = useState(false)

  // Banner Notification
  const [bannerNotice, setBannerNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const showNotice = (type: 'success' | 'error', message: string) => {
    setBannerNotice({ type, message })
    setTimeout(() => setBannerNotice(null), 4500)
  }

  // Fetch Dashboard Overview & Settings
  useEffect(() => {
    if (!adminToken) return

    const loadCoreData = async () => {
      setOverviewLoading(true)
      try {
        const [settingsRes, overviewRes] = await Promise.all([
          fetch(`${config.apiBaseUrl}/api/settings`, {
            headers: { Authorization: `Bearer ${adminToken}` }
          }),
          fetch(`${config.apiBaseUrl}/api/admin/overview`, {
            headers: { Authorization: `Bearer ${adminToken}` }
          })
        ])

        if (settingsRes.status === 401 || overviewRes.status === 401) {
          sessionStorage.removeItem('rukabet_admin_token')
          setAdminToken(null)
          setIsAuthenticated(false)
          setAuthError('Session expired. Please log in again.')
          return
        }

        if (settingsRes.ok) {
          const sData = await settingsRes.json()
          const s: SettingsPayload = sData.settings || sData
          setPaymentConfig({
            intasendPublicKey: s.intasendPublicKey || s.intasend_public_key || '',
            companyName: s.companyName || s.company_name || 'RUKA TECH SOLUTIONS',
            whatsappSupport: s.whatsappSupport || s.whatsapp_support || '254719858034',
            minDeposit: s.minDeposit ?? 10,
            minWithdrawal: s.minWithdrawal ?? 50,
          })
          setIsSecretConfigured(Boolean(s.isSecretConfigured))
        }

        if (overviewRes.ok) {
          const oData = await overviewRes.json()
          setOverview(oData.overview || null)
        }
      } catch (err: any) {
        console.error('Failed to load admin overview:', err)
      } finally {
        setOverviewLoading(false)
      }
    }

    loadCoreData()
  }, [adminToken, config.apiBaseUrl, refreshKey])

  // Fetch Users when Users tab is active
  useEffect(() => {
    if (!adminToken || activeTab !== 'users') return

    const fetchUsers = async () => {
      setUsersLoading(true)
      try {
        const url = new URL(`${config.apiBaseUrl}/api/admin/users`)
        if (userSearch) url.searchParams.set('search', userSearch)
        if (userStatusFilter !== 'all') url.searchParams.set('status', userStatusFilter)

        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${adminToken}` }
        })
        if (res.ok) {
          const data = await res.json()
          setUsersList(data.users || [])
        }
      } catch (err) {
        console.error('Failed to load users:', err)
      } finally {
        setUsersLoading(false)
      }
    }

    const timer = setTimeout(fetchUsers, userSearch ? 300 : 0)
    return () => clearTimeout(timer)
  }, [adminToken, activeTab, userSearch, userStatusFilter, config.apiBaseUrl, refreshKey])

  // Fetch Withdrawals when Withdrawals tab is active
  useEffect(() => {
    if (!adminToken || activeTab !== 'withdrawals') return

    const fetchWithdrawals = async () => {
      setWithdrawalsLoading(true)
      try {
        const url = new URL(`${config.apiBaseUrl}/api/admin/withdrawals`)
        if (withdrawalFilter !== 'all') url.searchParams.set('status', withdrawalFilter)

        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${adminToken}` }
        })
        if (res.ok) {
          const data = await res.json()
          setWithdrawalsList(data.withdrawals || [])
        }
      } catch (err) {
        console.error('Failed to load withdrawals:', err)
      } finally {
        setWithdrawalsLoading(false)
      }
    }

    fetchWithdrawals()
  }, [adminToken, activeTab, withdrawalFilter, config.apiBaseUrl, refreshKey])

  // Fetch Odds Engine Status & Logs
  const fetchOddsEngine = useCallback(async () => {
    if (!adminToken) return
    try {
      const res = await fetch(`${config.apiBaseUrl}/api/admin/odds-engine`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      })
      if (res.ok) {
        const data = await res.json()
        if (data?.success) {
          setOddsEngine(data.state)
          setOddsAuditLogs(data.auditLogs || [])
        }
      }
    } catch (err) {
      console.error('Failed to load odds engine status:', err)
    }
  }, [adminToken, config.apiBaseUrl])

  useEffect(() => {
    if (!adminToken) return
    fetchOddsEngine()
    const interval = setInterval(fetchOddsEngine, 3500)
    return () => clearInterval(interval)
  }, [adminToken, fetchOddsEngine])

  const handleApplyOddsRule = async (customPayload?: any) => {
    if (!adminToken) return
    setOddsSubmitting(true)
    setOddsToast(null)

    const payload = customPayload || {
      mode: oddsMode,
      minMultiplier: parseFloat(oddsMin) || 2.0,
      maxMultiplier: parseFloat(oddsMax) || 5.0,
      exactMultiplier: oddsMode === 'exact' ? (parseFloat(oddsExact) || 2.0) : undefined,
      durationType: oddsDurationType,
      durationMinutes: parseInt(oddsDurationMinutes, 10) || 15,
      roundsTotal: parseInt(oddsRoundsTotal, 10) || 10,
      scheduledStartTime: oddsScheduledStart ? new Date(oddsScheduledStart).toISOString() : undefined,
      scheduledEndTime: oddsScheduledEnd ? new Date(oddsScheduledEnd).toISOString() : undefined,
      note: oddsNote
    }

    try {
      const res = await fetch(`${config.apiBaseUrl}/api/admin/odds-engine`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify(payload)
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.success) {
        setOddsEngine(data.state)
        setOddsToast({ type: 'success', message: data.message || 'Odds Engine rule activated successfully!' })
        fetchOddsEngine()
      } else {
        setOddsToast({ type: 'error', message: data?.error || 'Failed to apply odds engine rule.' })
      }
    } catch {
      setOddsToast({ type: 'error', message: 'Network error while configuring odds engine.' })
    } finally {
      setOddsSubmitting(false)
    }
  }

  const handleResetOddsRule = async () => {
    if (!adminToken) return
    setOddsSubmitting(true)
    setOddsToast(null)
    try {
      const res = await fetch(`${config.apiBaseUrl}/api/admin/odds-engine/reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({ reason: 'Admin manual reset clicked' })
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.success) {
        setOddsEngine(data.state)
        setOddsToast({ type: 'success', message: 'Odds Engine reset to standard normal provably fair mode.' })
        fetchOddsEngine()
      } else {
        setOddsToast({ type: 'error', message: data?.error || 'Failed to reset odds engine.' })
      }
    } catch {
      setOddsToast({ type: 'error', message: 'Network error while resetting odds engine.' })
    } finally {
      setOddsSubmitting(false)
    }
  }

  // Admin Login Handler
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsAuthenticating(true)
    setAuthError('')

    try {
      const res = await fetch(`${config.apiBaseUrl}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: usernameInput.trim(),
          password: passwordInput.trim(),
        }),
      })

      const data = await res.json().catch(() => null)
      if (res.ok && data?.token) {
        sessionStorage.setItem('rukabet_admin_token', data.token)
        setAdminToken(data.token)
        setIsAuthenticated(true)
        setUsernameInput('')
        setPasswordInput('')
      } else {
        setAuthError(data?.error || 'Authentication failed. Check credentials.')
      }
    } catch {
      setAuthError('Connection failed. Verify server status.')
    } finally {
      setIsAuthenticating(false)
    }
  }

  // Admin Logout Handler
  const handleLogout = () => {
    sessionStorage.removeItem('rukabet_admin_token')
    setAdminToken(null)
    setIsAuthenticated(false)
  }

  // User Operations Handlers
  const handleOpenUserDetail = async (userId: string) => {
    setDetailLoading(true)
    try {
      const res = await fetch(`${config.apiBaseUrl}/api/admin/users/${userId}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      })
      if (res.ok) {
        const data = await res.json()
        setSelectedUserForDetail(data)
      }
    } catch (err) {
      showNotice('error', 'Failed to load user details')
    } finally {
      setDetailLoading(false)
    }
  }

  const handleAdjustBalance = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!balanceModalUser || !adminToken) return
    setIsSubmittingBalance(true)

    try {
      const res = await fetch(`${config.apiBaseUrl}/api/admin/users/${balanceModalUser._id}/adjust-balance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          amount: parseFloat(balanceAmount),
          type: balanceType,
          reason: balanceReason.trim() || 'Admin manual balance adjustment'
        })
      })

      const data = await res.json()
      if (res.ok && data.success) {
        showNotice('success', data.message || 'Balance updated successfully')
        setBalanceModalUser(null)
        setBalanceAmount('')
        setBalanceReason('')
        setRefreshKey(k => k + 1)
      } else {
        showNotice('error', data.error || 'Failed to adjust balance')
      }
    } catch {
      showNotice('error', 'Network error while adjusting balance')
    } finally {
      setIsSubmittingBalance(false)
    }
  }

  const handleAdjustFreebet = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!freebetModalUser || !adminToken) return
    setIsSubmittingFreebet(true)

    try {
      const res = await fetch(`${config.apiBaseUrl}/api/admin/users/${freebetModalUser._id}/adjust-freebet`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          amount: parseFloat(freebetAmount),
          freebetLocked
        })
      })

      const data = await res.json()
      if (res.ok && data.success) {
        showNotice('success', data.message || 'Freebet updated')
        setFreebetModalUser(null)
        setFreebetAmount('')
        setRefreshKey(k => k + 1)
      } else {
        showNotice('error', data.error || 'Failed to update freebet')
      }
    } catch {
      showNotice('error', 'Network error while updating freebet')
    } finally {
      setIsSubmittingFreebet(false)
    }
  }

  const handleToggleFreeze = async (user: AdminUser) => {
    if (!adminToken) return
    const action = user.isFrozen ? 'unfreeze' : 'freeze'
    if (!confirm(`Are you sure you want to ${action} account for ${user.username} (${user.phone})?`)) return

    try {
      const res = await fetch(`${config.apiBaseUrl}/api/admin/users/${user._id}/toggle-freeze`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` }
      })

      const data = await res.json()
      if (res.ok && data.success) {
        showNotice('success', data.message)
        setRefreshKey(k => k + 1)
      } else {
        showNotice('error', data.error || 'Failed to change freeze status')
      }
    } catch {
      showNotice('error', 'Network error')
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!passwordModalUser || !adminToken) return
    setIsSubmittingPassword(true)

    try {
      const res = await fetch(`${config.apiBaseUrl}/api/admin/users/${passwordModalUser._id}/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({ newPassword: newPasswordVal })
      })

      const data = await res.json()
      if (res.ok && data.success) {
        showNotice('success', data.message || 'Password reset successfully')
        setPasswordModalUser(null)
        setNewPasswordVal('')
      } else {
        showNotice('error', data.error || 'Failed to reset password')
      }
    } catch {
      showNotice('error', 'Network error')
    } finally {
      setIsSubmittingPassword(false)
    }
  }

  // Withdrawal Action Handler (Complete or Reject)
  const handleUpdateWithdrawal = async (withdrawalId: string, status: 'completed' | 'rejected', amount: number) => {
    if (!adminToken) return
    const promptMsg = status === 'completed'
      ? `Confirm marking withdrawal of KSH ${amount} as COMPLETED / PAID?`
      : `Confirm REJECTING withdrawal of KSH ${amount}? The funds will be automatically refunded back to the user.`

    if (!confirm(promptMsg)) return
    setUpdatingWithdrawalId(withdrawalId)

    try {
      const res = await fetch(`${config.apiBaseUrl}/api/admin/withdrawals/${withdrawalId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({ status })
      })

      const data = await res.json()
      if (res.ok && data.success) {
        showNotice('success', data.message)
        setRefreshKey(k => k + 1)
      } else {
        showNotice('error', data.error || 'Action failed')
      }
    } catch {
      showNotice('error', 'Network error updating withdrawal')
    } finally {
      setUpdatingWithdrawalId(null)
    }
  }

  // Save Payment Gateway (IntaSend) Keys
  const handleSaveGateway = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!adminToken) return
    setPaymentLoading(true)
    setPaymentMessage('')

    try {
      const payload: any = {
        intasendPublicKey: paymentConfig.intasendPublicKey.trim(),
      }
      if (newSecretKey.trim()) {
        payload.intasendSecretKey = newSecretKey.trim()
      }

      const res = await fetch(`${config.apiBaseUrl}/api/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (res.ok && data.success) {
        setIsSecretConfigured(Boolean(data.settings?.isSecretConfigured))
        setNewSecretKey('')
        showNotice('success', 'IntaSend gateway keys saved to database successfully!')
      } else {
        showNotice('error', data.error || 'Failed to save gateway configuration')
      }
    } catch {
      showNotice('error', 'Network error saving gateway keys')
    } finally {
      setPaymentLoading(false)
    }
  }

  // Save General System Settings
  const handleSaveSystemSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!adminToken) return
    setPaymentLoading(true)

    try {
      const payload = {
        companyName: paymentConfig.companyName.trim(),
        whatsappSupport: paymentConfig.whatsappSupport.trim(),
        minDeposit: Number(paymentConfig.minDeposit),
        minWithdrawal: Number(paymentConfig.minWithdrawal),
      }

      const res = await fetch(`${config.apiBaseUrl}/api/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (res.ok && data.success) {
        updateConfig({ whatsappSupportNumber: payload.whatsappSupport })
        showNotice('success', 'System settings saved successfully')
      } else {
        showNotice('error', data.error || 'Failed to save settings')
      }
    } catch {
      showNotice('error', 'Network error saving settings')
    } finally {
      setPaymentLoading(false)
    }
  }

  const copyWebhookUrl = () => {
    const url = `${window.location.origin}/api/webhooks/intasend`
    navigator.clipboard.writeText(url)
    setCopiedWebhook(true)
    setTimeout(() => setCopiedWebhook(false), 2500)
  }

  // Pending withdrawals count
  const pendingWithdrawalCount = overview?.totals.totalWithdrawals ?? 0

  // ══════════════════════════════════════════════════════════════
  // RENDER: LOGIN FORM (IF NOT AUTHENTICATED)
  // ══════════════════════════════════════════════════════════════
  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page px-4 py-12">
        <div className="w-full max-w-sm rounded-xl border border-line bg-panel p-6 shadow-2xl">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <Shield className="size-6" />
            </div>
            <h1 className="text-xl font-bold text-ink">Admin Control Hub</h1>
            <p className="mt-1 text-xs text-ink-3">Sign in with authorized administrative credentials</p>
          </div>

          {authError && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-loss/30 bg-loss/10 p-3 text-xs text-loss">
              <AlertCircle className="size-4 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-2">Admin Username</label>
              <input
                type="text"
                value={usernameInput}
                onChange={e => setUsernameInput(e.target.value)}
                placeholder="Username (e.g. pirate101)"
                required
                className="h-10 w-full rounded-lg border border-line bg-field px-3 text-sm text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-ink-2">Admin Password</label>
              <input
                type="password"
                value={passwordInput}
                onChange={e => setPasswordInput(e.target.value)}
                placeholder="Password"
                required
                className="h-10 w-full rounded-lg border border-line bg-field px-3 text-sm text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={isAuthenticating}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-brand font-semibold text-brand-ink transition-colors hover:bg-brand-hover disabled:opacity-50"
            >
              {isAuthenticating ? <RefreshCw className="size-4 animate-spin" /> : 'Sign In as Admin'}
            </button>

            <div className="pt-2 text-center">
              <Link href="/" className="text-xs text-ink-3 transition-colors hover:text-ink">
                ← Return to Aviator Game
              </Link>
            </div>
          </form>
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════
  // RENDER: AUTHENTICATED ADMIN DASHBOARD
  // ══════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-page text-ink">
      {/* Toast Notification Banner */}
      {bannerNotice && (
        <div className={`fixed right-4 top-4 z-50 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm shadow-xl ${
          bannerNotice.type === 'success' 
            ? 'border-brand/40 bg-brand/15 text-brand backdrop-blur' 
            : 'border-loss/40 bg-loss/15 text-loss backdrop-blur'
        }`}>
          {bannerNotice.type === 'success' ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
          <span>{bannerNotice.message}</span>
        </div>
      )}

      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 border-b border-line bg-panel/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-3 py-2.5 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 text-sm font-bold tracking-wider text-brand">
              <span className="flex size-7 items-center justify-center rounded-lg bg-brand/10">🎮</span>
              RUKABET
            </Link>
            <span className="rounded bg-raised px-2 py-0.5 text-[11px] font-semibold uppercase text-ink-2">
              Admin Ops Hub
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden items-center gap-1.5 rounded-full border border-brand/20 bg-brand/5 px-2.5 py-1 text-xs text-brand sm:inline-flex">
              <span className="size-1.5 rounded-full bg-brand animate-pulse"></span>
              Admin: pirate101
            </span>

            <button
              onClick={() => setRefreshKey(k => k + 1)}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-field px-2.5 text-xs font-medium text-ink-2 hover:bg-raised hover:text-ink"
              title="Refresh all metrics"
            >
              <RefreshCw className="size-3.5" />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <button
              onClick={handleLogout}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-field px-2.5 text-xs font-medium text-loss hover:bg-loss/10"
              title="Logout"
            >
              <LogOut className="size-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>

        {/* Compact Tab Navigation */}
        <div className="mx-auto flex max-w-7xl overflow-x-auto px-3 sm:px-6 border-t border-line/50">
          <div className="flex space-x-1 py-1 text-xs font-medium">
            <button
              onClick={() => setActiveTab('overview')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${
                activeTab === 'overview' ? 'bg-raised text-brand font-semibold' : 'text-ink-3 hover:text-ink hover:bg-field'
              }`}
            >
              <Activity className="size-3.5" />
              Overview
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${
                activeTab === 'users' ? 'bg-raised text-brand font-semibold' : 'text-ink-3 hover:text-ink hover:bg-field'
              }`}
            >
              <Users className="size-3.5" />
              Users & Tracking
            </button>
            <button
              onClick={() => setActiveTab('withdrawals')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${
                activeTab === 'withdrawals' ? 'bg-raised text-brand font-semibold' : 'text-ink-3 hover:text-ink hover:bg-field'
              }`}
            >
              <CreditCard className="size-3.5" />
              Withdrawals
              {overview?.recentWithdrawals?.some(w => w.status === 'pending') && (
                <span className="size-2 rounded-full bg-amber-500"></span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('odds')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${
                activeTab === 'odds' ? 'bg-raised text-brand font-semibold' : 'text-ink-3 hover:text-ink hover:bg-field'
              }`}
            >
              <Zap className="size-3.5 text-brand" />
              Odds Engine
              {oddsEngine?.enabled && (
                <span className="flex items-center gap-0.5 rounded bg-brand/20 px-1.5 py-0.5 text-[9px] font-bold text-brand animate-pulse">
                  ACTIVE
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('gateway')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${
                activeTab === 'gateway' ? 'bg-raised text-brand font-semibold' : 'text-ink-3 hover:text-ink hover:bg-field'
              }`}
            >
              <Key className="size-3.5" />
              IntaSend Gateway
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${
                activeTab === 'settings' ? 'bg-raised text-brand font-semibold' : 'text-ink-3 hover:text-ink hover:bg-field'
              }`}
            >
              <SettingsIcon className="size-3.5" />
              Settings
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto max-w-7xl px-3 py-4 sm:px-6">
        {/* Compact KPI Metrics Ribbon */}
        {overview && (
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <div className="rounded-lg border border-line bg-panel p-3">
              <div className="flex items-center justify-between text-xs text-ink-3">
                <span>Total Users</span>
                <Users className="size-3.5 text-brand" />
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-xl font-bold text-ink">{overview.totals.users}</span>
                <span className="text-[11px] text-brand">+{overview.totals.newUsers24h} 24h</span>
              </div>
            </div>

            <div className="rounded-lg border border-line bg-panel p-3">
              <div className="flex items-center justify-between text-xs text-ink-3">
                <span>Total Deposits</span>
                <ArrowDownRight className="size-3.5 text-brand" />
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-xl font-bold text-brand">{formatMoney(overview.totals.totalDepositsAmount)}</span>
                <span className="text-[11px] text-ink-3">{overview.totals.completedDeposits} completed</span>
              </div>
            </div>

            <div className="rounded-lg border border-line bg-panel p-3">
              <div className="flex items-center justify-between text-xs text-ink-3">
                <span>House Margin</span>
                <TrendingUp className="size-3.5 text-bonus" />
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className={`text-xl font-bold ${overview.totals.houseGross >= 0 ? 'text-bonus' : 'text-loss'}`}>
                  {formatMoney(overview.totals.houseGross)}
                </span>
                <span className="text-[11px] text-ink-3">gross</span>
              </div>
            </div>

            <div className="rounded-lg border border-line bg-panel p-3">
              <div className="flex items-center justify-between text-xs text-ink-3">
                <span>Total Bets</span>
                <Activity className="size-3.5 text-brand" />
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-xl font-bold text-ink">{overview.totals.bets}</span>
                <span className="text-[11px] text-brand">{overview.totals.activeBets} active</span>
              </div>
            </div>

            <div className="col-span-2 sm:col-span-1 rounded-lg border border-line bg-panel p-3">
              <div className="flex items-center justify-between text-xs text-ink-3">
                <span>Withdrawals</span>
                <CreditCard className="size-3.5 text-amber-500" />
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-xl font-bold text-ink">{overview.totals.totalWithdrawals || 0}</span>
                <span className="text-[11px] text-ink-3">total requests</span>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            TAB 1: OVERVIEW
            ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'overview' && overview && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Recent Deposits */}
              <div className="rounded-lg border border-line bg-panel p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-ink">Recent Deposits</h2>
                  <span className="text-xs text-ink-3">Last 10 transactions</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-line text-ink-3">
                        <th className="pb-2">User / Phone</th>
                        <th className="pb-2">Amount</th>
                        <th className="pb-2">Status</th>
                        <th className="pb-2">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/40">
                      {overview.recentDeposits.length === 0 ? (
                        <tr><td colSpan={4} className="py-4 text-center text-ink-3">No recent deposits</td></tr>
                      ) : (
                        overview.recentDeposits.map(d => (
                          <tr key={d._id} className="hover:bg-field/50">
                            <td className="py-2.5 font-medium text-ink">
                              {d.userId?.username || 'User'} <span className="text-ink-3">({d.userId?.phone || '-'})</span>
                            </td>
                            <td className="py-2.5 font-semibold text-brand">KSH {d.amount}</td>
                            <td className="py-2.5">
                              <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                                d.status === 'completed' ? 'bg-brand/10 text-brand' : 'bg-line text-ink-3'
                              }`}>
                                {d.status}
                              </span>
                            </td>
                            <td className="py-2.5 text-ink-3">{formatDate(d.createdAt)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Recent Withdrawals */}
              <div className="rounded-lg border border-line bg-panel p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-ink">Recent Withdrawals</h2>
                  <button 
                    onClick={() => setActiveTab('withdrawals')} 
                    className="text-xs text-brand hover:underline"
                  >
                    View All →
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-line text-ink-3">
                        <th className="pb-2">User / Phone</th>
                        <th className="pb-2">Amount</th>
                        <th className="pb-2">Status</th>
                        <th className="pb-2">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/40">
                      {!overview.recentWithdrawals || overview.recentWithdrawals.length === 0 ? (
                        <tr><td colSpan={4} className="py-4 text-center text-ink-3">No recent withdrawals</td></tr>
                      ) : (
                        overview.recentWithdrawals.map(w => (
                          <tr key={w._id} className="hover:bg-field/50">
                            <td className="py-2.5 font-medium text-ink">
                              {w.userId?.username || 'User'} <span className="text-ink-3">({w.phone})</span>
                            </td>
                            <td className="py-2.5 font-semibold text-loss">KSH {w.amount}</td>
                            <td className="py-2.5">
                              <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                                w.status === 'completed' ? 'bg-brand/10 text-brand' :
                                w.status === 'pending' ? 'bg-amber-500/10 text-amber-500' :
                                'bg-loss/10 text-loss'
                              }`}>
                                {w.status}
                              </span>
                            </td>
                            <td className="py-2.5 text-ink-3">{formatDate(w.createdAt)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Top Players & Turnover */}
            <div className="rounded-lg border border-line bg-panel p-4">
              <h2 className="mb-3 text-sm font-semibold text-ink">Top Players by Turnover</h2>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                {overview.topPlayers.length === 0 ? (
                  <p className="text-xs text-ink-3">No player turnover data yet.</p>
                ) : (
                  overview.topPlayers.map((player, idx) => (
                    <div key={player.userId} className="flex items-center justify-between rounded-md border border-line bg-field p-2.5 text-xs">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink">#{idx + 1} {player.username}</p>
                        <p className="text-[11px] text-ink-3">{player.phone} • {player.totalBets} bets</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-brand">KSH {player.totalBetAmount.toLocaleString()}</p>
                        <p className="text-[10px] text-ink-3">Won: KSH {player.totalWinAmount.toLocaleString()}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            TAB 2: USERS & OPERATIONS (ADVANCED TRACKING)
            ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'users' && (
          <div className="space-y-3">
            {/* Search & Filter Bar */}
            <div className="flex flex-col gap-2 rounded-lg border border-line bg-panel p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 size-4 text-ink-3" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  placeholder="Search user by phone (e.g. 719220220) or username..."
                  className="h-9 w-full rounded-md border border-line bg-field pl-9 pr-3 text-xs text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-3">Filter:</span>
                <div className="flex rounded-md border border-line bg-field p-0.5 text-xs">
                  <button
                    onClick={() => setUserStatusFilter('all')}
                    className={`rounded px-2.5 py-1 ${userStatusFilter === 'all' ? 'bg-raised font-semibold text-ink' : 'text-ink-3'}`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setUserStatusFilter('active')}
                    className={`rounded px-2.5 py-1 ${userStatusFilter === 'active' ? 'bg-raised font-semibold text-brand' : 'text-ink-3'}`}
                  >
                    Active
                  </button>
                  <button
                    onClick={() => setUserStatusFilter('frozen')}
                    className={`rounded px-2.5 py-1 ${userStatusFilter === 'frozen' ? 'bg-raised font-semibold text-loss' : 'text-ink-3'}`}
                  >
                    Suspended
                  </button>
                </div>
              </div>
            </div>

            {/* Users Table */}
            <div className="overflow-hidden rounded-lg border border-line bg-panel shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-line bg-field/50 text-ink-3">
                      <th className="p-3">User & Phone</th>
                      <th className="p-3">Real Balance</th>
                      <th className="p-3">Freebet</th>
                      <th className="p-3">Referrals</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Joined</th>
                      <th className="p-3 text-right">Operations</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/40">
                    {usersLoading ? (
                      <tr><td colSpan={7} className="py-8 text-center text-ink-3"><RefreshCw className="mx-auto size-5 animate-spin mb-1" />Loading users...</td></tr>
                    ) : usersList.length === 0 ? (
                      <tr><td colSpan={7} className="py-8 text-center text-ink-3">No matching users found</td></tr>
                    ) : (
                      usersList.map(u => (
                        <tr key={u._id} className="hover:bg-field/40">
                          <td className="p-3">
                            <div className="font-semibold text-ink">{u.username}</div>
                            <div className="text-[11px] text-ink-3">{u.phone}</div>
                          </td>
                          <td className="p-3 font-semibold text-brand">
                            KSH {u.balance.toFixed(2)}
                          </td>
                          <td className="p-3">
                            <div className="font-medium text-bonus">KSH {u.freebet}</div>
                            <div className="text-[10px] text-ink-3">{u.freebetLocked ? '🔒 Locked' : '✅ Unlocked'}</div>
                          </td>
                          <td className="p-3 text-ink-2">
                            {u.referralsCount || 0} refs <span className="text-ink-3">(KSH {u.referralsEarnings || 0})</span>
                          </td>
                          <td className="p-3">
                            <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-semibold ${
                              u.isFrozen ? 'bg-loss/15 text-loss' : 'bg-brand/10 text-brand'
                            }`}>
                              {u.isFrozen ? 'Suspended' : 'Active'}
                            </span>
                          </td>
                          <td className="p-3 text-ink-3">{formatDate(u.createdAt)}</td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* View Details */}
                              <button
                                onClick={() => handleOpenUserDetail(u._id)}
                                className="rounded bg-field px-2 py-1 text-[11px] font-medium text-ink-2 hover:bg-raised hover:text-ink"
                                title="View User Bets & Transactions"
                              >
                                👁️ View
                              </button>

                              {/* Adjust Balance */}
                              <button
                                onClick={() => {
                                  setBalanceModalUser(u)
                                  setBalanceAmount('')
                                  setBalanceType('credit')
                                }}
                                className="rounded bg-field px-2 py-1 text-[11px] font-medium text-brand hover:bg-brand/10"
                                title="Credit or Debit Balance"
                              >
                                💰 Balance
                              </button>

                              {/* Adjust Freebet */}
                              <button
                                onClick={() => {
                                  setFreebetModalUser(u)
                                  setFreebetAmount(String(u.freebet || 0))
                                  setFreebetLocked(u.freebetLocked)
                                }}
                                className="rounded bg-field px-2 py-1 text-[11px] font-medium text-bonus hover:bg-bonus/10"
                                title="Adjust Freebet"
                              >
                                🎁 Freebet
                              </button>

                              {/* Freeze / Unfreeze */}
                              <button
                                onClick={() => handleToggleFreeze(u)}
                                className={`rounded px-2 py-1 text-[11px] font-medium ${
                                  u.isFrozen ? 'bg-brand/10 text-brand hover:bg-brand/20' : 'bg-loss/10 text-loss hover:bg-loss/20'
                                }`}
                                title={u.isFrozen ? 'Activate User' : 'Suspend User'}
                              >
                                {u.isFrozen ? '🔓 Unsuspend' : '🔒 Suspend'}
                              </button>

                              {/* Reset Password */}
                              <button
                                onClick={() => {
                                  setPasswordModalUser(u)
                                  setNewPasswordVal('')
                                }}
                                className="rounded bg-field px-2 py-1 text-[11px] font-medium text-ink-3 hover:bg-raised hover:text-ink"
                                title="Reset User Password"
                              >
                                🔑 Password
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            TAB 3: WITHDRAWAL REQUESTS
            ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'withdrawals' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-line bg-panel p-3">
              <div>
                <h2 className="text-sm font-semibold text-ink">User Withdrawal Requests</h2>
                <p className="text-xs text-ink-3">Process payouts or reject to automatically refund user balance</p>
              </div>

              <div className="flex rounded-md border border-line bg-field p-0.5 text-xs">
                {(['pending', 'completed', 'rejected', 'all'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setWithdrawalFilter(f)}
                    className={`capitalize rounded px-2.5 py-1 ${withdrawalFilter === f ? 'bg-raised font-semibold text-ink' : 'text-ink-3'}`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-line bg-panel shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-line bg-field/50 text-ink-3">
                      <th className="p-3">User</th>
                      <th className="p-3">M-Pesa Number</th>
                      <th className="p-3">Amount</th>
                      <th className="p-3">Current Balance</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Date</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/40">
                    {withdrawalsLoading ? (
                      <tr><td colSpan={7} className="py-8 text-center text-ink-3"><RefreshCw className="mx-auto size-5 animate-spin mb-1" />Loading withdrawals...</td></tr>
                    ) : withdrawalsList.length === 0 ? (
                      <tr><td colSpan={7} className="py-8 text-center text-ink-3">No withdrawals in this filter</td></tr>
                    ) : (
                      withdrawalsList.map(w => (
                        <tr key={w._id} className="hover:bg-field/40">
                          <td className="p-3 font-medium text-ink">{w.userId?.username || 'User'}</td>
                          <td className="p-3 font-semibold text-ink">{w.phone}</td>
                          <td className="p-3 font-bold text-loss">KSH {w.amount.toFixed(2)}</td>
                          <td className="p-3 text-ink-3">KSH {(w.userId?.balance ?? 0).toFixed(2)}</td>
                          <td className="p-3">
                            <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${
                              w.status === 'completed' ? 'bg-brand/10 text-brand' :
                              w.status === 'pending' ? 'bg-amber-500/15 text-amber-500 font-bold' :
                              'bg-loss/10 text-loss'
                            }`}>
                              {w.status}
                            </span>
                          </td>
                          <td className="p-3 text-ink-3">{formatDate(w.createdAt)}</td>
                          <td className="p-3 text-right">
                            {w.status === 'pending' ? (
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => handleUpdateWithdrawal(w._id, 'completed', w.amount)}
                                  disabled={updatingWithdrawalId === w._id}
                                  className="flex items-center gap-1 rounded bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand/20 disabled:opacity-50"
                                >
                                  ✅ Paid
                                </button>
                                <button
                                  onClick={() => handleUpdateWithdrawal(w._id, 'rejected', w.amount)}
                                  disabled={updatingWithdrawalId === w._id}
                                  className="flex items-center gap-1 rounded bg-loss/10 px-2.5 py-1 text-xs font-semibold text-loss hover:bg-loss/20 disabled:opacity-50"
                                >
                                  ❌ Reject & Refund
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-ink-3">—</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            TAB: ODDS ENGINE & SCHEDULED MULTIPLIER CONTROLS
            ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'odds' && (
          <div className="mx-auto max-w-4xl space-y-5">
            {/* Alert / Notification toast */}
            {oddsToast && (
              <div
                className={`flex items-center justify-between rounded-lg p-3 text-xs font-medium ${
                  oddsToast.type === 'success'
                    ? 'border border-brand/40 bg-brand/10 text-brand'
                    : 'border border-loss/40 bg-loss/10 text-loss'
                }`}
              >
                <span>{oddsToast.message}</span>
                <button onClick={() => setOddsToast(null)} className="text-ink-3 hover:text-ink">
                  <XCircle className="size-4" />
                </button>
              </div>
            )}

            {/* 1. Live Engine Status & Emergency Reset Bar */}
            <div
              className={`rounded-xl border p-5 transition-all ${
                oddsEngine?.enabled
                  ? 'border-brand/50 bg-brand/5 shadow-lg shadow-brand/5'
                  : 'border-line bg-panel'
              }`}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div
                    className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${
                      oddsEngine?.enabled ? 'bg-brand text-brand-ink' : 'bg-field text-ink-3'
                    }`}
                  >
                    <Zap className="size-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-bold text-ink">
                        {oddsEngine?.enabled ? 'Active Promotion Override Running' : 'Normal Odds Engine Running'}
                      </h2>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          oddsEngine?.enabled
                            ? 'bg-brand text-brand-ink animate-pulse'
                            : 'bg-field text-ink-3 border border-line'
                        }`}
                      >
                        {oddsEngine?.enabled ? 'BOOST ACTIVE' : 'STANDARD FAIR'}
                      </span>
                    </div>

                    <p className="mt-1 text-xs text-ink-2">
                      {oddsEngine?.enabled ? (
                        <>
                          Targeting{' '}
                          <strong className="text-brand font-bold">
                            {oddsEngine.mode === 'range'
                              ? `${oddsEngine.minMultiplier.toFixed(2)}x – ${oddsEngine.maxMultiplier.toFixed(2)}x`
                              : oddsEngine.mode === 'min_multiplier'
                              ? `Over ${oddsEngine.minMultiplier.toFixed(2)}x`
                              : `Exact ${oddsEngine.exactMultiplier?.toFixed(2)}x`}
                          </strong>{' '}
                          to reward active players. Mined server seeds guarantee 100% SHA-256 HMAC provably fair validation.
                        </>
                      ) : (
                        'Standard provably fair odds generator. Multipliers calculated naturally from random server seeds & client seed nonces.'
                      )}
                    </p>

                    {/* Progress / Timer when active */}
                    {oddsEngine?.enabled && (
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-semibold text-ink">
                        {oddsEngine.durationType === 'minutes' && (
                          <div className="flex items-center gap-1.5 rounded-md bg-field px-2.5 py-1 text-brand border border-line">
                            <Clock className="size-3.5" />
                            <span>
                              Time Remaining:{' '}
                              <strong className="tabular-nums">
                                {Math.floor((oddsEngine.timeRemainingSeconds || 0) / 60)}m{' '}
                                {((oddsEngine.timeRemainingSeconds || 0) % 60).toString().padStart(2, '0')}s
                              </strong>
                            </span>
                          </div>
                        )}
                        {oddsEngine.durationType === 'rounds' && (
                          <div className="flex items-center gap-1.5 rounded-md bg-field px-2.5 py-1 text-brand border border-line">
                            <Flame className="size-3.5" />
                            <span>
                              Rounds Remaining:{' '}
                              <strong className="tabular-nums">
                                {oddsEngine.roundsRemaining} / {oddsEngine.roundsTotal}
                              </strong>
                            </span>
                          </div>
                        )}
                        {oddsEngine.durationType === 'scheduled_window' && (
                          <div className="flex items-center gap-1.5 rounded-md bg-field px-2.5 py-1 text-brand border border-line">
                            <Timer className="size-3.5" />
                            <span>Scheduled Window Active</span>
                          </div>
                        )}
                        <span className="text-[11px] text-ink-3">
                          (Automatically reverts back to normal odds generator once completed)
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Reset button */}
                {oddsEngine?.enabled ? (
                  <button
                    type="button"
                    onClick={handleResetOddsRule}
                    disabled={oddsSubmitting}
                    className="flex shrink-0 items-center justify-center gap-2 rounded-lg bg-loss px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-loss/90 disabled:opacity-50 transition-colors"
                  >
                    <RefreshCw className={`size-3.5 ${oddsSubmitting ? 'animate-spin' : ''}`} />
                    Reset to Normal Odds Now
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={fetchOddsEngine}
                    disabled={oddsSubmitting}
                    className="flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-line bg-field px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-raised hover:text-ink transition-colors"
                  >
                    <RefreshCw className="size-3" />
                    Refresh Status
                  </button>
                )}
              </div>
            </div>

            {/* 2. Quick One-Click Reward Presets */}
            <div className="rounded-xl border border-line bg-panel p-5">
              <div className="mb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-ink">
                  1-Click Reward Presets for Active Users
                </h3>
                <p className="mt-0.5 text-xs text-ink-3">
                  Instantly reward players currently online and active with guaranteed generous multiplier ranges.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                {/* Preset 1 */}
                <button
                  type="button"
                  onClick={() =>
                    handleApplyOddsRule({
                      mode: 'range',
                      minMultiplier: 2.0,
                      maxMultiplier: 5.0,
                      durationType: 'minutes',
                      durationMinutes: 15,
                      note: 'Active Users Reward: 2.00x - 5.00x for 15m'
                    })
                  }
                  disabled={oddsSubmitting}
                  className="flex flex-col items-start rounded-lg border border-line bg-field p-3.5 text-left transition-all hover:border-brand/50 hover:bg-raised"
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold text-brand">
                    <Sparkles className="size-3.5" />
                    <span>Reward Active Users</span>
                  </div>
                  <div className="mt-1 text-sm font-extrabold text-ink tabular-nums">2.00x – 5.00x</div>
                  <div className="mt-1 text-[11px] text-ink-3">For 15 minutes • Auto-resets</div>
                </button>

                {/* Preset 2 */}
                <button
                  type="button"
                  onClick={() =>
                    handleApplyOddsRule({
                      mode: 'range',
                      minMultiplier: 2.0,
                      maxMultiplier: 10.0,
                      durationType: 'minutes',
                      durationMinutes: 30,
                      note: 'Happy Hour Boost: 2.00x - 10.00x for 30m'
                    })
                  }
                  disabled={oddsSubmitting}
                  className="flex flex-col items-start rounded-lg border border-line bg-field p-3.5 text-left transition-all hover:border-brand/50 hover:bg-raised"
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-500">
                    <Flame className="size-3.5" />
                    <span>Happy Hour Boost</span>
                  </div>
                  <div className="mt-1 text-sm font-extrabold text-ink tabular-nums">2.00x – 10.00x</div>
                  <div className="mt-1 text-[11px] text-ink-3">For 30 minutes • Auto-resets</div>
                </button>

                {/* Preset 3 */}
                <button
                  type="button"
                  onClick={() =>
                    handleApplyOddsRule({
                      mode: 'range',
                      minMultiplier: 2.0,
                      maxMultiplier: 4.0,
                      durationType: 'rounds',
                      roundsTotal: 10,
                      note: 'Active 10 Rounds Streak: 2.00x - 4.00x'
                    })
                  }
                  disabled={oddsSubmitting}
                  className="flex flex-col items-start rounded-lg border border-line bg-field p-3.5 text-left transition-all hover:border-brand/50 hover:bg-raised"
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                    <Zap className="size-3.5" />
                    <span>10 Rounds Streak</span>
                  </div>
                  <div className="mt-1 text-sm font-extrabold text-ink tabular-nums">2.00x – 4.00x</div>
                  <div className="mt-1 text-[11px] text-ink-3">Next 10 rounds • Auto-resets</div>
                </button>

                {/* Preset 4 */}
                <button
                  type="button"
                  onClick={() =>
                    handleApplyOddsRule({
                      mode: 'min_multiplier',
                      minMultiplier: 2.0,
                      maxMultiplier: 50.0,
                      durationType: 'minutes',
                      durationMinutes: 10,
                      note: 'Over 2.00x Guaranteed: 10m'
                    })
                  }
                  disabled={oddsSubmitting}
                  className="flex flex-col items-start rounded-lg border border-line bg-field p-3.5 text-left transition-all hover:border-brand/50 hover:bg-raised"
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold text-blue-400">
                    <TrendingUp className="size-3.5" />
                    <span>Over 2.00x Guaranteed</span>
                  </div>
                  <div className="mt-1 text-sm font-extrabold text-ink tabular-nums">&ge; 2.00x</div>
                  <div className="mt-1 text-[11px] text-ink-3">For 10 minutes • Auto-resets</div>
                </button>
              </div>
            </div>

            {/* 3. Custom Range & Schedule Builder */}
            <form onSubmit={(e) => { e.preventDefault(); handleApplyOddsRule(); }} className="rounded-xl border border-line bg-panel p-5 space-y-4">
              <div className="border-b border-line pb-3">
                <h3 className="text-sm font-bold text-ink">Custom Odds Engine Configuration</h3>
                <p className="mt-0.5 text-xs text-ink-3">
                  Tailor the exact multiplier range and scheduled active period. Automatically reverts to standard provably fair odds once the schedule concludes.
                </p>
              </div>

              {/* Mode Selection */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink-2">Rule Mode</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setOddsMode('range')}
                    className={`flex items-center justify-center gap-1.5 rounded-md border py-2 text-xs font-medium transition-colors ${
                      oddsMode === 'range'
                        ? 'border-brand bg-brand/10 text-brand font-semibold'
                        : 'border-line bg-field text-ink-3 hover:text-ink'
                    }`}
                  >
                    <Sliders className="size-3.5" />
                    Range (Min – Max)
                  </button>
                  <button
                    type="button"
                    onClick={() => setOddsMode('min_multiplier')}
                    className={`flex items-center justify-center gap-1.5 rounded-md border py-2 text-xs font-medium transition-colors ${
                      oddsMode === 'min_multiplier'
                        ? 'border-brand bg-brand/10 text-brand font-semibold'
                        : 'border-line bg-field text-ink-3 hover:text-ink'
                    }`}
                  >
                    <TrendingUp className="size-3.5" />
                    Minimum Odds (Over X)
                  </button>
                  <button
                    type="button"
                    onClick={() => setOddsMode('exact')}
                    className={`flex items-center justify-center gap-1.5 rounded-md border py-2 text-xs font-medium transition-colors ${
                      oddsMode === 'exact'
                        ? 'border-brand bg-brand/10 text-brand font-semibold'
                        : 'border-line bg-field text-ink-3 hover:text-ink'
                    }`}
                  >
                    <Sparkles className="size-3.5" />
                    Exact Multiplier
                  </button>
                </div>
              </div>

              {/* Multiplier Inputs */}
              {oddsMode === 'range' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-ink-2">Minimum Multiplier</label>
                    <div className="flex h-10 items-center rounded-md border border-line bg-field px-3">
                      <input
                        type="number"
                        step="0.1"
                        min="1.01"
                        max="100"
                        value={oddsMin}
                        onChange={e => setOddsMin(e.target.value)}
                        className="w-full bg-transparent text-sm font-semibold text-ink outline-none"
                      />
                      <span className="text-xs text-ink-3">x</span>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-ink-2">Maximum Multiplier</label>
                    <div className="flex h-10 items-center rounded-md border border-line bg-field px-3">
                      <input
                        type="number"
                        step="0.1"
                        min="1.01"
                        max="200"
                        value={oddsMax}
                        onChange={e => setOddsMax(e.target.value)}
                        className="w-full bg-transparent text-sm font-semibold text-ink outline-none"
                      />
                      <span className="text-xs text-ink-3">x</span>
                    </div>
                  </div>
                </div>
              )}

              {oddsMode === 'min_multiplier' && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-2">Guarantee Over Multiplier</label>
                  <div className="flex h-10 items-center rounded-md border border-line bg-field px-3">
                    <input
                      type="number"
                      step="0.1"
                      min="1.01"
                      max="100"
                      value={oddsMin}
                      onChange={e => setOddsMin(e.target.value)}
                      className="w-full bg-transparent text-sm font-semibold text-ink outline-none"
                    />
                    <span className="text-xs text-ink-3">x</span>
                  </div>
                  <span className="mt-1 block text-[11px] text-ink-3">Every round crash point will be generated at or above this value.</span>
                </div>
              )}

              {oddsMode === 'exact' && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-2">Target Exact Multiplier</label>
                  <div className="flex h-10 items-center rounded-md border border-line bg-field px-3">
                    <input
                      type="number"
                      step="0.05"
                      min="1.01"
                      max="100"
                      value={oddsExact}
                      onChange={e => setOddsExact(e.target.value)}
                      className="w-full bg-transparent text-sm font-semibold text-ink outline-none"
                    />
                    <span className="text-xs text-ink-3">x</span>
                  </div>
                </div>
              )}

              {/* Duration / Schedule Type */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink-2">Duration & Schedule</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setOddsDurationType('minutes')}
                    className={`flex items-center justify-center gap-1.5 rounded-md border py-2 text-xs font-medium transition-colors ${
                      oddsDurationType === 'minutes'
                        ? 'border-brand bg-brand/10 text-brand font-semibold'
                        : 'border-line bg-field text-ink-3 hover:text-ink'
                    }`}
                  >
                    <Clock className="size-3.5" />
                    Timer (Minutes)
                  </button>
                  <button
                    type="button"
                    onClick={() => setOddsDurationType('rounds')}
                    className={`flex items-center justify-center gap-1.5 rounded-md border py-2 text-xs font-medium transition-colors ${
                      oddsDurationType === 'rounds'
                        ? 'border-brand bg-brand/10 text-brand font-semibold'
                        : 'border-line bg-field text-ink-3 hover:text-ink'
                    }`}
                  >
                    <Flame className="size-3.5" />
                    Round Counter
                  </button>
                  <button
                    type="button"
                    onClick={() => setOddsDurationType('scheduled_window')}
                    className={`flex items-center justify-center gap-1.5 rounded-md border py-2 text-xs font-medium transition-colors ${
                      oddsDurationType === 'scheduled_window'
                        ? 'border-brand bg-brand/10 text-brand font-semibold'
                        : 'border-line bg-field text-ink-3 hover:text-ink'
                    }`}
                  >
                    <Timer className="size-3.5" />
                    Time Window
                  </button>
                </div>
              </div>

              {/* Duration inputs */}
              {oddsDurationType === 'minutes' && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-ink-2">Duration in Minutes</label>
                    <div className="flex gap-1">
                      {['5', '10', '15', '30', '60'].map(m => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setOddsDurationMinutes(m)}
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold border ${
                            oddsDurationMinutes === m ? 'border-brand bg-brand/20 text-brand' : 'border-line bg-field text-ink-3 hover:text-ink'
                          }`}
                        >
                          {m}m
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    type="number"
                    min="1"
                    max="1440"
                    value={oddsDurationMinutes}
                    onChange={e => setOddsDurationMinutes(e.target.value)}
                    className="h-10 w-full rounded-md border border-line bg-field px-3 text-sm text-ink outline-none"
                  />
                  <span className="mt-1 block text-[11px] text-ink-3">
                    Starts immediately upon activation and reverts automatically when the timer reaches 0.
                  </span>
                </div>
              )}

              {oddsDurationType === 'rounds' && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-ink-2">Total Number of Rounds</label>
                    <div className="flex gap-1">
                      {['5', '10', '20', '50'].map(r => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setOddsRoundsTotal(r)}
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold border ${
                            oddsRoundsTotal === r ? 'border-brand bg-brand/20 text-brand' : 'border-line bg-field text-ink-3 hover:text-ink'
                          }`}
                        >
                          {r} rounds
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={oddsRoundsTotal}
                    onChange={e => setOddsRoundsTotal(e.target.value)}
                    className="h-10 w-full rounded-md border border-line bg-field px-3 text-sm text-ink outline-none"
                  />
                  <span className="mt-1 block text-[11px] text-ink-3">
                    Applies to the next specified number of rounds and decrements automatically with each round.
                  </span>
                </div>
              )}

              {oddsDurationType === 'scheduled_window' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-ink-2">Start Date & Time</label>
                    <input
                      type="datetime-local"
                      value={oddsScheduledStart}
                      onChange={e => setOddsScheduledStart(e.target.value)}
                      className="h-10 w-full rounded-md border border-line bg-field px-3 text-xs text-ink outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-ink-2">End Date & Time</label>
                    <input
                      type="datetime-local"
                      value={oddsScheduledEnd}
                      onChange={e => setOddsScheduledEnd(e.target.value)}
                      className="h-10 w-full rounded-md border border-line bg-field px-3 text-xs text-ink outline-none"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-ink-2">Campaign Description / Audit Note</label>
                <input
                  type="text"
                  value={oddsNote}
                  onChange={e => setOddsNote(e.target.value)}
                  placeholder="e.g. Happy hour boost to reward active players"
                  className="h-10 w-full rounded-md border border-line bg-field px-3 text-xs text-ink outline-none"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={oddsSubmitting}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand font-bold text-brand-ink text-xs uppercase tracking-wider shadow-sm hover:brightness-110 disabled:opacity-50 transition-all"
                >
                  <Zap className={`size-4 ${oddsSubmitting ? 'animate-bounce' : ''}`} />
                  Activate Odds Engine Schedule
                </button>
              </div>
            </form>

            {/* 4. Audit & Activation Logs */}
            <div className="rounded-xl border border-line bg-panel p-5">
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-ink">
                Recent Odds Engine Activity Logs
              </h3>

              {oddsAuditLogs.length === 0 ? (
                <div className="py-6 text-center text-xs text-ink-3">No recent activation logs recorded.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-line text-[11px] font-semibold text-ink-3 uppercase">
                        <th className="pb-2">Activated At</th>
                        <th className="pb-2">Rule Mode</th>
                        <th className="pb-2">Target Multipliers</th>
                        <th className="pb-2">Duration</th>
                        <th className="pb-2">Status / Result</th>
                        <th className="pb-2">Activated By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/60">
                      {oddsAuditLogs.map((log, i) => (
                        <tr key={i} className="hover:bg-field/50 transition-colors">
                          <td className="py-2.5 text-ink-2 tabular-nums">
                            {new Date(log.activatedAt).toLocaleString()}
                          </td>
                          <td className="py-2.5 font-medium text-ink capitalize">{log.mode}</td>
                          <td className="py-2.5 font-bold text-brand tabular-nums">
                            {log.mode === 'range'
                              ? `${log.minMultiplier}x – ${log.maxMultiplier || 5}x`
                              : log.mode === 'min_multiplier'
                              ? `Over ${log.minMultiplier}x`
                              : `${log.minMultiplier}x`}
                          </td>
                          <td className="py-2.5 text-ink-2">
                            {log.durationType === 'minutes'
                              ? `${log.durationMinutes} mins`
                              : log.durationType === 'rounds'
                              ? `${log.roundsTotal} rounds`
                              : 'Window'}
                          </td>
                          <td className="py-2.5">
                            {log.expiredAt ? (
                              <span className="rounded bg-field px-1.5 py-0.5 text-[10px] text-ink-3">
                                Expired ({log.reason || 'Completed'})
                              </span>
                            ) : (
                              <span className="rounded bg-brand/20 px-1.5 py-0.5 text-[10px] font-bold text-brand animate-pulse">
                                Running
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 text-ink-3">{log.activatedBy || 'admin'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            TAB 4: PAYMENT GATEWAY (INTASEND)
            ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'gateway' && (
          <div className="mx-auto max-w-2xl space-y-4">
            <div className="rounded-lg border border-brand/30 bg-brand/5 p-4 text-xs text-ink-2">
              <div className="flex items-center gap-2 font-semibold text-brand">
                <Shield className="size-4" />
                <span>Single Source of Truth: Configured in Admin Panel</span>
              </div>
              <p className="mt-1">
                Keys set here are saved directly to the database and used for all M-Pesa STK push payments. 
                You do not need duplicate environment variables.
              </p>
            </div>

            <form onSubmit={handleSaveGateway} className="space-y-4 rounded-lg border border-line bg-panel p-5">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <h2 className="text-sm font-semibold text-ink">IntaSend M-Pesa API Credentials</h2>
                <div className="flex items-center gap-1.5 text-xs">
                  <span className={`size-2 rounded-full ${isSecretConfigured ? 'bg-brand' : 'bg-amber-500'}`}></span>
                  <span className={isSecretConfigured ? 'text-brand' : 'text-amber-500'}>
                    {isSecretConfigured ? 'Active & Configured' : 'Needs Secret Key'}
                  </span>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-ink-2">
                  IntaSend Publishable / Public Key
                </label>
                <input
                  type="text"
                  value={paymentConfig.intasendPublicKey}
                  onChange={e => setPaymentConfig(prev => ({ ...prev, intasendPublicKey: e.target.value }))}
                  placeholder="ISPubKey_live_..."
                  required
                  className="h-10 w-full rounded-md border border-line bg-field px-3 font-mono text-xs text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-ink-3">Live or sandbox public key provided in your IntaSend dashboard.</p>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between text-xs font-medium text-ink-2">
                  <span>IntaSend Secret Key</span>
                  <button
                    type="button"
                    onClick={() => setShowSecretKey(!showSecretKey)}
                    className="flex items-center gap-1 text-[11px] text-ink-3 hover:text-ink"
                  >
                    {showSecretKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    {showSecretKey ? 'Hide' : 'Show'}
                  </button>
                </div>
                <input
                  type={showSecretKey ? 'text' : 'password'}
                  value={newSecretKey}
                  onChange={e => setNewSecretKey(e.target.value)}
                  placeholder={isSecretConfigured ? '•••••••••••••••••••••••• (Leave blank to keep existing)' : 'ISSecretKey_live_...'}
                  className="h-10 w-full rounded-md border border-line bg-field px-3 font-mono text-xs text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-ink-3">
                  Secured on the backend and never exposed to standard browser visitors.
                </p>
              </div>

              {/* Webhook Endpoint Info */}
              <div className="rounded-md border border-line bg-field p-3 text-xs">
                <span className="font-semibold text-ink">IntaSend Webhook Notification URL:</span>
                <div className="mt-1 flex items-center justify-between gap-2 rounded bg-raised px-2.5 py-1.5 font-mono text-[11px] text-brand">
                  <span className="truncate">{typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/intasend` : '/api/webhooks/intasend'}</span>
                  <button
                    type="button"
                    onClick={copyWebhookUrl}
                    className="flex items-center gap-1 text-ink-2 hover:text-ink"
                    title="Copy URL"
                  >
                    {copiedWebhook ? <Check className="size-3.5 text-brand" /> : <Copy className="size-3.5" />}
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] text-ink-3">
                  Paste this URL into your IntaSend account under Settings &gt; Webhooks to receive automatic payment confirmations.
                </p>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={paymentLoading}
                  className="flex h-9 items-center gap-2 rounded-md bg-brand px-4 text-xs font-semibold text-brand-ink hover:bg-brand-hover disabled:opacity-50"
                >
                  {paymentLoading ? <RefreshCw className="size-3.5 animate-spin" /> : 'Save Gateway Keys'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            TAB 5: GAME & SYSTEM SETTINGS
            ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'settings' && (
          <div className="mx-auto max-w-xl space-y-4">
            <form onSubmit={handleSaveSystemSettings} className="space-y-4 rounded-lg border border-line bg-panel p-5">
              <h2 className="border-b border-line pb-3 text-sm font-semibold text-ink">General System & Limits Configuration</h2>

              <div>
                <label className="mb-1 block text-xs font-medium text-ink-2">Company / Brand Name</label>
                <input
                  type="text"
                  value={paymentConfig.companyName}
                  onChange={e => setPaymentConfig(prev => ({ ...prev, companyName: e.target.value }))}
                  className="h-10 w-full rounded-md border border-line bg-field px-3 text-xs text-ink focus:border-brand focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-ink-2">WhatsApp Support Number</label>
                <input
                  type="text"
                  value={paymentConfig.whatsappSupport}
                  onChange={e => setPaymentConfig(prev => ({ ...prev, whatsappSupport: e.target.value }))}
                  placeholder="254712345678"
                  className="h-10 w-full rounded-md border border-line bg-field px-3 text-xs text-ink focus:border-brand focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-ink-3">Include international country code prefix (e.g. 254).</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-2">Minimum Deposit (KSH)</label>
                  <input
                    type="number"
                    value={paymentConfig.minDeposit}
                    onChange={e => setPaymentConfig(prev => ({ ...prev, minDeposit: Number(e.target.value) }))}
                    min={1}
                    className="h-10 w-full rounded-md border border-line bg-field px-3 text-xs text-ink focus:border-brand focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-2">Minimum Withdrawal (KSH)</label>
                  <input
                    type="number"
                    value={paymentConfig.minWithdrawal}
                    onChange={e => setPaymentConfig(prev => ({ ...prev, minWithdrawal: Number(e.target.value) }))}
                    min={1}
                    className="h-10 w-full rounded-md border border-line bg-field px-3 text-xs text-ink focus:border-brand focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={paymentLoading}
                  className="flex h-9 items-center gap-2 rounded-md bg-brand px-4 text-xs font-semibold text-brand-ink hover:bg-brand-hover disabled:opacity-50"
                >
                  {paymentLoading ? <RefreshCw className="size-3.5 animate-spin" /> : 'Save System Settings'}
                </button>
              </div>
            </form>
          </div>
        )}
      </main>

      {/* ══════════════════════════════════════════════════════════════
          MODAL: ADJUST USER BALANCE
          ══════════════════════════════════════════════════════════════ */}
      {balanceModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-xl border border-line bg-panel p-5 shadow-2xl">
            <h3 className="text-sm font-semibold text-ink">Adjust Real Balance</h3>
            <p className="mt-1 text-xs text-ink-3">
              User: <span className="font-semibold text-ink">{balanceModalUser.username}</span> ({balanceModalUser.phone})
            </p>
            <p className="text-xs text-ink-3">Current Balance: <span className="font-semibold text-brand">KSH {balanceModalUser.balance.toFixed(2)}</span></p>

            <form onSubmit={handleAdjustBalance} className="mt-4 space-y-3">
              <div className="flex rounded-md border border-line bg-field p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setBalanceType('credit')}
                  className={`flex-1 rounded py-1.5 font-medium ${balanceType === 'credit' ? 'bg-raised font-bold text-brand' : 'text-ink-3'}`}
                >
                  + Credit (Add)
                </button>
                <button
                  type="button"
                  onClick={() => setBalanceType('debit')}
                  className={`flex-1 rounded py-1.5 font-medium ${balanceType === 'debit' ? 'bg-raised font-bold text-loss' : 'text-ink-3'}`}
                >
                  - Debit (Deduct)
                </button>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-ink-2">Amount (KSH)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={balanceAmount}
                  onChange={e => setBalanceAmount(e.target.value)}
                  placeholder="e.g. 100"
                  required
                  className="h-10 w-full rounded-md border border-line bg-field px-3 text-sm font-semibold text-ink focus:border-brand focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-ink-2">Reason / Audit Note</label>
                <input
                  type="text"
                  value={balanceReason}
                  onChange={e => setBalanceReason(e.target.value)}
                  placeholder="e.g. Manual payment top-up or correction"
                  className="h-10 w-full rounded-md border border-line bg-field px-3 text-xs text-ink focus:border-brand focus:outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setBalanceModalUser(null)}
                  className="flex-1 rounded-md border border-line bg-field py-2 text-xs font-medium text-ink-2 hover:bg-raised"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingBalance || !balanceAmount}
                  className="flex-1 rounded-md bg-brand py-2 text-xs font-semibold text-brand-ink hover:bg-brand-hover disabled:opacity-50"
                >
                  {isSubmittingBalance ? 'Saving...' : 'Apply Change'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MODAL: ADJUST USER FREEBET
          ══════════════════════════════════════════════════════════════ */}
      {freebetModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-xl border border-line bg-panel p-5 shadow-2xl">
            <h3 className="text-sm font-semibold text-ink">Adjust Freebet Bonus</h3>
            <p className="mt-1 text-xs text-ink-3">
              User: <span className="font-semibold text-ink">{freebetModalUser.username}</span>
            </p>

            <form onSubmit={handleAdjustFreebet} className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-2">Freebet Amount (KSH)</label>
                <input
                  type="number"
                  min="0"
                  value={freebetAmount}
                  onChange={e => setFreebetAmount(e.target.value)}
                  required
                  className="h-10 w-full rounded-md border border-line bg-field px-3 text-sm font-semibold text-ink focus:border-brand focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="lockCheckbox"
                  checked={freebetLocked}
                  onChange={e => setFreebetLocked(e.target.checked)}
                  className="size-4 accent-brand"
                />
                <label htmlFor="lockCheckbox" className="text-xs text-ink-2 cursor-pointer">
                  Require deposit to unlock (Locked)
                </label>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setFreebetModalUser(null)}
                  className="flex-1 rounded-md border border-line bg-field py-2 text-xs font-medium text-ink-2 hover:bg-raised"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingFreebet}
                  className="flex-1 rounded-md bg-brand py-2 text-xs font-semibold text-brand-ink hover:bg-brand-hover disabled:opacity-50"
                >
                  {isSubmittingFreebet ? 'Saving...' : 'Update Freebet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MODAL: RESET USER PASSWORD
          ══════════════════════════════════════════════════════════════ */}
      {passwordModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-xl border border-line bg-panel p-5 shadow-2xl">
            <h3 className="text-sm font-semibold text-ink">Reset User Password</h3>
            <p className="mt-1 text-xs text-ink-3">
              Set new password for <span className="font-semibold text-ink">{passwordModalUser.username}</span>
            </p>

            <form onSubmit={handleResetPassword} className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-2">New Password</label>
                <input
                  type="text"
                  value={newPasswordVal}
                  onChange={e => setNewPasswordVal(e.target.value)}
                  placeholder="Min 4 characters"
                  required
                  minLength={4}
                  className="h-10 w-full rounded-md border border-line bg-field px-3 text-sm text-ink focus:border-brand focus:outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPasswordModalUser(null)}
                  className="flex-1 rounded-md border border-line bg-field py-2 text-xs font-medium text-ink-2 hover:bg-raised"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPassword || !newPasswordVal}
                  className="flex-1 rounded-md bg-brand py-2 text-xs font-semibold text-brand-ink hover:bg-brand-hover disabled:opacity-50"
                >
                  {isSubmittingPassword ? 'Saving...' : 'Reset Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MODAL: USER DETAIL DRILLDOWN
          ══════════════════════════════════════════════════════════════ */}
      {selectedUserForDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-line bg-panel shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <div>
                <h3 className="text-sm font-semibold text-ink">
                  Player Inspector: {selectedUserForDetail.user.username}
                </h3>
                <p className="text-xs text-ink-3">
                  Phone: {selectedUserForDetail.user.phone} • Joined: {formatDate(selectedUserForDetail.user.createdAt)}
                </p>
              </div>
              <button
                onClick={() => setSelectedUserForDetail(null)}
                className="rounded p-1 text-ink-3 hover:bg-field hover:text-ink"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto p-5 text-xs">
              {/* Financial Summary */}
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="rounded-md border border-line bg-field p-2">
                  <span className="text-[10px] text-ink-3">Balance</span>
                  <p className="font-bold text-brand">KSH {selectedUserForDetail.user.balance.toFixed(2)}</p>
                </div>
                <div className="rounded-md border border-line bg-field p-2">
                  <span className="text-[10px] text-ink-3">Total Bets</span>
                  <p className="font-bold text-ink">{selectedUserForDetail.stats.totalBets}</p>
                </div>
                <div className="rounded-md border border-line bg-field p-2">
                  <span className="text-[10px] text-ink-3">Total Wagered</span>
                  <p className="font-bold text-ink">KSH {selectedUserForDetail.stats.totalWagered.toFixed(2)}</p>
                </div>
                <div className="rounded-md border border-line bg-field p-2">
                  <span className="text-[10px] text-ink-3">Total Won</span>
                  <p className="font-bold text-bonus">KSH {selectedUserForDetail.stats.totalWon.toFixed(2)}</p>
                </div>
              </div>

              {/* Recent Bets */}
              <div>
                <h4 className="mb-2 font-semibold text-ink">Recent Bets</h4>
                <div className="max-h-40 overflow-y-auto rounded border border-line">
                  <table className="w-full text-left">
                    <thead className="bg-field text-[10px] text-ink-3 sticky top-0">
                      <tr>
                        <th className="p-2">Amount</th>
                        <th className="p-2">Status</th>
                        <th className="p-2">Multiplier</th>
                        <th className="p-2">Win Amount</th>
                        <th className="p-2">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/30">
                      {selectedUserForDetail.recentBets.length === 0 ? (
                        <tr><td colSpan={5} className="p-3 text-center text-ink-3">No bets found</td></tr>
                      ) : (
                        selectedUserForDetail.recentBets.map(b => (
                          <tr key={b._id}>
                            <td className="p-2 font-semibold">KSH {b.amount}</td>
                            <td className="p-2">
                              <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                                b.status === 'won' ? 'bg-brand/10 text-brand' : 'bg-loss/10 text-loss'
                              }`}>
                                {b.status}
                              </span>
                            </td>
                            <td className="p-2">{b.multiplierCaught ? `${b.multiplierCaught}x` : '—'}</td>
                            <td className="p-2 font-semibold text-brand">KSH {b.winAmount || 0}</td>
                            <td className="p-2 text-ink-3">{formatDate(b.createdAt)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Recent Deposits & Withdrawals side by side */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <h4 className="mb-2 font-semibold text-ink">Recent Deposits</h4>
                  <div className="max-h-32 overflow-y-auto rounded border border-line p-2 space-y-1">
                    {selectedUserForDetail.recentDeposits.length === 0 ? (
                      <p className="text-center text-ink-3 py-2">No deposits</p>
                    ) : (
                      selectedUserForDetail.recentDeposits.map(d => (
                        <div key={d._id} className="flex justify-between text-[11px]">
                          <span className="font-semibold text-brand">+KSH {d.amount}</span>
                          <span className="text-ink-3">{d.status} • {formatDate(d.createdAt)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="mb-2 font-semibold text-ink">Recent Withdrawals</h4>
                  <div className="max-h-32 overflow-y-auto rounded border border-line p-2 space-y-1">
                    {selectedUserForDetail.recentWithdrawals.length === 0 ? (
                      <p className="text-center text-ink-3 py-2">No withdrawals</p>
                    ) : (
                      selectedUserForDetail.recentWithdrawals.map(w => (
                        <div key={w._id} className="flex justify-between text-[11px]">
                          <span className="font-semibold text-loss">-KSH {w.amount}</span>
                          <span className="text-ink-3">{w.status} • {formatDate(w.createdAt)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-line px-5 py-3 text-right">
              <button
                onClick={() => setSelectedUserForDetail(null)}
                className="rounded-md bg-field px-4 py-1.5 text-xs font-semibold text-ink hover:bg-raised"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
