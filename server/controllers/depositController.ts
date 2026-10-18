import { Response } from 'express'
import axios from 'axios'
import mongoose from 'mongoose'
import { AuthRequest } from '../middleware/auth.js'
import { Deposit } from '../models/Deposit.js'
import { User } from '../models/User.js'
import { Settings } from '../models/Settings.js'
import { creditDepositAtomically } from './webhookController.js'

function sanitizeKey(value?: string): string {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/^["']|["']$/g, '')
}

export function normalizeKenyanPhone(phone: string): string | null {
  if (!phone || typeof phone !== 'string') return null
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('254') && digits.length === 12 && /^254[17]\d{8}$/.test(digits)) {
    return digits
  }
  if (digits.startsWith('0') && digits.length === 10 && /^0[17]\d{8}$/.test(digits)) {
    return `254${digits.slice(1)}`
  }
  if (digits.length === 9 && /^[17]\d{8}$/.test(digits)) {
    return `254${digits}`
  }
  return null
}

export async function initiateDeposit(req: AuthRequest, res: Response) {
  let depositId: string | null = null

  try {
    const { amount, phone } = req.body
    const userId = req.userId!
    const rawPhone = (typeof phone === 'string' && phone.trim()) ? phone.trim() : (req.user?.phone || '')
    const cleanPhone = normalizeKenyanPhone(rawPhone)
    const depositAmount = Number(amount)

    const settings = await (Settings as any).getSettings()
    const minDeposit = settings?.minDeposit || 10

    if (!Number.isFinite(depositAmount) || depositAmount < minDeposit) {
      return res.status(400).json({ error: `Minimum deposit is KSH ${minDeposit}` })
    }

    if (!cleanPhone) {
      return res.status(400).json({ error: 'Invalid Kenyan phone number. Use 07XXXXXXXX or 01XXXXXXXX.' })
    }

    // Payd credentials from database Settings (single source of truth) with optional env fallback
    const paydWalletUsername = sanitizeKey(settings?.paydWalletUsername) || sanitizeKey(settings?.paydApiUsername) || sanitizeKey(process.env.PAYD_WALLET_USERNAME)
    const paydApiUsername = sanitizeKey(settings?.paydApiUsername) || sanitizeKey(process.env.PAYD_API_USERNAME)
    const paydApiPassword = sanitizeKey(settings?.paydApiPassword) || sanitizeKey(process.env.PAYD_API_PASSWORD)
    const paydApiSecret = sanitizeKey(settings?.paydApiSecret) || sanitizeKey(process.env.PAYD_API_SECRET)
    let paydApiBaseUrl = sanitizeKey(settings?.paydApiBaseUrl) || sanitizeKey(process.env.PAYD_API_BASE_URL) || 'https://api.payd.money/api/v2/payments'
    if (paydApiBaseUrl.includes('mypayd.app')) {
      paydApiBaseUrl = paydApiBaseUrl.replace(/api\.mypayd\.app/g, 'api.payd.money').replace(/mypayd\.app/g, 'payd.money')
    }

    if (!paydApiUsername || (!paydApiPassword && !paydApiSecret)) {
      console.error('❌ Payd gateway credentials missing in admin settings')
      return res.status(500).json({ 
        error: 'Payment gateway not configured. Please configure Payd credentials (API Username, Password, and API Secret) in Admin Dashboard > Gateway.' 
      })
    }

    // Determine callback URL (sent dynamically in every STK push payload)
    const publicDomain = sanitizeKey(process.env.PUBLIC_APP_URL) || `${req.protocol}://${req.get('host')}`
    const callbackUrl = sanitizeKey(settings?.paydCallbackUrl) || sanitizeKey(process.env.PAYD_CALLBACK_URL) || `${publicDomain}/api/webhooks/payd`

    const internalRef = `DEP_${Date.now()}_${userId}`

    // Create pending deposit record first
    const deposit = await Deposit.create({
      userId,
      phone: cleanPhone,
      amount: depositAmount,
      apiRef: internalRef,
      status: 'pending',
      credited: false
    })
    depositId = deposit._id.toString()

    const requestBody: any = {
      phone_number: cleanPhone,
      amount: depositAmount,
      narration: `Deposit ${internalRef}`,
      api_ref: internalRef,
      currency: 'KES',
      network_code: '63902', // Safaricom M-Pesa Kenya
      callback_url: callbackUrl
    }

    if (paydWalletUsername) {
      requestBody.username = paydWalletUsername
    }

    // Build HTTP Basic Auth header (Username : Password or Secret)
    const authCredential = paydApiPassword || paydApiSecret
    const basicAuth = Buffer.from(`${paydApiUsername}:${authCredential}`).toString('base64')

    const requestHeaders: any = {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    }

    if (paydApiSecret) {
      requestHeaders['Api-Secret'] = paydApiSecret
      requestHeaders['x-api-secret'] = paydApiSecret
      requestHeaders['x-api-key'] = paydApiSecret
      requestBody.api_secret = paydApiSecret
    }

    console.log(`📤 Sending Payd STK Push: amount=${depositAmount}, phone=${cleanPhone}, ref=${internalRef}`)

    // Call Payd Collections REST API
    const paydResponse = await axios.post(
      paydApiBaseUrl,
      requestBody,
      {
        headers: requestHeaders,
        timeout: 25000
      }
    )

    console.log('✅ Payd STK Push response:', paydResponse.data)

    const resData = paydResponse.data || {}
    const externalRef =
      resData.transaction_reference ||
      resData.correlator_id ||
      resData.reference ||
      resData.id ||
      resData.data?.transaction_reference ||
      resData.data?.correlator_id ||
      resData.data?.reference ||
      null

    if (externalRef) {
      deposit.paydReference = String(externalRef)
      deposit.externalRef = String(externalRef)
      await deposit.save()
    }

    return res.json({
      success: true,
      message: 'STK Push sent to your phone. Please enter your M-Pesa PIN.',
      depositId,
      apiRef: internalRef,
      externalRef
    })
  } catch (error: any) {
    const isTimeout = error?.code === 'ECONNABORTED' || String(error?.message || '').toLowerCase().includes('timeout')
    if (depositId) {
      const errMsg = error?.response?.data?.message || error?.response?.data?.error || error?.message || 'Deposit initiation failed'
      // If gateway timed out, leave pending so M-Pesa callback can still settle it
      await Deposit.findOneAndUpdate(
        { _id: depositId, credited: { $ne: true } },
        {
          $set: {
            status: isTimeout ? 'pending' : 'failed',
            failureReason: isTimeout ? 'Gateway response timed out; awaiting M-Pesa callback' : errMsg
          }
        }
      ).catch((updateError) => {
        console.error('⚠️ Failed to update deposit on initiation failure:', updateError?.message || updateError)
      })
    }

    const paydStatus = error?.response?.status
    const paydData = error?.response?.data
    const paydMessage = paydData?.message || paydData?.error || error?.message || 'STK Push failed'
    // Ensure gateway errors never return 401 (401 is reserved exclusively for user authentication token failure)
    const responseStatus = Number.isInteger(paydStatus) && paydStatus >= 400 && paydStatus < 600
      ? (paydStatus === 401 ? 502 : paydStatus)
      : 500

    console.error('❌ Payd STK push failed:', {
      status: paydStatus ?? 'unknown',
      data: paydData ?? error?.message
    })

    return res.status(responseStatus).json({
      error: paydMessage,
      details: paydData,
      depositId
    })
  }
}

export async function getDepositStatus(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params
    const userId = req.userId
    if (!userId) return res.status(401).json({ error: 'Authentication required' })

    const query: any = { userId }
    if (typeof id === 'string' && mongoose.Types.ObjectId.isValid(id)) {
      query._id = id
    } else {
      query.apiRef = id
    }

    const deposit = await Deposit.findOne(query).lean()
    if (!deposit) return res.status(404).json({ error: 'Deposit not found' })

    const user = await User.findById(userId).select('balance freebet freebetLocked').lean()

    return res.json({
      success: true,
      deposit: {
        id: deposit._id.toString(),
        apiRef: deposit.apiRef,
        amount: deposit.amount,
        status: deposit.status,
        credited: deposit.credited,
        mpesaReceipt: deposit.mpesaReceipt || deposit.submittedReceipt || null,
        failureReason: deposit.failureReason || null,
        createdAt: deposit.createdAt
      },
      balance: user?.balance ?? 0,
      freebet: user?.freebet ?? 0,
      freebetLocked: user?.freebetLocked ?? true
    })
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to check deposit status' })
  }
}

export async function verifyPendingDeposit(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId
    if (!userId) return res.status(401).json({ error: 'Authentication required' })

    const { code } = req.body
    const rawText = typeof code === 'string' ? code.trim() : ''
    if (!rawText) {
      return res.status(400).json({ error: 'Please enter a valid M-Pesa transaction code or message' })
    }

    // Extract M-Pesa receipt code if the user pasted the full M-Pesa SMS or just the 10-character code
    const receiptMatch = rawText.toUpperCase().match(/\b([A-Z0-9]{10})\b/)
    const cleanCode = (receiptMatch ? receiptMatch[1] : rawText.toUpperCase().split(/\s+/)[0]).trim()

    if (cleanCode.length < 6) {
      return res.status(400).json({ error: 'Please enter a valid M-Pesa code (e.g. TCQ74RQ4JH)' })
    }

    // 1. Check if a deposit already exists with this receipt or reference
    const matchedDeposit = await Deposit.findOne({
      $or: [
        { mpesaReceipt: cleanCode },
        { submittedReceipt: cleanCode },
        { externalRef: cleanCode },
        { paydReference: cleanCode },
        { apiRef: cleanCode }
      ]
    })

    if (matchedDeposit) {
      if (matchedDeposit.userId.toString() !== userId.toString()) {
        return res.status(403).json({ error: 'This transaction code belongs to another account.' })
      }

      if (matchedDeposit.status === 'completed' && !matchedDeposit.credited) {
        const { user } = await creditDepositAtomically(matchedDeposit._id, { mpesaReceipt: cleanCode })
        return res.json({
          success: true,
          status: 'completed',
          amount: matchedDeposit.amount,
          newBalance: user?.balance,
          message: `Transaction ${cleanCode} verified and KSH ${matchedDeposit.amount} credited to your wallet!`
        })
      }

      if (matchedDeposit.status === 'completed' && matchedDeposit.credited) {
        const user = await User.findById(userId).select('balance freebet freebetLocked').lean()
        return res.json({
          success: true,
          status: 'completed',
          amount: matchedDeposit.amount,
          newBalance: user?.balance,
          message: `Transaction ${cleanCode} (KSH ${matchedDeposit.amount}) is already credited to your balance.`
        })
      }
    }

    // 2. Attach the submitted M-Pesa receipt to the user's most recent uncredited deposit
    const latestPending = await Deposit.findOneAndUpdate(
      { userId, credited: { $ne: true } },
      {
        $set: {
          submittedReceipt: cleanCode,
          status: 'pending'
        }
      },
      { sort: { createdAt: -1 }, new: true }
    )

    return res.json({
      success: true,
      status: 'pending',
      depositId: latestPending?._id || null,
      apiRef: latestPending?.apiRef || null,
      message: `M-Pesa code ${cleanCode} attached to your deposit for verification. Your balance will update automatically once confirmed.`
    })
  } catch (error: any) {
    console.error('Verify deposit error:', error)
    return res.status(500).json({ error: 'Failed to verify transaction. Please contact support via WhatsApp.' })
  }
}
