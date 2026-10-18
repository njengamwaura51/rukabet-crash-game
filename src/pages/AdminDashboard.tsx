import { useState, useEffect, useCallback, type FormEvent } from 'react'
import { Link } from 'wouter'
import {
  Users, Activity, TrendingUp, Key, Lock, Unlock, Shield,
  Search, RefreshCw, CheckCircle2, AlertTriangle, Eye, EyeOff,
  CreditCard, ArrowDownRight, Settings as SettingsIcon,
  Copy, Check, LogOut, AlertCircle,
  Zap, Timer, Dices, Scale,
  Menu, X, LayoutDashboard, Wallet, Gift, ExternalLink
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
  paydWalletUsername?: string
  payd_wallet_username?: string
  paydApiUsername?: string
  payd_api_username?: string
  paydApiBaseUrl?: string
  payd_api_base_url?: string
  paydCallbackUrl?: string
  payd_callback_url?: string
  isPasswordConfigured?: boolean
  isSecretConfigured?: boolean
  isManagedViaAdmin?: boolean
  companyName?: string
  company_name?: string
  whatsappSupport?: string
  whatsapp_support?: string
  minDeposit?: number
  min_deposit?: number
  minWithdrawal?: number
  min_withdrawal?: number
  freebetUnlockAmount?: number
  freebet_unlock_amount?: number
  initialFreebet?: number
  initial_freebet?: number
  referralReward?: number
  referral_reward?: number
  minBet?: number
  min_bet?: number
  maxBet?: number
  max_bet?: number
  intasendPublicKey?: string
  intasend_public_key?: string
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

type AdminDeposit = {
  _id: string
  phone: string
  amount: number
  apiRef: string
  status: 'pending' | 'completed' | 'failed'
  credited: boolean
  creditedAt?: string | null
  paydReference?: string | null
  externalRef?: string | null
  mpesaReceipt?: string | null
  submittedReceipt?: string | null
  failureReason?: string | null
  createdAt: string
  userId?: {
    _id: string
    username: string
    phone: string
    balance?: number
  }
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

type AdminBet = {
  _id: string
  roundId: string
  amount: number
  status: 'pending' | 'active' | 'won' | 'lost' | 'cancelled'
  multiplierCaught: number | null
  winAmount: number
  isFreebet: boolean
  panelId?: number
  autoCashoutTarget?: number | null
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

type NavTab = 'overview' | 'deposits' | 'withdrawals' | 'users' | 'bets' | 'odds' | 'gateway' | 'settings'

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

  // Mobile Sidebar Drawer State
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  // Auth Inputs
  const [usernameInput, setUsernameInput] = useState('')
  const [passwordInput, setPasswordInput] = useState('')
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [authError, setAuthError] = useState('')

  // Active Section
  const [activeTab, setActiveTab] = useState<NavTab>('overview')

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
  const [usersPage, setUsersPage] = useState(1)
  const [usersLimit, setUsersLimit] = useState<'25' | '50' | '100' | 'all'>('50')
  const [usersTotal, setUsersTotal] = useState(0)
  const [usersTotalPages, setUsersTotalPages] = useState(1)
  const [isSyncingDb, setIsSyncingDb] = useState(false)
  const [selectedUserForDetail, setSelectedUserForDetail] = useState<UserDetailData | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Modals State
  const [balanceModalUser, setBalanceModalUser] = useState<AdminUser | null>(null)
  const [balanceAmount, setBalanceAmount] = useState('')
  const [balanceType, setBalanceType] = useState<'credit' | 'debit' | 'set'>('credit')
  const [balanceReason, setBalanceReason] = useState('')
  const [isSubmittingBalance, setIsSubmittingBalance] = useState(false)

  const [freebetModalUser, setFreebetModalUser] = useState<AdminUser | null>(null)
  const [freebetAmount, setFreebetAmount] = useState('')
  const [freebetLocked, setFreebetLocked] = useState(true)
  const [isSubmittingFreebet, setIsSubmittingFreebet] = useState(false)

  const [passwordModalUser, setPasswordModalUser] = useState<AdminUser | null>(null)
  const [newPasswordVal, setNewPasswordVal] = useState('')
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false)

  // Deposits Tab State
  const [depositsList, setDepositsList] = useState<AdminDeposit[]>([])
  const [depositsLoading, setDepositsLoading] = useState(false)
  const [depositFilter, setDepositFilter] = useState<'all' | 'pending' | 'completed' | 'failed'>('all')
  const [depositSearch, setDepositSearch] = useState('')
  const [depositsPage, setDepositsPage] = useState(1)
  const [depositsTotal, setDepositsTotal] = useState(0)
  const [depositsTotalPages, setDepositsTotalPages] = useState(1)
  const [totalCompletedDepositAmount, setTotalCompletedDepositAmount] = useState(0)
  const [updatingDepositId, setUpdatingDepositId] = useState<string | null>(null)
  const [manualReceiptInput, setManualReceiptInput] = useState<{ [id: string]: string }>({})

  // Bets Tab State
  const [betsList, setBetsList] = useState<AdminBet[]>([])
  const [betsLoading, setBetsLoading] = useState(false)
  const [betStatusFilter, setBetStatusFilter] = useState<'all' | 'won' | 'lost' | 'active'>('all')
  const [betTypeFilter, setBetTypeFilter] = useState<'all' | 'money' | 'freebet'>('all')
  const [betSearch, setBetSearch] = useState('')
  const [betRoundId, setBetRoundId] = useState('')
  const [betsPage, setBetsPage] = useState(1)
  const [betsTotal, setBetsTotal] = useState(0)
  const [betsTotalPages, setBetsTotalPages] = useState(1)
  const [betsMetrics, setBetsMetrics] = useState<{
    totalBets: number
    totalWagered: number
    totalWon: number
    houseGross: number
    countWon: number
    countLost: number
    countActive: number
    winRate: number
  } | null>(null)

  // Reconciliation State
  const [reconcileAudit, setReconcileAudit] = useState<any | null>(null)
  const [isReconciling, setIsReconciling] = useState(false)

  // Withdrawals Tab State
  const [withdrawalsList, setWithdrawalsList] = useState<AdminWithdrawal[]>([])
  const [withdrawalsLoading, setWithdrawalsLoading] = useState(false)
  const [withdrawalFilter, setWithdrawalFilter] = useState<'all' | 'pending' | 'completed' | 'rejected'>('pending')
  const [updatingWithdrawalId, setUpdatingWithdrawalId] = useState<string | null>(null)

  // Gateway & System Settings State
  const [paymentConfig, setPaymentConfig] = useState({
    paydWalletUsername: '',
    paydApiUsername: '',
    paydApiBaseUrl: 'https://api.payd.money/api/v2/payments',
    paydCallbackUrl: '',
    companyName: 'RUKA TECH SOLUTIONS',
    whatsappSupport: '254719858034',
    minDeposit: 10,
    minWithdrawal: 50,
    freebetUnlockAmount: 50,
    initialFreebet: 150,
    referralReward: 20,
    minBet: 10,
    maxBet: 10000,
  })
  const [newApiPassword, setNewApiPassword] = useState('')
  const [showApiPassword, setShowApiPassword] = useState(false)
  const [isPasswordConfigured, setIsPasswordConfigured] = useState(false)
  const [newApiSecret, setNewApiSecret] = useState('')
  const [showApiSecret, setShowApiSecret] = useState(false)
  const [isSecretConfigured, setIsSecretConfigured] = useState(false)
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [copiedWebhook, setCopiedWebhook] = useState(false)

  // Banner Notification
  const [bannerNotice, setBannerNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const showNotice = (type: 'success' | 'error', message: string) => {
    setBannerNotice({ type, message })
    setTimeout(() => setBannerNotice(null), 4500)
  }

  const selectTab = (tab: NavTab) => {
    setActiveTab(tab)
    setMobileNavOpen(false)
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
            paydWalletUsername: s.paydWalletUsername || s.payd_wallet_username || '',
            paydApiUsername: s.paydApiUsername || s.payd_api_username || '',
            paydApiBaseUrl: s.paydApiBaseUrl || s.payd_api_base_url || 'https://api.mypayd.app/api/v2/payments',
            paydCallbackUrl: s.paydCallbackUrl || s.payd_callback_url || '',
            companyName: s.companyName || s.company_name || 'RUKA TECH SOLUTIONS',
            whatsappSupport: s.whatsappSupport || s.whatsapp_support || '254719858034',
            minDeposit: s.minDeposit ?? s.min_deposit ?? 10,
            minWithdrawal: s.minWithdrawal ?? s.min_withdrawal ?? 50,
            freebetUnlockAmount: s.freebetUnlockAmount ?? s.freebet_unlock_amount ?? 50,
            initialFreebet: s.initialFreebet ?? s.initial_freebet ?? 150,
            referralReward: s.referralReward ?? s.referral_reward ?? 20,
            minBet: s.minBet ?? s.min_bet ?? 10,
            maxBet: s.maxBet ?? s.max_bet ?? 10000,
          })
          setIsPasswordConfigured(Boolean(s.isPasswordConfigured))
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

  // Fetch Users
  useEffect(() => {
    if (!adminToken || activeTab !== 'users') return

    const fetchUsers = async () => {
      setUsersLoading(true)
      try {
        const apiOrigin = config.apiBaseUrl || (typeof window !== 'undefined' ? window.location.origin : '')
        const url = new URL(`${apiOrigin}/api/admin/users`)
        url.searchParams.set('page', String(usersPage))
        url.searchParams.set('limit', usersLimit)
        if (userSearch) url.searchParams.set('search', userSearch)
        if (userStatusFilter !== 'all') url.searchParams.set('status', userStatusFilter)

        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${adminToken}` }
        })
        if (res.ok) {
          const data = await res.json()
          setUsersList(data.users || [])
          setUsersTotal(data.total || data.pagination?.total || 0)
          setUsersTotalPages(data.totalPages || data.pagination?.totalPages || 1)
        }
      } catch (err) {
        console.error('Failed to load users:', err)
      } finally {
        setUsersLoading(false)
      }
    }

    const timer = setTimeout(fetchUsers, userSearch ? 300 : 0)
    return () => clearTimeout(timer)
  }, [adminToken, activeTab, userSearch, userStatusFilter, usersPage, usersLimit, config.apiBaseUrl, refreshKey])

  // Fetch Withdrawals
  useEffect(() => {
    if (!adminToken || activeTab !== 'withdrawals') return

    const fetchWithdrawals = async () => {
      setWithdrawalsLoading(true)
      try {
        const apiOrigin = config.apiBaseUrl || (typeof window !== 'undefined' ? window.location.origin : '')
        const url = new URL(`${apiOrigin}/api/admin/withdrawals`)
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

  // Fetch Deposits
  useEffect(() => {
    if (!adminToken || activeTab !== 'deposits') return

    const fetchDeposits = async () => {
      setDepositsLoading(true)
      try {
        const apiOrigin = config.apiBaseUrl || (typeof window !== 'undefined' ? window.location.origin : '')
        const url = new URL(`${apiOrigin}/api/admin/deposits`)
        if (depositFilter !== 'all') url.searchParams.set('status', depositFilter)
        if (depositSearch.trim()) url.searchParams.set('search', depositSearch.trim())
        url.searchParams.set('page', depositsPage.toString())
        url.searchParams.set('limit', '50')

        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${adminToken}` }
        })
        if (res.ok) {
          const data = await res.json()
          setDepositsList(data.deposits || [])
          setTotalCompletedDepositAmount(data.totalCompletedAmount || 0)
          setDepositsTotal(data.pagination?.total || 0)
          setDepositsTotalPages(data.pagination?.totalPages || 1)
        }
      } catch (err) {
        console.error('Failed to load deposits:', err)
      } finally {
        setDepositsLoading(false)
      }
    }

    const timer = setTimeout(fetchDeposits, depositSearch ? 300 : 0)
    return () => clearTimeout(timer)
  }, [adminToken, activeTab, depositFilter, depositSearch, depositsPage, config.apiBaseUrl, refreshKey])

  // Fetch Bets
  useEffect(() => {
    if (!adminToken || activeTab !== 'bets') return

    const fetchBets = async () => {
      setBetsLoading(true)
      try {
        const apiOrigin = config.apiBaseUrl || (typeof window !== 'undefined' ? window.location.origin : '')
        const url = new URL(`${apiOrigin}/api/admin/bets`)
        url.searchParams.set('page', String(betsPage))
        url.searchParams.set('limit', '25')
        if (betStatusFilter !== 'all') url.searchParams.set('status', betStatusFilter)
        if (betTypeFilter !== 'all') url.searchParams.set('type', betTypeFilter)
        if (betSearch) url.searchParams.set('search', betSearch)
        if (betRoundId) url.searchParams.set('roundId', betRoundId)

        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${adminToken}` }
        })
        if (res.ok) {
          const data = await res.json()
          setBetsList(data.bets || [])
          setBetsTotal(data.pagination?.total || 0)
          setBetsTotalPages(data.pagination?.totalPages || 1)
          setBetsMetrics(data.metrics || null)
        }
      } catch (err) {
        console.error('Failed to load bets:', err)
      } finally {
        setBetsLoading(false)
      }
    }

    const timer = setTimeout(fetchBets, (betSearch || betRoundId) ? 300 : 0)
    return () => clearTimeout(timer)
  }, [adminToken, activeTab, betsPage, betStatusFilter, betTypeFilter, betSearch, betRoundId, config.apiBaseUrl, refreshKey])

  const handleReconcileUser = async (userId: string, apply: boolean = false) => {
    if (!adminToken) return
    setIsReconciling(true)
    try {
      const apiOrigin = config.apiBaseUrl || (typeof window !== 'undefined' ? window.location.origin : '')
      const res = await fetch(`${apiOrigin}/api/admin/users/${userId}/reconcile-balance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({ apply })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setReconcileAudit(data.audit)
        if (apply) {
          showNotice('success', `Balance reconciled to KSH ${data.user.balance}`)
          setRefreshKey(prev => prev + 1)
          if (selectedUserForDetail) {
            setSelectedUserForDetail(prev => prev ? { ...prev, user: { ...prev.user, balance: data.user.balance } } : null)
          }
        }
      } else {
        showNotice('error', data.error || 'Failed to reconcile balance')
      }
    } catch (err: any) {
      showNotice('error', err.message || 'Reconciliation failed')
    } finally {
      setIsReconciling(false)
    }
  }

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
        setOddsToast({ type: 'success', message: data.message || 'Odds Engine rule activated.' })
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
        setOddsToast({ type: 'success', message: 'Odds Engine reset to standard provably fair mode.' })
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

  // Admin Login
  const handleLogin = async (e: FormEvent) => {
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

  const handleLogout = () => {
    sessionStorage.removeItem('rukabet_admin_token')
    setAdminToken(null)
    setIsAuthenticated(false)
  }

  const handleOpenUserDetail = async (userId: string) => {
    if (!userId) return
    setDetailLoading(true)
    setReconcileAudit(null)
    try {
      const res = await fetch(`${config.apiBaseUrl}/api/admin/users/${userId}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      })
      if (res.ok) {
        const data = await res.json()
        setSelectedUserForDetail({
          user: data.user,
          stats: data.stats || { totalBets: 0, totalWagered: 0, totalWon: 0, netProfitLoss: 0 },
          recentBets: data.recentBets || [],
          recentDeposits: data.recentDeposits || [],
          recentWithdrawals: data.recentWithdrawals || []
        })
      }
    } catch {
      showNotice('error', 'Failed to load user details')
    } finally {
      setDetailLoading(false)
    }
  }

  const handleSyncDatabase = async () => {
    if (!adminToken) return
    setIsSyncingDb(true)
    try {
      const res = await fetch(`${config.apiBaseUrl}/api/admin/users/sync-db`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      })
      const data = await res.json()
      if (res.ok && data.success) {
        showNotice('success', data.message || 'Database synced and user records normalized.')
        setRefreshKey(k => k + 1)
      } else {
        showNotice('error', data.error || 'Failed to sync database')
      }
    } catch {
      showNotice('error', 'Network error during database refresh')
    } finally {
      setIsSyncingDb(false)
    }
  }

  const handleAdjustBalance = async (e: FormEvent) => {
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

  const handleAdjustFreebet = async (e: FormEvent) => {
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
    if (!confirm(`Confirm ${action} account for ${user.username} (${user.phone})?`)) return

    try {
      const res = await fetch(`${config.apiBaseUrl}/api/admin/users/${user._id}/toggle-freeze`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` }
      })

      const data = await res.json()
      if (res.ok && data.success) {
        showNotice('success', data.message || `Account status updated`)
        setRefreshKey(k => k + 1)
      } else {
        showNotice('error', data.error || 'Failed to change account status')
      }
    } catch {
      showNotice('error', 'Network error')
    }
  }

  const handleResetPassword = async (e: FormEvent) => {
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

  const handleUpdateWithdrawal = async (withdrawalId: string, status: 'completed' | 'rejected', amount: number) => {
    if (!adminToken) return
    const promptMsg = status === 'completed'
      ? `Mark withdrawal of KSH ${amount} as PAID?`
      : `Reject withdrawal of KSH ${amount}? Funds will be refunded to the player's wallet.`

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
        showNotice('success', data.message || `Withdrawal marked ${status}`)
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

  const handleUpdateDepositStatus = async (
    depositId: string,
    status: 'completed' | 'failed',
    amount: number,
    receiptCode?: string
  ) => {
    if (!adminToken) return
    const receiptToSubmit = receiptCode || manualReceiptInput[depositId] || ''
    const promptMsg = status === 'completed'
      ? `Approve and credit KSH ${amount} to player wallet?${receiptToSubmit ? ` (Receipt: ${receiptToSubmit})` : ''}`
      : `Reject pending deposit of KSH ${amount}?`

    if (!confirm(promptMsg)) return
    setUpdatingDepositId(depositId)

    try {
      const res = await fetch(`${config.apiBaseUrl}/api/admin/deposits/${depositId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          status,
          mpesaReceipt: receiptToSubmit,
          failureReason: status === 'failed' ? 'Rejected by admin' : undefined
        })
      })

      const data = await res.json()
      if (res.ok && data.success) {
        showNotice('success', status === 'completed' ? `Deposit of KSH ${amount} credited.` : 'Deposit rejected.')
        setRefreshKey(k => k + 1)
      } else {
        showNotice('error', data.error || 'Action failed')
      }
    } catch {
      showNotice('error', 'Network error updating deposit')
    } finally {
      setUpdatingDepositId(null)
    }
  }

  const handleSaveGateway = async (e: FormEvent) => {
    e.preventDefault()
    if (!adminToken) return
    setPaymentLoading(true)

    try {
      const payload: any = {
        paydWalletUsername: paymentConfig.paydWalletUsername.trim(),
        paydApiUsername: paymentConfig.paydApiUsername.trim(),
        paydApiBaseUrl: paymentConfig.paydApiBaseUrl.trim() || 'https://api.mypayd.app/api/v2/payments',
        paydCallbackUrl: paymentConfig.paydCallbackUrl.trim(),
      }
      if (newApiPassword.trim()) payload.paydApiPassword = newApiPassword.trim()
      if (newApiSecret.trim()) payload.paydApiSecret = newApiSecret.trim()

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
        setIsPasswordConfigured(Boolean(data.settings?.isPasswordConfigured))
        setIsSecretConfigured(Boolean(data.settings?.isSecretConfigured))
        setNewApiPassword('')
        setNewApiSecret('')
        showNotice('success', 'Payd gateway credentials saved.')
      } else {
        showNotice('error', data.error || 'Failed to save gateway configuration')
      }
    } catch {
      showNotice('error', 'Network error saving gateway configuration')
    } finally {
      setPaymentLoading(false)
    }
  }

  const handleSaveSystemSettings = async (e: FormEvent) => {
    e.preventDefault()
    if (!adminToken) return
    setPaymentLoading(true)

    try {
      const payload = {
        companyName: paymentConfig.companyName.trim(),
        whatsappSupport: paymentConfig.whatsappSupport.trim(),
        minDeposit: Number(paymentConfig.minDeposit),
        minWithdrawal: Number(paymentConfig.minWithdrawal),
        freebetUnlockAmount: Number(paymentConfig.freebetUnlockAmount),
        initialFreebet: Number(paymentConfig.initialFreebet),
        referralReward: Number(paymentConfig.referralReward),
        minBet: Number(paymentConfig.minBet),
        maxBet: Number(paymentConfig.maxBet),
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
        updateConfig({
          brandName: payload.companyName,
          companyName: payload.companyName,
          whatsappSupportNumber: payload.whatsappSupport,
          minDeposit: payload.minDeposit,
          minWithdrawal: payload.minWithdrawal,
          freebetUnlockAmount: payload.freebetUnlockAmount,
          initialFreebet: payload.initialFreebet,
          referralReward: payload.referralReward,
          minBet: payload.minBet,
          maxBet: payload.maxBet,
        })
        showNotice('success', 'System settings updated.')
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
    const url = paymentConfig.paydCallbackUrl.trim() || `${window.location.origin}/api/webhooks/payd`
    void navigator.clipboard.writeText(url)
    setCopiedWebhook(true)
    setTimeout(() => setCopiedWebhook(false), 2500)
  }

  // Pending badges
  const pendingDepositsCount = overview?.totals.pendingDeposits || 0
  const hasPendingWithdrawals = overview?.recentWithdrawals?.some(w => w.status === 'pending') || false

  type NavItem = {
    id: NavTab
    label: string
    icon: any
    badge?: string
    badgeAlert?: boolean
    badgeSuccess?: boolean
  }

  type NavSection = {
    title: string
    items: NavItem[]
  }

  const navSections: NavSection[] = [
    {
      title: 'Operations',
      items: [
        { id: 'overview' as NavTab, label: 'Overview', icon: LayoutDashboard },
        { id: 'bets' as NavTab, label: 'Bets & Ledger', icon: Dices, badge: overview?.totals.activeBets ? `${overview.totals.activeBets} live` : undefined },
      ]
    },
    {
      title: 'Cashier & CRM',
      items: [
        { id: 'deposits' as NavTab, label: 'Deposits', icon: ArrowDownRight, badge: pendingDepositsCount > 0 ? String(pendingDepositsCount) : undefined, badgeAlert: pendingDepositsCount > 0 },
        { id: 'withdrawals' as NavTab, label: 'Withdrawals', icon: CreditCard, badge: hasPendingWithdrawals ? 'Pending' : undefined, badgeAlert: hasPendingWithdrawals },
        { id: 'users' as NavTab, label: 'Players', icon: Users, badge: overview?.totals.users ? String(overview.totals.users) : undefined },
      ]
    },
    {
      title: 'Configuration',
      items: [
        { id: 'odds' as NavTab, label: 'Odds Engine', icon: Zap, badge: oddsEngine?.enabled ? 'BOOST' : undefined, badgeSuccess: oddsEngine?.enabled },
        { id: 'gateway' as NavTab, label: 'Payd Gateway', icon: Key },
        { id: 'settings' as NavTab, label: 'System Settings', icon: SettingsIcon },
      ]
    }
  ]

  const currentTabMeta: Record<NavTab, { title: string; subtitle: string }> = {
    overview: { title: 'Platform Overview', subtitle: 'Real-time treasury summary, recent cashier activity, and top player turnover' },
    deposits: { title: 'M-Pesa Deposits', subtitle: 'Audit incoming STK pushes, verify M-Pesa receipt codes, and manually credit stuck payments' },
    withdrawals: { title: 'Withdrawal Requests', subtitle: 'Review player payout requests, mark disbursements paid, or reject and refund balances' },
    users: { title: 'Player Directory', subtitle: 'Inspect player accounts, reconcile wallet ledgers, adjust balances, or manage account access' },
    bets: { title: 'Bets & Round Ledger', subtitle: 'Live and historical wager breakdown across real cash and freebet rounds' },
    odds: { title: 'Odds Engine Control', subtitle: 'Configure promotional multiplier ranges, minimum crash floors, or scheduled reward windows' },
    gateway: { title: 'Payd Payment Gateway', subtitle: 'Manage M-Pesa STK Push API credentials and webhook callback endpoints' },
    settings: { title: 'System Limits & Branding', subtitle: 'Configure platform deposit/withdrawal thresholds, bonus rules, and support contacts' }
  }

  // ══════════════════════════════════════════════════════════════
  // RENDER: LOGIN SCREEN (SOLID DARK BACK-OFFICE)
  // ══════════════════════════════════════════════════════════════
  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0d0f12] px-4 py-12 text-[#f3f4f6]">
        <div className="w-full max-w-sm rounded-lg border border-[#262a33] bg-[#15181e] p-6">
          <div className="mb-6 border-b border-[#262a33] pb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded bg-[#0da84b] text-white">
                <Shield className="size-4" />
              </div>
              <div>
                <h1 className="text-base font-bold tracking-tight text-white">RukaBet Backoffice</h1>
                <p className="text-xs text-[#8e96a4]">Administrator Authentication</p>
              </div>
            </div>
          </div>

          {authError && (
            <div className="mb-4 flex items-center gap-2 rounded border border-[#dc2626] bg-[#2a1215] p-3 text-xs font-medium text-[#f87171]">
              <AlertCircle className="size-4 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[#c4c9d4]">Username</label>
              <input
                type="text"
                value={usernameInput}
                onChange={e => setUsernameInput(e.target.value)}
                placeholder="Enter admin username"
                required
                className="h-10 w-full rounded border border-[#2c313c] bg-[#0d0f12] px-3 text-sm text-white placeholder:text-[#5e6675] focus:border-[#0da84b] focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[#c4c9d4]">Password</label>
              <input
                type="password"
                value={passwordInput}
                onChange={e => setPasswordInput(e.target.value)}
                placeholder="Enter password"
                required
                className="h-10 w-full rounded border border-[#2c313c] bg-[#0d0f12] px-3 text-sm text-white placeholder:text-[#5e6675] focus:border-[#0da84b] focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={isAuthenticating}
              className="flex h-10 w-full items-center justify-center gap-2 rounded bg-[#0da84b] text-sm font-bold text-white hover:bg-[#0b9240] disabled:opacity-50"
            >
              {isAuthenticating ? <RefreshCw className="size-4 animate-spin" /> : 'Sign In'}
            </button>

            <div className="pt-2 text-center">
              <Link href="/" className="text-xs font-medium text-[#8e96a4] hover:text-white">
                ← Return to Live Game
              </Link>
            </div>
          </form>
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════
  // RENDER: AUTHENTICATED BACK-OFFICE SHELL
  // ══════════════════════════════════════════════════════════════
  return (
    <div className="flex min-h-screen bg-[#0d0f12] text-[#f3f4f6] font-sans antialiased">
      {/* Solid Notification Toast */}
      {bannerNotice && (
        <div
          className={`fixed right-4 top-4 z-50 flex items-center gap-2.5 rounded border px-4 py-3 text-xs font-semibold shadow-lg ${
            bannerNotice.type === 'success'
              ? 'border-[#0da84b] bg-[#102618] text-[#34d399]'
              : 'border-[#dc2626] bg-[#2a1215] text-[#f87171]'
          }`}
        >
          {bannerNotice.type === 'success' ? <CheckCircle2 className="size-4 shrink-0" /> : <AlertTriangle className="size-4 shrink-0" />}
          <span>{bannerNotice.message}</span>
          <button onClick={() => setBannerNotice(null)} className="ml-2 text-[#8e96a4] hover:text-white">
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Mobile Drawer Backdrop */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/75 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* Left Sidebar Navigation (Fixed on Desktop, Slide-over Drawer on Mobile) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-[#242830] bg-[#14171c] transition-transform duration-200 ease-out lg:static lg:translate-x-0 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="flex h-14 items-center justify-between border-b border-[#242830] px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-7 items-center justify-center rounded bg-[#0da84b] text-xs font-black text-white">
              RB
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight text-white leading-none">RUKABET</div>
              <div className="mt-0.5 text-[11px] font-medium text-[#8e96a4]">Admin Console</div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            className="rounded p-1.5 text-[#8e96a4] hover:bg-[#1e222a] hover:text-white lg:hidden"
            aria-label="Close navigation menu"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {navSections.map(section => (
            <div key={section.title}>
              <div className="mb-1.5 px-2.5 text-[11px] font-bold uppercase tracking-wider text-[#6e7685]">
                {section.title}
              </div>
              <div className="space-y-0.5">
                {section.items.map(item => {
                  const Icon = item.icon
                  const isActive = activeTab === item.id
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => selectTab(item.id)}
                      className={`flex w-full items-center justify-between rounded px-2.5 py-2 text-xs font-semibold transition-colors ${
                        isActive
                          ? 'bg-[#0da84b] text-white'
                          : 'text-[#b4bcc8] hover:bg-[#1e222a] hover:text-white'
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon className="size-4 shrink-0" />
                        <span>{item.label}</span>
                      </span>

                      {item.badge && (
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                            isActive
                              ? 'bg-black/25 text-white'
                              : item.badgeAlert
                              ? 'bg-[#f59e0b] text-[#111317]'
                              : item.badgeSuccess
                              ? 'bg-[#0da84b] text-white'
                              : 'bg-[#242830] text-[#b4bcc8]'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Sidebar Footer */}
        <div className="border-t border-[#242830] p-3 space-y-2">
          <Link
            href="/"
            className="flex w-full items-center justify-between rounded border border-[#282d37] bg-[#1a1e25] px-3 py-2 text-xs font-semibold text-[#c4c9d4] hover:border-[#383f4d] hover:text-white"
          >
            <span>Open Live Game</span>
            <ExternalLink className="size-3.5 text-[#8e96a4]" />
          </Link>

          <div className="flex items-center justify-between pt-1 px-1">
            <div className="text-xs">
              <div className="font-semibold text-white">pirate101</div>
              <div className="text-[11px] text-[#7e8694]">Super Admin</div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1 rounded border border-[#3b1d22] bg-[#251316] px-2.5 py-1.5 text-xs font-semibold text-[#f87171] hover:bg-[#32181c]"
            >
              <LogOut className="size-3.5" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Right Main Column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Sticky Top Bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[#242830] bg-[#14171c] px-4 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="flex size-9 items-center justify-center rounded border border-[#2c313c] bg-[#1a1e25] text-white hover:bg-[#242933] lg:hidden"
              aria-label="Open navigation menu"
            >
              <Menu className="size-5" />
            </button>

            <div className="min-w-0">
              <h1 className="truncate text-sm font-bold text-white sm:text-base">
                {currentTabMeta[activeTab].title}
              </h1>
              <p className="hidden truncate text-xs text-[#8e96a4] sm:block">
                {currentTabMeta[activeTab].subtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Live Odds Status Indicator */}
            <button
              type="button"
              onClick={() => selectTab('odds')}
              className={`hidden sm:flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs font-semibold ${
                oddsEngine?.enabled
                  ? 'border-[#0da84b] bg-[#102618] text-[#34d399]'
                  : 'border-[#2c313c] bg-[#1a1e25] text-[#b4bcc8] hover:text-white'
              }`}
            >
              <Zap className="size-3.5" />
              <span>{oddsEngine?.enabled ? `Boost Active (${oddsEngine.mode})` : 'Odds: Standard Fair'}</span>
            </button>

            <button
              type="button"
              onClick={() => setRefreshKey(k => k + 1)}
              className="flex h-8 items-center gap-1.5 rounded border border-[#2c313c] bg-[#1a1e25] px-3 text-xs font-semibold text-[#e5e7eb] hover:bg-[#242933]"
              title="Refresh data"
            >
              <RefreshCw className={`size-3.5 ${overviewLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </header>

        {/* Workspace Content */}
        <main className="flex-1 p-4 sm:p-6 space-y-5 max-w-[1440px] w-full mx-auto">
          {/* Global KPI Strip (Shown on Overview, Deposits, Withdrawals, Users) */}
          {overview && ['overview', 'deposits', 'withdrawals', 'users'].includes(activeTab) && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <div className="rounded-md border border-[#242830] bg-[#16191f] p-3.5">
                <div className="flex items-center justify-between text-xs font-semibold text-[#8e96a4]">
                  <span>Registered Players</span>
                  <Users className="size-4 text-[#6e7685]" />
                </div>
                <div className="mt-1.5 flex items-baseline justify-between">
                  <span className="text-xl font-bold text-white tabular-nums">{overview.totals.users}</span>
                  <span className="text-xs font-semibold text-[#10b981] tabular-nums">+{overview.totals.newUsers24h} today</span>
                </div>
              </div>

              <div className="rounded-md border border-[#242830] bg-[#16191f] p-3.5">
                <div className="flex items-center justify-between text-xs font-semibold text-[#8e96a4]">
                  <span>Settled Deposits</span>
                  <ArrowDownRight className="size-4 text-[#10b981]" />
                </div>
                <div className="mt-1.5 flex items-baseline justify-between">
                  <span className="text-xl font-bold text-[#10b981] tabular-nums">{formatMoney(overview.totals.totalDepositsAmount)}</span>
                  <span className="text-xs text-[#8e96a4] tabular-nums">{overview.totals.completedDeposits} txns</span>
                </div>
              </div>

              <div className="rounded-md border border-[#242830] bg-[#16191f] p-3.5">
                <div className="flex items-center justify-between text-xs font-semibold text-[#8e96a4]">
                  <span>House Net (GGR)</span>
                  <TrendingUp className="size-4 text-[#6e7685]" />
                </div>
                <div className="mt-1.5 flex items-baseline justify-between">
                  <span className={`text-xl font-bold tabular-nums ${overview.totals.houseGross >= 0 ? 'text-white' : 'text-[#f87171]'}`}>
                    {formatMoney(overview.totals.houseGross)}
                  </span>
                  <span className="text-xs text-[#8e96a4]">margin</span>
                </div>
              </div>

              <div className="rounded-md border border-[#242830] bg-[#16191f] p-3.5">
                <div className="flex items-center justify-between text-xs font-semibold text-[#8e96a4]">
                  <span>Total Bets</span>
                  <Activity className="size-4 text-[#6e7685]" />
                </div>
                <div className="mt-1.5 flex items-baseline justify-between">
                  <span className="text-xl font-bold text-white tabular-nums">{overview.totals.bets}</span>
                  <span className="text-xs font-semibold text-[#10b981] tabular-nums">{overview.totals.activeBets} active</span>
                </div>
              </div>

              <div className="col-span-2 sm:col-span-1 rounded-md border border-[#242830] bg-[#16191f] p-3.5">
                <div className="flex items-center justify-between text-xs font-semibold text-[#8e96a4]">
                  <span>Withdrawals</span>
                  <CreditCard className="size-4 text-[#f59e0b]" />
                </div>
                <div className="mt-1.5 flex items-baseline justify-between">
                  <span className="text-xl font-bold text-white tabular-nums">{overview.totals.totalWithdrawals || 0}</span>
                  <span className="text-xs text-[#8e96a4]">requests</span>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              TAB 1: OVERVIEW
              ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'overview' && overview && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                {/* Recent Deposits */}
                <div className="rounded-md border border-[#242830] bg-[#16191f]">
                  <div className="flex items-center justify-between border-b border-[#242830] px-4 py-3">
                    <h2 className="text-sm font-bold text-white">Recent Deposits</h2>
                    <button
                      onClick={() => selectTab('deposits')}
                      className="text-xs font-semibold text-[#10b981] hover:underline"
                    >
                      View All Deposits →
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-[#242830] bg-[#1c2028] text-[11px] font-bold uppercase text-[#8e96a4]">
                          <th className="px-4 py-2.5">Player</th>
                          <th className="px-4 py-2.5">Amount</th>
                          <th className="px-4 py-2.5">Status</th>
                          <th className="px-4 py-2.5">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#22262e]">
                        {overview.recentDeposits.length === 0 ? (
                          <tr><td colSpan={4} className="py-6 text-center text-[#8e96a4]">No recent deposits</td></tr>
                        ) : (
                          overview.recentDeposits.map(d => (
                            <tr key={d._id} className="hover:bg-[#1c2028]">
                              <td className="px-4 py-2.5">
                                <div className="font-semibold text-white">{d.userId?.username || 'Player'}</div>
                                <div className="font-mono text-[11px] text-[#8e96a4]">{d.userId?.phone || '-'}</div>
                              </td>
                              <td className="px-4 py-2.5 font-bold text-[#10b981] tabular-nums">KSH {d.amount}</td>
                              <td className="px-4 py-2.5">
                                <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-bold uppercase ${
                                  d.status === 'completed'
                                    ? 'bg-[#102618] text-[#34d399] border border-[#164e30]'
                                    : d.status === 'pending'
                                    ? 'bg-[#2b2111] text-[#fbbf24] border border-[#523c16]'
                                    : 'bg-[#2a1215] text-[#f87171] border border-[#541b21]'
                                }`}>
                                  {d.status}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-[#8e96a4] tabular-nums">{formatDate(d.createdAt)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Recent Withdrawals */}
                <div className="rounded-md border border-[#242830] bg-[#16191f]">
                  <div className="flex items-center justify-between border-b border-[#242830] px-4 py-3">
                    <h2 className="text-sm font-bold text-white">Recent Withdrawals</h2>
                    <button
                      onClick={() => selectTab('withdrawals')}
                      className="text-xs font-semibold text-[#10b981] hover:underline"
                    >
                      Manage Payouts →
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-[#242830] bg-[#1c2028] text-[11px] font-bold uppercase text-[#8e96a4]">
                          <th className="px-4 py-2.5">Player</th>
                          <th className="px-4 py-2.5">Amount</th>
                          <th className="px-4 py-2.5">Status</th>
                          <th className="px-4 py-2.5">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#22262e]">
                        {!overview.recentWithdrawals || overview.recentWithdrawals.length === 0 ? (
                          <tr><td colSpan={4} className="py-6 text-center text-[#8e96a4]">No recent withdrawals</td></tr>
                        ) : (
                          overview.recentWithdrawals.map(w => (
                            <tr key={w._id} className="hover:bg-[#1c2028]">
                              <td className="px-4 py-2.5">
                                <div className="font-semibold text-white">{w.userId?.username || 'Player'}</div>
                                <div className="font-mono text-[11px] text-[#8e96a4]">{w.phone}</div>
                              </td>
                              <td className="px-4 py-2.5 font-bold text-[#f87171] tabular-nums">KSH {w.amount}</td>
                              <td className="px-4 py-2.5">
                                <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-bold uppercase ${
                                  w.status === 'completed'
                                    ? 'bg-[#102618] text-[#34d399] border border-[#164e30]'
                                    : w.status === 'pending'
                                    ? 'bg-[#2b2111] text-[#fbbf24] border border-[#523c16]'
                                    : 'bg-[#2a1215] text-[#f87171] border border-[#541b21]'
                                }`}>
                                  {w.status}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-[#8e96a4] tabular-nums">{formatDate(w.createdAt)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Top Players by Turnover */}
              <div className="rounded-md border border-[#242830] bg-[#16191f] p-4">
                <h2 className="mb-3 text-sm font-bold text-white">Top Players by Wagering Volume</h2>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {overview.topPlayers.length === 0 ? (
                    <p className="text-xs text-[#8e96a4]">No player turnover data recorded yet.</p>
                  ) : (
                    overview.topPlayers.map((player, idx) => (
                      <div key={player.userId} className="flex items-center justify-between rounded border border-[#262a33] bg-[#1c2028] p-3 text-xs">
                        <div className="min-w-0">
                          <p className="truncate font-bold text-white">#{idx + 1} {player.username}</p>
                          <p className="mt-0.5 font-mono text-[11px] text-[#8e96a4]">{player.phone} • {player.totalBets} bets</p>
                        </div>
                        <div className="text-right tabular-nums">
                          <p className="font-bold text-[#10b981]">KSH {player.totalBetAmount.toLocaleString()}</p>
                          <p className="mt-0.5 text-[11px] text-[#8e96a4]">Won: KSH {player.totalWinAmount.toLocaleString()}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              TAB 2: DEPOSITS MANAGEMENT
              ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'deposits' && (
            <div className="space-y-4">
              {/* Toolbar */}
              <div className="flex flex-col gap-3 rounded-md border border-[#242830] bg-[#16191f] p-3.5 lg:flex-row lg:items-center lg:justify-between">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 size-4 text-[#6e7685]" />
                  <input
                    type="text"
                    value={depositSearch}
                    onChange={e => {
                      setDepositSearch(e.target.value)
                      setDepositsPage(1)
                    }}
                    placeholder="Search by phone, DEP reference, Payd reference, or M-Pesa receipt..."
                    className="h-9 w-full rounded border border-[#2c313c] bg-[#0d0f12] pl-9 pr-3 text-xs text-white placeholder:text-[#6e7685] focus:border-[#0da84b] focus:outline-none"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex rounded border border-[#2c313c] bg-[#0d0f12] p-0.5 text-xs">
                    {(['all', 'pending', 'completed', 'failed'] as const).map(f => (
                      <button
                        key={f}
                        onClick={() => { setDepositFilter(f); setDepositsPage(1) }}
                        className={`capitalize rounded px-3 py-1 font-semibold ${
                          depositFilter === f ? 'bg-[#242933] text-white' : 'text-[#8e96a4] hover:text-white'
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>

                  <div className="rounded border border-[#242830] bg-[#1c2028] px-3 py-1.5 text-xs font-semibold text-[#b4bcc8] tabular-nums">
                    Verified Total: <span className="font-bold text-[#10b981]">KSH {totalCompletedDepositAmount.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Deposits Table */}
              <div className="overflow-hidden rounded-md border border-[#242830] bg-[#16191f]">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#242830] bg-[#1c2028] text-[11px] font-bold uppercase text-[#8e96a4]">
                        <th className="p-3">Player / Phone</th>
                        <th className="p-3">Amount</th>
                        <th className="p-3">References & Receipt</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Created</th>
                        <th className="p-3 text-right">Manual Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#22262e]">
                      {depositsLoading ? (
                        <tr>
                          <td colSpan={6} className="py-10 text-center text-[#8e96a4]">
                            <RefreshCw className="mx-auto size-5 animate-spin mb-1.5 text-[#0da84b]" />
                            Loading deposits...
                          </td>
                        </tr>
                      ) : depositsList.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-10 text-center text-[#8e96a4]">
                            No deposits match the current filter.
                          </td>
                        </tr>
                      ) : (
                        depositsList.map(d => {
                          const effectiveReceipt = d.mpesaReceipt || d.submittedReceipt || manualReceiptInput[d._id] || ''
                          return (
                            <tr key={d._id} className="hover:bg-[#1c2028]">
                              <td className="p-3">
                                <div className="font-bold text-white">{d.userId?.username || 'Player'}</div>
                                <div className="font-mono text-[11px] text-[#8e96a4]">{d.phone}</div>
                                {d.userId?.balance !== undefined && (
                                  <div className="text-[11px] text-[#6e7685] tabular-nums">Wallet: KSH {d.userId.balance.toFixed(2)}</div>
                                )}
                              </td>
                              <td className="p-3 font-bold text-sm text-[#10b981] tabular-nums">
                                KSH {d.amount.toFixed(2)}
                              </td>
                              <td className="p-3 space-y-1">
                                <div className="font-mono text-[11px] text-[#c4c9d4]">{d.apiRef}</div>
                                {d.mpesaReceipt && (
                                  <div className="inline-block rounded bg-[#102618] border border-[#164e30] px-1.5 py-0.5 font-mono text-[11px] font-bold text-[#34d399]">
                                    M-Pesa: {d.mpesaReceipt}
                                  </div>
                                )}
                                {!d.mpesaReceipt && d.submittedReceipt && (
                                  <div className="inline-block rounded bg-[#2b2111] border border-[#523c16] px-1.5 py-0.5 font-mono text-[11px] font-bold text-[#fbbf24]">
                                    User SMS Code: {d.submittedReceipt}
                                  </div>
                                )}
                                {(d.paydReference || d.externalRef) && (
                                  <div className="font-mono text-[11px] text-[#6e7685]">
                                    Ref: {d.paydReference || d.externalRef}
                                  </div>
                                )}
                                {d.failureReason && (
                                  <div className="text-[11px] font-medium text-[#f87171]">{d.failureReason}</div>
                                )}
                              </td>
                              <td className="p-3">
                                <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-bold uppercase ${
                                  d.status === 'completed'
                                    ? 'bg-[#102618] text-[#34d399] border border-[#164e30]'
                                    : d.status === 'pending'
                                    ? 'bg-[#2b2111] text-[#fbbf24] border border-[#523c16]'
                                    : 'bg-[#2a1215] text-[#f87171] border border-[#541b21]'
                                }`}>
                                  {d.status}
                                </span>
                                {d.credited && (
                                  <div className="mt-1 text-[11px] font-semibold text-[#10b981]">Credited</div>
                                )}
                              </td>
                              <td className="p-3 text-[#8e96a4] tabular-nums whitespace-nowrap">
                                {formatDate(d.createdAt)}
                              </td>
                              <td className="p-3 text-right">
                                {d.status === 'pending' ? (
                                  <div className="flex flex-col sm:flex-row items-end sm:items-center justify-end gap-1.5">
                                    <input
                                      type="text"
                                      value={manualReceiptInput[d._id] !== undefined ? manualReceiptInput[d._id] : (d.submittedReceipt || '')}
                                      onChange={e => setManualReceiptInput({ ...manualReceiptInput, [d._id]: e.target.value.toUpperCase() })}
                                      placeholder="M-Pesa Code"
                                      className="h-7 w-28 rounded border border-[#2c313c] bg-[#0d0f12] px-2 font-mono text-[11px] text-white uppercase placeholder:text-[#5e6675]"
                                    />
                                    <div className="flex items-center gap-1">
                                      <button
                                        onClick={() => handleUpdateDepositStatus(d._id, 'completed', d.amount, effectiveReceipt)}
                                        disabled={updatingDepositId === d._id}
                                        className="rounded bg-[#0da84b] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#0b9240] disabled:opacity-50"
                                      >
                                        Approve
                                      </button>
                                      <button
                                        onClick={() => handleUpdateDepositStatus(d._id, 'failed', d.amount)}
                                        disabled={updatingDepositId === d._id}
                                        className="rounded border border-[#541b21] bg-[#2a1215] px-2.5 py-1 text-[11px] font-bold text-[#f87171] hover:bg-[#3b181c] disabled:opacity-50"
                                      >
                                        Reject
                                      </button>
                                    </div>
                                  </div>
                                ) : d.status === 'failed' ? (
                                  <button
                                    onClick={() => handleUpdateDepositStatus(d._id, 'completed', d.amount, d.mpesaReceipt || d.submittedReceipt || undefined)}
                                    disabled={updatingDepositId === d._id}
                                    className="rounded border border-[#2c313c] bg-[#1c2028] px-2.5 py-1 text-[11px] font-semibold text-[#c4c9d4] hover:border-[#0da84b] hover:text-white disabled:opacity-50"
                                  >
                                    Force Credit
                                  </button>
                                ) : (
                                  <span className="font-mono text-[11px] text-[#6e7685]">{d.mpesaReceipt || 'Settled'}</span>
                                )}
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {depositsTotalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-[#242830] bg-[#1c2028] px-4 py-2.5 text-xs">
                    <span className="text-[#8e96a4] tabular-nums">
                      Showing {(depositsPage - 1) * 50 + 1}–{Math.min(depositsPage * 50, depositsTotal)} of {depositsTotal}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setDepositsPage(p => Math.max(1, p - 1))}
                        disabled={depositsPage <= 1}
                        className="rounded border border-[#2c313c] bg-[#14171c] px-3 py-1 font-semibold text-white hover:bg-[#242933] disabled:opacity-40"
                      >
                        Prev
                      </button>
                      <span className="px-2 font-semibold text-[#c4c9d4] tabular-nums">
                        {depositsPage} / {depositsTotalPages}
                      </span>
                      <button
                        onClick={() => setDepositsPage(p => Math.min(depositsTotalPages, p + 1))}
                        disabled={depositsPage >= depositsTotalPages}
                        className="rounded border border-[#2c313c] bg-[#14171c] px-3 py-1 font-semibold text-white hover:bg-[#242933] disabled:opacity-40"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              TAB 3: WITHDRAWAL REQUESTS
              ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'withdrawals' && (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 rounded-md border border-[#242830] bg-[#16191f] p-3.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs text-[#8e96a4]">
                  Filter payout requests by status. Rejecting a pending request automatically refunds the player's wallet.
                </div>

                <div className="flex rounded border border-[#2c313c] bg-[#0d0f12] p-0.5 text-xs w-fit">
                  {(['pending', 'completed', 'rejected', 'all'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setWithdrawalFilter(f)}
                      className={`capitalize rounded px-3 py-1 font-semibold ${
                        withdrawalFilter === f ? 'bg-[#242933] text-white' : 'text-[#8e96a4] hover:text-white'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-hidden rounded-md border border-[#242830] bg-[#16191f]">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#242830] bg-[#1c2028] text-[11px] font-bold uppercase text-[#8e96a4]">
                        <th className="p-3">Player</th>
                        <th className="p-3">M-Pesa Phone</th>
                        <th className="p-3">Payout Amount</th>
                        <th className="p-3">Remaining Wallet</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Requested</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#22262e]">
                      {withdrawalsLoading ? (
                        <tr><td colSpan={7} className="py-10 text-center text-[#8e96a4]"><RefreshCw className="mx-auto size-5 animate-spin mb-1.5 text-[#0da84b]" />Loading withdrawals...</td></tr>
                      ) : withdrawalsList.length === 0 ? (
                        <tr><td colSpan={7} className="py-10 text-center text-[#8e96a4]">No withdrawal requests in this view.</td></tr>
                      ) : (
                        withdrawalsList.map(w => (
                          <tr key={w._id} className="hover:bg-[#1c2028]">
                            <td className="p-3 font-bold text-white">{w.userId?.username || 'Player'}</td>
                            <td className="p-3 font-mono font-semibold text-[#e5e7eb]">{w.phone}</td>
                            <td className="p-3 font-bold text-sm text-[#f87171] tabular-nums">KSH {w.amount.toFixed(2)}</td>
                            <td className="p-3 text-[#8e96a4] tabular-nums">KSH {(w.userId?.balance ?? 0).toFixed(2)}</td>
                            <td className="p-3">
                              <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-bold uppercase ${
                                w.status === 'completed'
                                  ? 'bg-[#102618] text-[#34d399] border border-[#164e30]'
                                  : w.status === 'pending'
                                  ? 'bg-[#2b2111] text-[#fbbf24] border border-[#523c16]'
                                  : 'bg-[#2a1215] text-[#f87171] border border-[#541b21]'
                              }`}>
                                {w.status}
                              </span>
                            </td>
                            <td className="p-3 text-[#8e96a4] tabular-nums">{formatDate(w.createdAt)}</td>
                            <td className="p-3 text-right">
                              {w.status === 'pending' ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    onClick={() => handleUpdateWithdrawal(w._id, 'completed', w.amount)}
                                    disabled={updatingWithdrawalId === w._id}
                                    className="rounded bg-[#0da84b] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#0b9240] disabled:opacity-50"
                                  >
                                    Mark Paid
                                  </button>
                                  <button
                                    onClick={() => handleUpdateWithdrawal(w._id, 'rejected', w.amount)}
                                    disabled={updatingWithdrawalId === w._id}
                                    className="rounded border border-[#541b21] bg-[#2a1215] px-2.5 py-1 text-[11px] font-bold text-[#f87171] hover:bg-[#3b181c] disabled:opacity-50"
                                  >
                                    Reject & Refund
                                  </button>
                                </div>
                              ) : (
                                <span className="text-xs text-[#6e7685]">Processed</span>
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
              TAB 4: USERS & PLAYER OPERATIONS
              ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              {/* Filter & Search Bar */}
              <div className="flex flex-col gap-3 rounded-md border border-[#242830] bg-[#16191f] p-3.5 lg:flex-row lg:items-center lg:justify-between">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 size-4 text-[#6e7685]" />
                  <input
                    type="text"
                    value={userSearch}
                    onChange={e => {
                      setUserSearch(e.target.value)
                      setUsersPage(1)
                    }}
                    placeholder="Search player by phone number, username, or ID..."
                    className="h-9 w-full rounded border border-[#2c313c] bg-[#0d0f12] pl-9 pr-3 text-xs text-white placeholder:text-[#6e7685] focus:border-[#0da84b] focus:outline-none"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex rounded border border-[#2c313c] bg-[#0d0f12] p-0.5 text-xs">
                    <button
                      onClick={() => { setUserStatusFilter('all'); setUsersPage(1) }}
                      className={`rounded px-3 py-1 font-semibold ${userStatusFilter === 'all' ? 'bg-[#242933] text-white' : 'text-[#8e96a4]'}`}
                    >
                      All ({usersTotal})
                    </button>
                    <button
                      onClick={() => { setUserStatusFilter('active'); setUsersPage(1) }}
                      className={`rounded px-3 py-1 font-semibold ${userStatusFilter === 'active' ? 'bg-[#242933] text-[#10b981]' : 'text-[#8e96a4]'}`}
                    >
                      Active
                    </button>
                    <button
                      onClick={() => { setUserStatusFilter('frozen'); setUsersPage(1) }}
                      className={`rounded px-3 py-1 font-semibold ${userStatusFilter === 'frozen' ? 'bg-[#242933] text-[#f87171]' : 'text-[#8e96a4]'}`}
                    >
                      Suspended
                    </button>
                  </div>

                  <select
                    value={usersLimit}
                    onChange={e => {
                      setUsersLimit(e.target.value as any)
                      setUsersPage(1)
                    }}
                    className="h-8 rounded border border-[#2c313c] bg-[#0d0f12] px-2.5 text-xs font-semibold text-white focus:border-[#0da84b] focus:outline-none"
                  >
                    <option value="25">25 rows</option>
                    <option value="50">50 rows</option>
                    <option value="100">100 rows</option>
                    <option value="all">All rows</option>
                  </select>

                  <button
                    type="button"
                    onClick={handleSyncDatabase}
                    disabled={isSyncingDb}
                    className="flex h-8 items-center gap-1.5 rounded border border-[#2c313c] bg-[#1c2028] px-3 text-xs font-semibold text-[#e5e7eb] hover:border-[#0da84b] disabled:opacity-50"
                  >
                    <RefreshCw className={`size-3.5 ${isSyncingDb ? 'animate-spin' : ''}`} />
                    <span>{isSyncingDb ? 'Syncing...' : 'Sync DB'}</span>
                  </button>
                </div>
              </div>

              {/* Users Table */}
              <div className="overflow-hidden rounded-md border border-[#242830] bg-[#16191f]">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#242830] bg-[#1c2028] text-[11px] font-bold uppercase text-[#8e96a4]">
                        <th className="p-3">Player</th>
                        <th className="p-3">Wallet Balance</th>
                        <th className="p-3">Freebet Bonus</th>
                        <th className="p-3">Referrals</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Joined</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#22262e]">
                      {usersLoading ? (
                        <tr><td colSpan={7} className="py-10 text-center text-[#8e96a4]"><RefreshCw className="mx-auto size-5 animate-spin mb-1.5 text-[#0da84b]" />Loading players...</td></tr>
                      ) : usersList.length === 0 ? (
                        <tr><td colSpan={7} className="py-10 text-center text-[#8e96a4]">No players match the search criteria.</td></tr>
                      ) : (
                        usersList.map(u => (
                          <tr key={u._id} className="hover:bg-[#1c2028]">
                            <td className="p-3">
                              <div className="font-bold text-white">{u.username || 'Player'}</div>
                              <div className="font-mono text-[11px] text-[#8e96a4]">{u.phone}</div>
                            </td>
                            <td className="p-3 tabular-nums">
                              <div className="font-bold text-sm text-[#10b981]">
                                KSH {Number(u.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                            </td>
                            <td className="p-3 tabular-nums">
                              <div className="font-semibold text-white">KSH {u.freebet ?? 0}</div>
                              <div className="text-[11px] text-[#8e96a4]">{u.freebetLocked ? 'Locked' : 'Unlocked'}</div>
                            </td>
                            <td className="p-3 text-[#c4c9d4] tabular-nums">
                              {u.referralsCount || 0} <span className="text-[#6e7685]">(KSH {u.referralsEarnings || 0})</span>
                            </td>
                            <td className="p-3">
                              <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-bold uppercase ${
                                u.isFrozen
                                  ? 'bg-[#2a1215] text-[#f87171] border border-[#541b21]'
                                  : 'bg-[#102618] text-[#34d399] border border-[#164e30]'
                              }`}>
                                {u.isFrozen ? 'Suspended' : 'Active'}
                              </span>
                            </td>
                            <td className="p-3 text-[#8e96a4] tabular-nums whitespace-nowrap">{formatDate(u.createdAt)}</td>
                            <td className="p-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => handleOpenUserDetail(u._id)}
                                  disabled={detailLoading}
                                  className="inline-flex items-center gap-1 rounded border border-[#2c313c] bg-[#14171c] px-2 py-1 text-[11px] font-semibold text-[#e5e7eb] hover:bg-[#242933] disabled:opacity-50"
                                  title="Inspect player ledger"
                                >
                                  <Eye className="size-3" />
                                  <span>Inspect</span>
                                </button>

                                <button
                                  onClick={() => {
                                    setBalanceModalUser(u)
                                    setBalanceAmount('')
                                    setBalanceType('credit')
                                  }}
                                  className="inline-flex items-center gap-1 rounded border border-[#164e30] bg-[#102618] px-2 py-1 text-[11px] font-semibold text-[#34d399] hover:bg-[#163822]"
                                  title="Adjust real balance"
                                >
                                  <Wallet className="size-3" />
                                  <span>Balance</span>
                                </button>

                                <button
                                  onClick={() => {
                                    setFreebetModalUser(u)
                                    setFreebetAmount(String(u.freebet || 0))
                                    setFreebetLocked(u.freebetLocked)
                                  }}
                                  className="inline-flex items-center gap-1 rounded border border-[#2c313c] bg-[#14171c] px-2 py-1 text-[11px] font-semibold text-[#c4c9d4] hover:bg-[#242933] hover:text-white"
                                  title="Adjust freebet"
                                >
                                  <Gift className="size-3" />
                                  <span>Freebet</span>
                                </button>

                                <button
                                  onClick={() => handleToggleFreeze(u)}
                                  className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-semibold ${
                                    u.isFrozen
                                      ? 'border-[#164e30] bg-[#102618] text-[#34d399]'
                                      : 'border-[#541b21] bg-[#2a1215] text-[#f87171]'
                                  }`}
                                  title={u.isFrozen ? 'Activate account' : 'Suspend account'}
                                >
                                  {u.isFrozen ? <Unlock className="size-3" /> : <Lock className="size-3" />}
                                  <span>{u.isFrozen ? 'Activate' : 'Suspend'}</span>
                                </button>

                                <button
                                  onClick={() => {
                                    setPasswordModalUser(u)
                                    setNewPasswordVal('')
                                  }}
                                  className="inline-flex items-center gap-1 rounded border border-[#2c313c] bg-[#14171c] px-2 py-1 text-[11px] font-semibold text-[#8e96a4] hover:text-white"
                                  title="Reset password"
                                >
                                  <Key className="size-3" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {usersTotalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-[#242830] bg-[#1c2028] px-4 py-2.5 text-xs">
                    <button
                      onClick={() => setUsersPage(p => Math.max(1, p - 1))}
                      disabled={usersPage <= 1}
                      className="rounded border border-[#2c313c] bg-[#14171c] px-3 py-1 font-semibold text-white hover:bg-[#242933] disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <span className="text-[#8e96a4] tabular-nums">
                      Page {usersPage} of {usersTotalPages} ({usersTotal} players)
                    </span>
                    <button
                      onClick={() => setUsersPage(p => Math.min(usersTotalPages, p + 1))}
                      disabled={usersPage >= usersTotalPages}
                      className="rounded border border-[#2c313c] bg-[#14171c] px-3 py-1 font-semibold text-white hover:bg-[#242933] disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              TAB 5: BETS & LEDGER
              ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'bets' && (
            <div className="space-y-4">
              {/* Bets KPI Strip */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <div className="rounded-md border border-[#242830] bg-[#16191f] p-3.5">
                  <div className="text-xs font-semibold text-[#8e96a4]">Filtered Bets</div>
                  <div className="mt-1 text-xl font-bold text-white tabular-nums">{betsMetrics?.totalBets ?? betsTotal}</div>
                  <div className="mt-0.5 text-[11px] text-[#8e96a4] tabular-nums">
                    Won: {betsMetrics?.countWon ?? 0} • Lost: {betsMetrics?.countLost ?? 0}
                  </div>
                </div>

                <div className="rounded-md border border-[#242830] bg-[#16191f] p-3.5">
                  <div className="text-xs font-semibold text-[#8e96a4]">Total Wagered</div>
                  <div className="mt-1 text-xl font-bold text-white tabular-nums">{formatMoney(betsMetrics?.totalWagered ?? 0)}</div>
                  <div className="mt-0.5 text-[11px] text-[#8e96a4]">Stake volume</div>
                </div>

                <div className="rounded-md border border-[#242830] bg-[#16191f] p-3.5">
                  <div className="text-xs font-semibold text-[#8e96a4]">Total Payouts</div>
                  <div className="mt-1 text-xl font-bold text-[#10b981] tabular-nums">{formatMoney(betsMetrics?.totalWon ?? 0)}</div>
                  <div className="mt-0.5 text-[11px] text-[#8e96a4]">Player winnings</div>
                </div>

                <div className="rounded-md border border-[#242830] bg-[#16191f] p-3.5">
                  <div className="text-xs font-semibold text-[#8e96a4]">House Gross (GGR)</div>
                  <div className={`mt-1 text-xl font-bold tabular-nums ${(betsMetrics?.houseGross ?? 0) >= 0 ? 'text-[#10b981]' : 'text-[#f87171]'}`}>
                    {formatMoney(betsMetrics?.houseGross ?? 0)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-[#8e96a4]">Net margin</div>
                </div>

                <div className="col-span-2 sm:col-span-1 rounded-md border border-[#242830] bg-[#16191f] p-3.5">
                  <div className="text-xs font-semibold text-[#8e96a4]">Player Win Rate</div>
                  <div className="mt-1 text-xl font-bold text-[#fbbf24] tabular-nums">{betsMetrics?.winRate ?? 0}%</div>
                  <div className="mt-0.5 text-[11px] text-[#8e96a4] tabular-nums">Active: {betsMetrics?.countActive ?? 0}</div>
                </div>
              </div>

              {/* Filter & Search Bar */}
              <div className="flex flex-col gap-3 rounded-md border border-[#242830] bg-[#16191f] p-3.5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex rounded border border-[#2c313c] bg-[#0d0f12] p-0.5 text-xs">
                    {(['all', 'won', 'lost', 'active'] as const).map(st => (
                      <button
                        key={st}
                        onClick={() => { setBetStatusFilter(st); setBetsPage(1) }}
                        className={`rounded px-3 py-1 font-semibold capitalize ${
                          betStatusFilter === st ? 'bg-[#0da84b] text-white' : 'text-[#8e96a4] hover:text-white'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>

                  <div className="flex rounded border border-[#2c313c] bg-[#0d0f12] p-0.5 text-xs">
                    {(['all', 'money', 'freebet'] as const).map(tp => (
                      <button
                        key={tp}
                        onClick={() => { setBetTypeFilter(tp); setBetsPage(1) }}
                        className={`rounded px-3 py-1 font-semibold capitalize ${
                          betTypeFilter === tp ? 'bg-[#242933] text-white' : 'text-[#8e96a4] hover:text-white'
                        }`}
                      >
                        {tp === 'all' ? 'All Stakes' : tp === 'money' ? 'Real Cash' : 'Freebet'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative flex-1 sm:w-52">
                    <Search className="absolute left-3 top-2.5 size-3.5 text-[#6e7685]" />
                    <input
                      type="text"
                      value={betSearch}
                      onChange={e => { setBetSearch(e.target.value); setBetsPage(1) }}
                      placeholder="Player phone or username..."
                      className="h-8 w-full rounded border border-[#2c313c] bg-[#0d0f12] pl-8 pr-3 text-xs text-white placeholder:text-[#6e7685] focus:border-[#0da84b] focus:outline-none"
                    />
                  </div>

                  <input
                    type="text"
                    value={betRoundId}
                    onChange={e => { setBetRoundId(e.target.value); setBetsPage(1) }}
                    placeholder="Round ID..."
                    className="h-8 w-28 rounded border border-[#2c313c] bg-[#0d0f12] px-2.5 text-xs text-white placeholder:text-[#6e7685] focus:border-[#0da84b] focus:outline-none"
                  />
                </div>
              </div>

              {/* Bets Table */}
              <div className="overflow-hidden rounded-md border border-[#242830] bg-[#16191f]">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#242830] bg-[#1c2028] text-[11px] font-bold uppercase text-[#8e96a4]">
                        <th className="p-3">Time</th>
                        <th className="p-3">Round</th>
                        <th className="p-3">Player</th>
                        <th className="p-3">Wallet</th>
                        <th className="p-3">Stake</th>
                        <th className="p-3">Cashout At</th>
                        <th className="p-3">Payout</th>
                        <th className="p-3">Player Net</th>
                        <th className="p-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#22262e]">
                      {betsLoading ? (
                        <tr><td colSpan={9} className="py-10 text-center text-[#8e96a4]"><RefreshCw className="mx-auto size-5 animate-spin mb-1.5 text-[#0da84b]" />Loading bets ledger...</td></tr>
                      ) : betsList.length === 0 ? (
                        <tr><td colSpan={9} className="py-10 text-center text-[#8e96a4]">No bets found matching your filters.</td></tr>
                      ) : (
                        betsList.map(b => {
                          const isWon = b.status === 'won'
                          const isLost = b.status === 'lost'
                          const profit = isWon ? (b.winAmount - b.amount) : -b.amount

                          return (
                            <tr key={b._id} className="hover:bg-[#1c2028]">
                              <td className="p-3 font-mono text-[11px] text-[#8e96a4] whitespace-nowrap">{formatDate(b.createdAt)}</td>
                              <td className="p-3 font-mono text-[11px] font-semibold text-[#c4c9d4] whitespace-nowrap">{b.roundId}</td>
                              <td className="p-3">
                                {b.userId ? (
                                  <button
                                    onClick={() => handleOpenUserDetail(b.userId?._id || '')}
                                    className="text-left hover:underline"
                                  >
                                    <div className="font-bold text-white">{b.userId.username}</div>
                                    <div className="font-mono text-[11px] text-[#8e96a4]">{b.userId.phone}</div>
                                  </button>
                                ) : (
                                  <span className="text-[#6e7685]">—</span>
                                )}
                              </td>
                              <td className="p-3">
                                <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                                  b.isFreebet ? 'bg-[#2b2111] text-[#fbbf24] border border-[#523c16]' : 'bg-[#1c2028] text-[#c4c9d4] border border-[#2c313c]'
                                }`}>
                                  {b.isFreebet ? 'Freebet' : 'Cash'}
                                </span>
                              </td>
                              <td className="p-3 font-bold text-white tabular-nums whitespace-nowrap">KSH {b.amount}</td>
                              <td className="p-3 font-mono font-bold tabular-nums whitespace-nowrap">
                                {b.multiplierCaught ? <span className="text-[#10b981]">{b.multiplierCaught}x</span> : <span className="text-[#6e7685]">—</span>}
                              </td>
                              <td className="p-3 font-bold tabular-nums whitespace-nowrap">
                                {isWon ? <span className="text-[#10b981]">KSH {b.winAmount}</span> : <span className="text-[#6e7685]">KSH 0</span>}
                              </td>
                              <td className="p-3 font-bold tabular-nums whitespace-nowrap">
                                {isWon ? (
                                  <span className="text-[#10b981]">+{formatMoney(profit)}</span>
                                ) : isLost ? (
                                  <span className="text-[#f87171]">-{formatMoney(Math.abs(profit))}</span>
                                ) : (
                                  <span className="text-[#6e7685]">—</span>
                                )}
                              </td>
                              <td className="p-3 whitespace-nowrap">
                                <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-bold uppercase ${
                                  isWon
                                    ? 'bg-[#102618] text-[#34d399] border border-[#164e30]'
                                    : isLost
                                    ? 'bg-[#2a1215] text-[#f87171] border border-[#541b21]'
                                    : 'bg-[#2b2111] text-[#fbbf24] border border-[#523c16]'
                                }`}>
                                  {b.status}
                                </span>
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {betsTotalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-[#242830] bg-[#1c2028] px-4 py-2.5 text-xs">
                    <span className="text-[#8e96a4] tabular-nums">
                      Showing {(betsPage - 1) * 25 + 1}–{Math.min(betsPage * 25, betsTotal)} of {betsTotal}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setBetsPage(p => Math.max(1, p - 1))}
                        disabled={betsPage <= 1}
                        className="rounded border border-[#2c313c] bg-[#14171c] px-3 py-1 font-semibold text-white hover:bg-[#242933] disabled:opacity-40"
                      >
                        Prev
                      </button>
                      <span className="px-2 font-semibold text-[#c4c9d4] tabular-nums">{betsPage} / {betsTotalPages}</span>
                      <button
                        onClick={() => setBetsPage(p => Math.min(betsTotalPages, p + 1))}
                        disabled={betsPage >= betsTotalPages}
                        className="rounded border border-[#2c313c] bg-[#14171c] px-3 py-1 font-semibold text-white hover:bg-[#242933] disabled:opacity-40"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              TAB 6: ODDS ENGINE CONTROL
              ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'odds' && (
            <div className="mx-auto max-w-4xl space-y-5">
              {oddsToast && (
                <div
                  className={`flex items-center justify-between rounded border p-3.5 text-xs font-semibold ${
                    oddsToast.type === 'success'
                      ? 'border-[#0da84b] bg-[#102618] text-[#34d399]'
                      : 'border-[#dc2626] bg-[#2a1215] text-[#f87171]'
                  }`}
                >
                  <span>{oddsToast.message}</span>
                  <button onClick={() => setOddsToast(null)} className="text-[#8e96a4] hover:text-white">
                    <X className="size-4" />
                  </button>
                </div>
              )}

              {/* Live Engine Status Bar */}
              <div className={`rounded-md border p-5 ${oddsEngine?.enabled ? 'border-[#0da84b] bg-[#102217]' : 'border-[#242830] bg-[#16191f]'}`}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3.5">
                    <div className={`flex size-10 shrink-0 items-center justify-center rounded ${oddsEngine?.enabled ? 'bg-[#0da84b] text-white' : 'bg-[#242830] text-[#8e96a4]'}`}>
                      <Zap className="size-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm font-bold text-white">
                          {oddsEngine?.enabled ? 'Promotional Odds Override Active' : 'Standard Provably Fair Mode'}
                        </h2>
                        <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                          oddsEngine?.enabled ? 'bg-[#0da84b] text-white' : 'bg-[#242830] text-[#8e96a4]'
                        }`}>
                          {oddsEngine?.enabled ? 'BOOST ON' : 'NORMAL'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-[#b4bcc8]">
                        {oddsEngine?.enabled ? (
                          <>
                            Targeting{' '}
                            <strong className="text-[#34d399] font-bold tabular-nums">
                              {oddsEngine.mode === 'range'
                                ? `${oddsEngine.minMultiplier.toFixed(2)}x – ${oddsEngine.maxMultiplier.toFixed(2)}x`
                                : oddsEngine.mode === 'min_multiplier'
                                ? `>= ${oddsEngine.minMultiplier.toFixed(2)}x`
                                : `Exact ${oddsEngine.exactMultiplier?.toFixed(2)}x`}
                            </strong>
                            {oddsEngine.durationType === 'minutes' && (
                              <span className="ml-2 font-mono text-white">
                                ({Math.floor((oddsEngine.timeRemainingSeconds || 0) / 60)}m {((oddsEngine.timeRemainingSeconds || 0) % 60).toString().padStart(2, '0')}s left)
                              </span>
                            )}
                            {oddsEngine.durationType === 'rounds' && (
                              <span className="ml-2 font-mono text-white">
                                ({oddsEngine.roundsRemaining}/{oddsEngine.roundsTotal} rounds left)
                              </span>
                            )}
                          </>
                        ) : (
                          'Multipliers are currently generated using standard unadjusted SHA-256 server seeds.'
                        )}
                      </p>
                    </div>
                  </div>

                  {oddsEngine?.enabled ? (
                    <button
                      type="button"
                      onClick={handleResetOddsRule}
                      disabled={oddsSubmitting}
                      className="rounded bg-[#dc2626] px-4 py-2 text-xs font-bold text-white hover:bg-[#b91c1c] disabled:opacity-50"
                    >
                      Reset to Normal Odds
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={fetchOddsEngine}
                      disabled={oddsSubmitting}
                      className="rounded border border-[#2c313c] bg-[#1c2028] px-3 py-2 text-xs font-semibold text-white hover:bg-[#242933]"
                    >
                      Check Status
                    </button>
                  )}
                </div>
              </div>

              {/* 1-Click Presets */}
              <div className="rounded-md border border-[#242830] bg-[#16191f] p-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#8e96a4]">Quick Promotional Presets</h3>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <button
                    type="button"
                    onClick={() => handleApplyOddsRule({
                      mode: 'range', minMultiplier: 2.0, maxMultiplier: 5.0,
                      durationType: 'minutes', durationMinutes: 15,
                      note: 'Active Users Reward: 2.00x - 5.00x for 15m'
                    })}
                    disabled={oddsSubmitting}
                    className="rounded border border-[#2c313c] bg-[#1c2028] p-3.5 text-left hover:border-[#0da84b]"
                  >
                    <div className="text-xs font-bold text-[#10b981]">Player Boost</div>
                    <div className="mt-1 text-base font-bold text-white tabular-nums">2.00x – 5.00x</div>
                    <div className="mt-1 text-[11px] text-[#8e96a4]">15 minutes • Auto-resets</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleApplyOddsRule({
                      mode: 'range', minMultiplier: 2.0, maxMultiplier: 10.0,
                      durationType: 'minutes', durationMinutes: 30,
                      note: 'Happy Hour Boost: 2.00x - 10.00x for 30m'
                    })}
                    disabled={oddsSubmitting}
                    className="rounded border border-[#2c313c] bg-[#1c2028] p-3.5 text-left hover:border-[#0da84b]"
                  >
                    <div className="text-xs font-bold text-[#fbbf24]">Happy Hour</div>
                    <div className="mt-1 text-base font-bold text-white tabular-nums">2.00x – 10.00x</div>
                    <div className="mt-1 text-[11px] text-[#8e96a4]">30 minutes • Auto-resets</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleApplyOddsRule({
                      mode: 'range', minMultiplier: 2.0, maxMultiplier: 4.0,
                      durationType: 'rounds', roundsTotal: 10,
                      note: '10 Rounds Streak: 2.00x - 4.00x'
                    })}
                    disabled={oddsSubmitting}
                    className="rounded border border-[#2c313c] bg-[#1c2028] p-3.5 text-left hover:border-[#0da84b]"
                  >
                    <div className="text-xs font-bold text-[#34d399]">10-Round Streak</div>
                    <div className="mt-1 text-base font-bold text-white tabular-nums">2.00x – 4.00x</div>
                    <div className="mt-1 text-[11px] text-[#8e96a4]">Next 10 rounds</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleApplyOddsRule({
                      mode: 'min_multiplier', minMultiplier: 2.0, maxMultiplier: 50.0,
                      durationType: 'minutes', durationMinutes: 10,
                      note: 'Over 2.00x Floor: 10m'
                    })}
                    disabled={oddsSubmitting}
                    className="rounded border border-[#2c313c] bg-[#1c2028] p-3.5 text-left hover:border-[#0da84b]"
                  >
                    <div className="text-xs font-bold text-[#60a5fa]">2x Minimum Floor</div>
                    <div className="mt-1 text-base font-bold text-white tabular-nums">&ge; 2.00x</div>
                    <div className="mt-1 text-[11px] text-[#8e96a4]">10 minutes • Auto-resets</div>
                  </button>
                </div>
              </div>

              {/* Custom Rule Builder */}
              <form onSubmit={e => { e.preventDefault(); handleApplyOddsRule() }} className="rounded-md border border-[#242830] bg-[#16191f] p-5 space-y-4">
                <div className="border-b border-[#242830] pb-3">
                  <h3 className="text-sm font-bold text-white">Custom Odds Rule</h3>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[#c4c9d4]">Mode</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'range', label: 'Range (Min–Max)' },
                      { id: 'min_multiplier', label: 'Minimum Floor' },
                      { id: 'exact', label: 'Exact Target' }
                    ].map(m => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setOddsMode(m.id as any)}
                        className={`rounded border py-2 text-xs font-semibold ${
                          oddsMode === m.id
                            ? 'border-[#0da84b] bg-[#102618] text-[#34d399]'
                            : 'border-[#2c313c] bg-[#0d0f12] text-[#8e96a4] hover:text-white'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {oddsMode === 'range' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[#c4c9d4]">Min Multiplier (x)</label>
                      <input
                        type="number" step="0.1" min="1.01" max="100"
                        value={oddsMin} onChange={e => setOddsMin(e.target.value)}
                        className="h-10 w-full rounded border border-[#2c313c] bg-[#0d0f12] px-3 text-sm font-bold text-white tabular-nums focus:border-[#0da84b] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[#c4c9d4]">Max Multiplier (x)</label>
                      <input
                        type="number" step="0.1" min="1.01" max="200"
                        value={oddsMax} onChange={e => setOddsMax(e.target.value)}
                        className="h-10 w-full rounded border border-[#2c313c] bg-[#0d0f12] px-3 text-sm font-bold text-white tabular-nums focus:border-[#0da84b] focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                {oddsMode === 'min_multiplier' && (
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#c4c9d4]">Minimum Guaranteed Multiplier (x)</label>
                    <input
                      type="number" step="0.1" min="1.01" max="100"
                      value={oddsMin} onChange={e => setOddsMin(e.target.value)}
                      className="h-10 w-full rounded border border-[#2c313c] bg-[#0d0f12] px-3 text-sm font-bold text-white tabular-nums focus:border-[#0da84b] focus:outline-none"
                    />
                  </div>
                )}

                {oddsMode === 'exact' && (
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#c4c9d4]">Exact Crash Multiplier (x)</label>
                    <input
                      type="number" step="0.05" min="1.01" max="100"
                      value={oddsExact} onChange={e => setOddsExact(e.target.value)}
                      className="h-10 w-full rounded border border-[#2c313c] bg-[#0d0f12] px-3 text-sm font-bold text-white tabular-nums focus:border-[#0da84b] focus:outline-none"
                    />
                  </div>
                )}

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[#c4c9d4]">Duration Control</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'minutes', label: 'Minutes Timer' },
                      { id: 'rounds', label: 'Round Count' },
                      { id: 'scheduled_window', label: 'Date/Time Window' }
                    ].map(d => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setOddsDurationType(d.id as any)}
                        className={`rounded border py-2 text-xs font-semibold ${
                          oddsDurationType === d.id
                            ? 'border-[#0da84b] bg-[#102618] text-[#34d399]'
                            : 'border-[#2c313c] bg-[#0d0f12] text-[#8e96a4] hover:text-white'
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>

                {oddsDurationType === 'minutes' && (
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#c4c9d4]">Active Duration (Minutes)</label>
                    <input
                      type="number" min="1" max="1440"
                      value={oddsDurationMinutes} onChange={e => setOddsDurationMinutes(e.target.value)}
                      className="h-10 w-full rounded border border-[#2c313c] bg-[#0d0f12] px-3 text-sm font-bold text-white tabular-nums focus:border-[#0da84b] focus:outline-none"
                    />
                  </div>
                )}

                {oddsDurationType === 'rounds' && (
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#c4c9d4]">Number of Rounds</label>
                    <input
                      type="number" min="1" max="500"
                      value={oddsRoundsTotal} onChange={e => setOddsRoundsTotal(e.target.value)}
                      className="h-10 w-full rounded border border-[#2c313c] bg-[#0d0f12] px-3 text-sm font-bold text-white tabular-nums focus:border-[#0da84b] focus:outline-none"
                    />
                  </div>
                )}

                {oddsDurationType === 'scheduled_window' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[#c4c9d4]">Start Time</label>
                      <input
                        type="datetime-local"
                        value={oddsScheduledStart} onChange={e => setOddsScheduledStart(e.target.value)}
                        className="h-10 w-full rounded border border-[#2c313c] bg-[#0d0f12] px-3 text-xs text-white focus:border-[#0da84b] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[#c4c9d4]">End Time</label>
                      <input
                        type="datetime-local"
                        value={oddsScheduledEnd} onChange={e => setOddsScheduledEnd(e.target.value)}
                        className="h-10 w-full rounded border border-[#2c313c] bg-[#0d0f12] px-3 text-xs text-white focus:border-[#0da84b] focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#c4c9d4]">Audit Note</label>
                  <input
                    type="text"
                    value={oddsNote} onChange={e => setOddsNote(e.target.value)}
                    className="h-10 w-full rounded border border-[#2c313c] bg-[#0d0f12] px-3 text-xs text-white focus:border-[#0da84b] focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={oddsSubmitting}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded bg-[#0da84b] text-xs font-bold uppercase tracking-wider text-white hover:bg-[#0b9240] disabled:opacity-50"
                >
                  <Zap className="size-4" />
                  <span>Activate Odds Rule</span>
                </button>
              </form>

              {/* Audit Logs */}
              <div className="rounded-md border border-[#242830] bg-[#16191f]">
                <div className="border-b border-[#242830] px-4 py-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#8e96a4]">Odds Engine Audit Log</h3>
                </div>
                {oddsAuditLogs.length === 0 ? (
                  <div className="py-8 text-center text-xs text-[#8e96a4]">No odds override history recorded.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-[#242830] bg-[#1c2028] text-[11px] font-bold uppercase text-[#8e96a4]">
                          <th className="p-3">Activated</th>
                          <th className="p-3">Mode</th>
                          <th className="p-3">Target</th>
                          <th className="p-3">Duration</th>
                          <th className="p-3">State</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#22262e]">
                        {oddsAuditLogs.map((log, i) => (
                          <tr key={i} className="hover:bg-[#1c2028]">
                            <td className="p-3 text-[#8e96a4] tabular-nums">{new Date(log.activatedAt).toLocaleString()}</td>
                            <td className="p-3 font-semibold text-white capitalize">{log.mode}</td>
                            <td className="p-3 font-bold text-[#10b981] tabular-nums">
                              {log.mode === 'range' ? `${log.minMultiplier}x – ${log.maxMultiplier || 5}x` : `>= ${log.minMultiplier}x`}
                            </td>
                            <td className="p-3 text-[#c4c9d4]">
                              {log.durationType === 'minutes' ? `${log.durationMinutes}m` : log.durationType === 'rounds' ? `${log.roundsTotal} rounds` : 'Window'}
                            </td>
                            <td className="p-3">
                              {log.expiredAt ? (
                                <span className="text-[#8e96a4]">Completed ({log.reason || 'Done'})</span>
                              ) : (
                                <span className="font-bold text-[#10b981]">Active</span>
                              )}
                            </td>
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
              TAB 7: PAYD GATEWAY CONFIGURATION
              ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'gateway' && (
            <div className="mx-auto max-w-2xl space-y-4">
              <form onSubmit={handleSaveGateway} className="space-y-4 rounded-md border border-[#242830] bg-[#16191f] p-5">
                <div className="flex items-center justify-between border-b border-[#242830] pb-3">
                  <div>
                    <h2 className="text-sm font-bold text-white">Payd M-Pesa STK Credentials</h2>
                    <p className="text-xs text-[#8e96a4]">Stored in MongoDB and applied immediately to all deposit requests</p>
                  </div>
                  <span className={`rounded px-2.5 py-1 text-xs font-bold ${
                    paymentConfig.paydApiUsername && (isPasswordConfigured || isSecretConfigured)
                      ? 'bg-[#102618] text-[#34d399] border border-[#164e30]'
                      : 'bg-[#2b2111] text-[#fbbf24] border border-[#523c16]'
                  }`}>
                    {paymentConfig.paydApiUsername && (isPasswordConfigured || isSecretConfigured) ? 'Configured' : 'Incomplete'}
                  </span>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#c4c9d4]">Payd API Username</label>
                  <input
                    type="text"
                    value={paymentConfig.paydApiUsername}
                    onChange={e => setPaymentConfig(prev => ({ ...prev, paydApiUsername: e.target.value }))}
                    placeholder="e.g. your_api_username"
                    required
                    className="h-10 w-full rounded border border-[#2c313c] bg-[#0d0f12] px-3 font-mono text-xs text-white focus:border-[#0da84b] focus:outline-none"
                  />
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between text-xs font-semibold text-[#c4c9d4]">
                    <span>Payd API Password</span>
                    <button
                      type="button"
                      onClick={() => setShowApiPassword(!showApiPassword)}
                      className="flex items-center gap-1 text-xs text-[#8e96a4] hover:text-white"
                    >
                      {showApiPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                      <span>{showApiPassword ? 'Hide' : 'Show'}</span>
                    </button>
                  </div>
                  <input
                    type={showApiPassword ? 'text' : 'password'}
                    value={newApiPassword}
                    onChange={e => setNewApiPassword(e.target.value)}
                    placeholder={isPasswordConfigured ? 'Configured (leave blank to keep existing)' : 'Enter Payd API password'}
                    className="h-10 w-full rounded border border-[#2c313c] bg-[#0d0f12] px-3 font-mono text-xs text-white focus:border-[#0da84b] focus:outline-none"
                  />
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between text-xs font-semibold text-[#c4c9d4]">
                    <span>Payd API Secret (Bearer Token)</span>
                    <button
                      type="button"
                      onClick={() => setShowApiSecret(!showApiSecret)}
                      className="flex items-center gap-1 text-xs text-[#8e96a4] hover:text-white"
                    >
                      {showApiSecret ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                      <span>{showApiSecret ? 'Hide' : 'Show'}</span>
                    </button>
                  </div>
                  <input
                    type={showApiSecret ? 'text' : 'password'}
                    value={newApiSecret}
                    onChange={e => setNewApiSecret(e.target.value)}
                    placeholder={isSecretConfigured ? 'Configured (leave blank to keep existing)' : 'Optional Bearer Secret'}
                    className="h-10 w-full rounded border border-[#2c313c] bg-[#0d0f12] px-3 font-mono text-xs text-white focus:border-[#0da84b] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#c4c9d4]">Payd Wallet Username</label>
                  <input
                    type="text"
                    value={paymentConfig.paydWalletUsername}
                    onChange={e => setPaymentConfig(prev => ({ ...prev, paydWalletUsername: e.target.value }))}
                    placeholder="Merchant wallet username"
                    className="h-10 w-full rounded border border-[#2c313c] bg-[#0d0f12] px-3 font-mono text-xs text-white focus:border-[#0da84b] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#c4c9d4]">Payd REST Endpoint URL</label>
                  <input
                    type="text"
                    value={paymentConfig.paydApiBaseUrl}
                    onChange={e => setPaymentConfig(prev => ({ ...prev, paydApiBaseUrl: e.target.value }))}
                    required
                    className="h-10 w-full rounded border border-[#2c313c] bg-[#0d0f12] px-3 font-mono text-xs text-white focus:border-[#0da84b] focus:outline-none"
                  />
                </div>

                <div className="rounded border border-[#242830] bg-[#0d0f12] p-3 text-xs space-y-2">
                  <div className="font-semibold text-[#c4c9d4]">Webhook Callback Endpoint</div>
                  <div className="flex items-center justify-between gap-2 rounded border border-[#242830] bg-[#16191f] px-3 py-2 font-mono text-xs text-[#10b981]">
                    <span className="truncate">{typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/payd` : '/api/webhooks/payd'}</span>
                    <button type="button" onClick={copyWebhookUrl} className="text-[#8e96a4] hover:text-white">
                      {copiedWebhook ? <Check className="size-4 text-[#10b981]" /> : <Copy className="size-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={paymentLoading}
                    className="flex h-10 items-center gap-2 rounded bg-[#0da84b] px-5 text-xs font-bold text-white hover:bg-[#0b9240] disabled:opacity-50"
                  >
                    {paymentLoading ? <RefreshCw className="size-4 animate-spin" /> : 'Save Gateway Credentials'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              TAB 8: SYSTEM SETTINGS
              ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'settings' && (
            <div className="mx-auto max-w-2xl">
              <form onSubmit={handleSaveSystemSettings} className="space-y-4 rounded-md border border-[#242830] bg-[#16191f] p-5">
                <h2 className="border-b border-[#242830] pb-3 text-sm font-bold text-white">Platform Limits & Brand Configuration</h2>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#c4c9d4]">Brand Name</label>
                    <input
                      type="text"
                      value={paymentConfig.companyName}
                      onChange={e => setPaymentConfig(prev => ({ ...prev, companyName: e.target.value }))}
                      className="h-10 w-full rounded border border-[#2c313c] bg-[#0d0f12] px-3 text-xs text-white focus:border-[#0da84b] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#c4c9d4]">WhatsApp Support Number</label>
                    <input
                      type="text"
                      value={paymentConfig.whatsappSupport}
                      onChange={e => setPaymentConfig(prev => ({ ...prev, whatsappSupport: e.target.value }))}
                      className="h-10 w-full rounded border border-[#2c313c] bg-[#0d0f12] px-3 font-mono text-xs text-white focus:border-[#0da84b] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#c4c9d4]">Minimum Deposit (KSH)</label>
                    <input
                      type="number" min={1}
                      value={paymentConfig.minDeposit}
                      onChange={e => setPaymentConfig(prev => ({ ...prev, minDeposit: Number(e.target.value) }))}
                      className="h-10 w-full rounded border border-[#2c313c] bg-[#0d0f12] px-3 text-xs font-bold text-white tabular-nums focus:border-[#0da84b] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#c4c9d4]">Minimum Withdrawal (KSH)</label>
                    <input
                      type="number" min={1}
                      value={paymentConfig.minWithdrawal}
                      onChange={e => setPaymentConfig(prev => ({ ...prev, minWithdrawal: Number(e.target.value) }))}
                      className="h-10 w-full rounded border border-[#2c313c] bg-[#0d0f12] px-3 text-xs font-bold text-white tabular-nums focus:border-[#0da84b] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#c4c9d4]">Freebet Unlock Deposit (KSH)</label>
                    <input
                      type="number" min={1}
                      value={paymentConfig.freebetUnlockAmount}
                      onChange={e => setPaymentConfig(prev => ({ ...prev, freebetUnlockAmount: Number(e.target.value) }))}
                      className="h-10 w-full rounded border border-[#2c313c] bg-[#0d0f12] px-3 text-xs font-bold text-white tabular-nums focus:border-[#0da84b] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#c4c9d4]">Signup Freebet Bonus (KSH)</label>
                    <input
                      type="number" min={0}
                      value={paymentConfig.initialFreebet}
                      onChange={e => setPaymentConfig(prev => ({ ...prev, initialFreebet: Number(e.target.value) }))}
                      className="h-10 w-full rounded border border-[#2c313c] bg-[#0d0f12] px-3 text-xs font-bold text-white tabular-nums focus:border-[#0da84b] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#c4c9d4]">Referral Bonus (KSH)</label>
                    <input
                      type="number" min={0}
                      value={paymentConfig.referralReward}
                      onChange={e => setPaymentConfig(prev => ({ ...prev, referralReward: Number(e.target.value) }))}
                      className="h-10 w-full rounded border border-[#2c313c] bg-[#0d0f12] px-3 text-xs font-bold text-white tabular-nums focus:border-[#0da84b] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#c4c9d4]">Minimum Bet (KSH)</label>
                    <input
                      type="number" min={1}
                      value={paymentConfig.minBet}
                      onChange={e => setPaymentConfig(prev => ({ ...prev, minBet: Number(e.target.value) }))}
                      className="h-10 w-full rounded border border-[#2c313c] bg-[#0d0f12] px-3 text-xs font-bold text-white tabular-nums focus:border-[#0da84b] focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-semibold text-[#c4c9d4]">Maximum Bet (KSH)</label>
                    <input
                      type="number" min={100}
                      value={paymentConfig.maxBet}
                      onChange={e => setPaymentConfig(prev => ({ ...prev, maxBet: Number(e.target.value) }))}
                      className="h-10 w-full rounded border border-[#2c313c] bg-[#0d0f12] px-3 text-xs font-bold text-white tabular-nums focus:border-[#0da84b] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={paymentLoading}
                    className="flex h-10 items-center gap-2 rounded bg-[#0da84b] px-5 text-xs font-bold text-white hover:bg-[#0b9240] disabled:opacity-50"
                  >
                    {paymentLoading ? <RefreshCw className="size-4 animate-spin" /> : 'Save System Settings'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </main>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          MODAL 1: ADJUST USER BALANCE
          ══════════════════════════════════════════════════════════════ */}
      {balanceModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md rounded-md border border-[#2c313c] bg-[#16191f] overflow-hidden">
            <div className="flex items-center justify-between border-b border-[#242830] bg-[#1c2028] px-4 py-3">
              <span className="text-xs font-bold uppercase tracking-wider text-white">Adjust Player Balance</span>
              <button onClick={() => setBalanceModalUser(null)} className="text-[#8e96a4] hover:text-white">
                <X className="size-4" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between rounded border border-[#242830] bg-[#0d0f12] p-3 text-xs">
                <div>
                  <div className="font-bold text-white">{balanceModalUser.username}</div>
                  <div className="font-mono text-[#8e96a4]">{balanceModalUser.phone}</div>
                </div>
                <div className="text-right tabular-nums">
                  <div className="text-[11px] text-[#8e96a4]">Current Balance</div>
                  <div className="text-sm font-bold text-[#10b981]">KSH {balanceModalUser.balance.toFixed(2)}</div>
                </div>
              </div>

              <form onSubmit={handleAdjustBalance} className="space-y-3">
                <div className="grid grid-cols-3 gap-1.5 rounded border border-[#2c313c] bg-[#0d0f12] p-1">
                  {(['credit', 'debit', 'set'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setBalanceType(t)}
                      className={`rounded py-1.5 text-xs font-bold capitalize ${
                        balanceType === t ? 'bg-[#0da84b] text-white' : 'text-[#8e96a4] hover:text-white'
                      }`}
                    >
                      {t === 'credit' ? '+ Credit' : t === 'debit' ? '- Debit' : '= Set Exact'}
                    </button>
                  ))}
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#c4c9d4]">
                    {balanceType === 'set' ? 'New Wallet Balance (KSH)' : 'Adjustment Amount (KSH)'}
                  </label>
                  <input
                    type="number" step="0.01" min={balanceType === 'set' ? '0' : '0.01'}
                    value={balanceAmount} onChange={e => setBalanceAmount(e.target.value)}
                    placeholder="0.00" required
                    className="h-10 w-full rounded border border-[#2c313c] bg-[#0d0f12] px-3 text-sm font-bold text-white tabular-nums focus:border-[#0da84b] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#c4c9d4]">Audit Reason</label>
                  <input
                    type="text"
                    value={balanceReason} onChange={e => setBalanceReason(e.target.value)}
                    placeholder="e.g. Manual M-Pesa top-up verification"
                    className="h-10 w-full rounded border border-[#2c313c] bg-[#0d0f12] px-3 text-xs text-white focus:border-[#0da84b] focus:outline-none"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setBalanceModalUser(null)}
                    className="rounded border border-[#2c313c] bg-[#1c2028] px-4 py-2 text-xs font-semibold text-[#c4c9d4] hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingBalance || !balanceAmount}
                    className="rounded bg-[#0da84b] px-4 py-2 text-xs font-bold text-white hover:bg-[#0b9240] disabled:opacity-50"
                  >
                    {isSubmittingBalance ? 'Saving...' : 'Apply Balance'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MODAL 2: ADJUST USER FREEBET
          ══════════════════════════════════════════════════════════════ */}
      {freebetModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md rounded-md border border-[#2c313c] bg-[#16191f] overflow-hidden">
            <div className="flex items-center justify-between border-b border-[#242830] bg-[#1c2028] px-4 py-3">
              <span className="text-xs font-bold uppercase tracking-wider text-white">Manage Player Freebet</span>
              <button onClick={() => setFreebetModalUser(null)} className="text-[#8e96a4] hover:text-white">
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleAdjustFreebet} className="p-4 space-y-4">
              <div className="text-xs text-[#8e96a4]">
                Player: <strong className="text-white">{freebetModalUser.username}</strong> ({freebetModalUser.phone})
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[#c4c9d4]">Freebet Balance (KSH)</label>
                <input
                  type="number" min="0"
                  value={freebetAmount} onChange={e => setFreebetAmount(e.target.value)}
                  required
                  className="h-10 w-full rounded border border-[#2c313c] bg-[#0d0f12] px-3 text-sm font-bold text-white tabular-nums focus:border-[#0da84b] focus:outline-none"
                />
              </div>

              <label className="flex items-center gap-2.5 text-xs text-[#e5e7eb] cursor-pointer">
                <input
                  type="checkbox"
                  checked={freebetLocked}
                  onChange={e => setFreebetLocked(e.target.checked)}
                  className="size-4 accent-[#0da84b]"
                />
                <span>Keep freebet locked until player completes qualifying deposit</span>
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setFreebetModalUser(null)}
                  className="rounded border border-[#2c313c] bg-[#1c2028] px-4 py-2 text-xs font-semibold text-[#c4c9d4]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingFreebet}
                  className="rounded bg-[#0da84b] px-4 py-2 text-xs font-bold text-white hover:bg-[#0b9240] disabled:opacity-50"
                >
                  {isSubmittingFreebet ? 'Saving...' : 'Update Freebet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MODAL 3: RESET USER PASSWORD
          ══════════════════════════════════════════════════════════════ */}
      {passwordModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md rounded-md border border-[#2c313c] bg-[#16191f] overflow-hidden">
            <div className="flex items-center justify-between border-b border-[#242830] bg-[#1c2028] px-4 py-3">
              <span className="text-xs font-bold uppercase tracking-wider text-white">Reset Player Password</span>
              <button onClick={() => setPasswordModalUser(null)} className="text-[#8e96a4] hover:text-white">
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleResetPassword} className="p-4 space-y-4">
              <div className="text-xs text-[#8e96a4]">
                Set a new login password for <strong className="text-white">{passwordModalUser.username}</strong> ({passwordModalUser.phone})
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[#c4c9d4]">New Password</label>
                <input
                  type="text" minLength={4} required
                  value={newPasswordVal} onChange={e => setNewPasswordVal(e.target.value)}
                  placeholder="Minimum 4 characters"
                  className="h-10 w-full rounded border border-[#2c313c] bg-[#0d0f12] px-3 text-sm text-white focus:border-[#0da84b] focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPasswordModalUser(null)}
                  className="rounded border border-[#2c313c] bg-[#1c2028] px-4 py-2 text-xs font-semibold text-[#c4c9d4]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPassword || !newPasswordVal}
                  className="rounded bg-[#0da84b] px-4 py-2 text-xs font-bold text-white hover:bg-[#0b9240] disabled:opacity-50"
                >
                  {isSubmittingPassword ? 'Saving...' : 'Reset Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MODAL 4: PLAYER INSPECTOR & LEDGER RECONCILIATION
          ══════════════════════════════════════════════════════════════ */}
      {selectedUserForDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-md border border-[#2c313c] bg-[#16191f] overflow-hidden my-auto">
            <div className="flex items-center justify-between border-b border-[#242830] bg-[#1c2028] px-4 py-3">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-white">
                  Player Inspector: {selectedUserForDetail.user.username}
                </span>
                <span className="ml-2 font-mono text-xs text-[#8e96a4]">({selectedUserForDetail.user.phone})</span>
              </div>
              <button onClick={() => setSelectedUserForDetail(null)} className="text-[#8e96a4] hover:text-white">
                <X className="size-4" />
              </button>
            </div>

            <div className="p-4 space-y-4 max-h-[82vh] overflow-y-auto">
              {/* Summary Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 tabular-nums">
                <div className="rounded border border-[#242830] bg-[#0d0f12] p-3">
                  <div className="text-[11px] font-semibold text-[#8e96a4]">WALLET BALANCE</div>
                  <div className="mt-1 text-sm font-bold text-[#10b981]">KSH {selectedUserForDetail.user.balance.toFixed(2)}</div>
                </div>
                <div className="rounded border border-[#242830] bg-[#0d0f12] p-3">
                  <div className="text-[11px] font-semibold text-[#8e96a4]">TOTAL BETS</div>
                  <div className="mt-1 text-sm font-bold text-white">{selectedUserForDetail.stats.totalBets}</div>
                </div>
                <div className="rounded border border-[#242830] bg-[#0d0f12] p-3">
                  <div className="text-[11px] font-semibold text-[#8e96a4]">TOTAL WAGERED</div>
                  <div className="mt-1 text-sm font-bold text-white">KSH {selectedUserForDetail.stats.totalWagered.toFixed(2)}</div>
                </div>
                <div className="rounded border border-[#242830] bg-[#0d0f12] p-3">
                  <div className="text-[11px] font-semibold text-[#8e96a4]">TOTAL WON</div>
                  <div className="mt-1 text-sm font-bold text-[#10b981]">KSH {selectedUserForDetail.stats.totalWon.toFixed(2)}</div>
                </div>
              </div>

              {/* Balance Reconciliation Tool */}
              <div className="rounded border border-[#2c313c] bg-[#0d0f12] p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-white">
                    <Scale className="size-4 text-[#10b981]" />
                    <span>Wallet Ledger Reconciliation</span>
                  </div>
                  <button
                    onClick={() => handleReconcileUser(selectedUserForDetail.user._id, false)}
                    disabled={isReconciling}
                    className="flex items-center gap-1.5 rounded border border-[#2c313c] bg-[#1c2028] px-3 py-1 text-xs font-semibold text-white hover:bg-[#242933] disabled:opacity-50"
                  >
                    <RefreshCw className={`size-3 ${isReconciling ? 'animate-spin' : ''}`} />
                    <span>Run Audit</span>
                  </button>
                </div>

                {reconcileAudit && (
                  <div className="rounded border border-[#242830] bg-[#16191f] p-3 text-xs space-y-2 tabular-nums">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div>Deposits: <strong className="text-[#10b981]">+{formatMoney(reconcileAudit.totalDeposits)}</strong></div>
                      <div>Withdrawals: <strong className="text-[#f87171]">-{formatMoney(reconcileAudit.totalWithdrawals)}</strong></div>
                      <div>Wagered: <strong className="text-white">-{formatMoney(reconcileAudit.realWagered)}</strong></div>
                      <div>Payouts: <strong className="text-[#10b981]">+{formatMoney(reconcileAudit.realWonPayout)}</strong></div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#242830] pt-2">
                      <div>
                        Expected: <strong className="text-white">{formatMoney(reconcileAudit.calculatedBalance)}</strong> • Actual: <strong className="text-[#8e96a4]">{formatMoney(reconcileAudit.currentBalance)}</strong>
                        {reconcileAudit.discrepancy !== 0 && (
                          <span className="ml-2 font-bold text-[#fbbf24]">
                            (Diff: {reconcileAudit.discrepancy > 0 ? '+' : ''}{formatMoney(reconcileAudit.discrepancy)})
                          </span>
                        )}
                      </div>
                      {reconcileAudit.discrepancy !== 0 && (
                        <button
                          onClick={() => handleReconcileUser(selectedUserForDetail.user._id, true)}
                          disabled={isReconciling}
                          className="rounded bg-[#0da84b] px-3 py-1 text-xs font-bold text-white hover:bg-[#0b9240]"
                        >
                          Sync Accurate Balance
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Recent Bets */}
              <div>
                <h4 className="mb-1.5 text-xs font-bold uppercase text-[#8e96a4]">Recent Bets</h4>
                <div className="max-h-40 overflow-y-auto rounded border border-[#242830] bg-[#0d0f12]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#1c2028] text-[11px] font-bold text-[#8e96a4] sticky top-0">
                      <tr>
                        <th className="p-2">Stake</th>
                        <th className="p-2">Result</th>
                        <th className="p-2">Multiplier</th>
                        <th className="p-2">Payout</th>
                        <th className="p-2">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#22262e] tabular-nums">
                      {selectedUserForDetail.recentBets.length === 0 ? (
                        <tr><td colSpan={5} className="p-4 text-center text-[#6e7685]">No bets recorded</td></tr>
                      ) : (
                        selectedUserForDetail.recentBets.map(b => (
                          <tr key={b._id}>
                            <td className="p-2 font-bold text-white">KSH {b.amount}</td>
                            <td className="p-2">
                              <span className={b.status === 'won' ? 'font-bold text-[#10b981]' : 'text-[#f87171]'}>{b.status}</span>
                            </td>
                            <td className="p-2 text-[#c4c9d4]">{b.multiplierCaught ? `${b.multiplierCaught}x` : '—'}</td>
                            <td className="p-2 font-bold text-[#10b981]">KSH {b.winAmount || 0}</td>
                            <td className="p-2 text-[#8e96a4]">{formatDate(b.createdAt)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Recent Cashier Activity */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <h4 className="mb-1.5 text-xs font-bold uppercase text-[#8e96a4]">Recent Deposits</h4>
                  <div className="max-h-36 overflow-y-auto rounded border border-[#242830] bg-[#0d0f12] p-2 space-y-1.5 tabular-nums">
                    {selectedUserForDetail.recentDeposits.length === 0 ? (
                      <p className="py-4 text-center text-xs text-[#6e7685]">No deposits</p>
                    ) : (
                      selectedUserForDetail.recentDeposits.map(d => (
                        <div key={d._id} className="flex items-center justify-between rounded bg-[#16191f] px-2.5 py-1.5 text-xs">
                          <span className="font-bold text-[#10b981]">+KSH {d.amount}</span>
                          <span className="text-[11px] text-[#8e96a4]">{d.status} • {formatDate(d.createdAt)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="mb-1.5 text-xs font-bold uppercase text-[#8e96a4]">Recent Withdrawals</h4>
                  <div className="max-h-36 overflow-y-auto rounded border border-[#242830] bg-[#0d0f12] p-2 space-y-1.5 tabular-nums">
                    {selectedUserForDetail.recentWithdrawals.length === 0 ? (
                      <p className="py-4 text-center text-xs text-[#6e7685]">No withdrawals</p>
                    ) : (
                      selectedUserForDetail.recentWithdrawals.map(w => (
                        <div key={w._id} className="flex items-center justify-between rounded bg-[#16191f] px-2.5 py-1.5 text-xs">
                          <span className="font-bold text-[#f87171]">-KSH {w.amount}</span>
                          <span className="text-[11px] text-[#8e96a4]">{w.status} • {formatDate(w.createdAt)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}