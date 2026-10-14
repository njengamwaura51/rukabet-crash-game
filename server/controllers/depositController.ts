import { Response } from 'express'
import axios from 'axios'
import { AuthRequest } from '../middleware/auth.js'
import { Deposit } from '../models/Deposit.js'
import { Settings } from '../models/Settings.js'

function sanitizeKey(value?: string): string {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/^["']|["']$/g, '')
}

export function normalizeKenyanPhone(phone: string): string | null {
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
    const paydWalletUsername = sanitizeKey(settings?.paydWalletUsername) || sanitizeKey(process.env.PAYD_WALLET_USERNAME)
    const paydApiUsername = sanitizeKey(settings?.paydApiUsername) || sanitizeKey(process.env.PAYD_API_USERNAME)
    const paydApiPassword = sanitizeKey(settings?.paydApiPassword) || sanitizeKey(process.env.PAYD_API_PASSWORD)
    const paydApiBaseUrl = sanitizeKey(settings?.paydApiBaseUrl) || sanitizeKey(process.env.PAYD_API_BASE_URL) || 'https://api.mypayd.app/api/v2/payments'

    if (!paydWalletUsername || !paydApiUsername || !paydApiPassword) {
      console.error('❌ Payd gateway credentials missing in admin settings')
      return res.status(500).json({ 
        error: 'Payment gateway not configured. Please configure Payd credentials in Admin Dashboard > Gateway.' 
      })
    }

    // Determine callback URL
    const publicDomain = sanitizeKey(process.env.PUBLIC_APP_URL) || `${req.protocol}://${req.get('host')}`
    const callbackUrl = sanitizeKey(settings?.paydCallbackUrl) || sanitizeKey(process.env.PAYD_CALLBACK_URL) || `${publicDomain}/api/webhooks/payd`

    const internalRef = `DEP_${Date.now()}_${userId}`

    // Create pending deposit record first
    const deposit = await Deposit.create({
      userId,
      phone: cleanPhone,
      amount: depositAmount,
      apiRef: internalRef,
      status: 'pending'
    })
    depositId = deposit._id.toString()

    // Build HTTP Basic Auth header
    const basicAuth = Buffer.from(`${paydApiUsername}:${paydApiPassword}`).toString('base64')

    console.log(`📤 Sending Payd STK Push: amount=${depositAmount}, phone=${cleanPhone}, ref=${internalRef}`)

    // Call Payd Collections REST API
    const paydResponse = await axios.post(
      paydApiBaseUrl,
      {
        username: paydWalletUsername,
        network_code: '63902', // Safaricom M-Pesa Kenya
        amount: depositAmount,
        phone_number: cleanPhone,
        narration: `Deposit ${internalRef}`,
        currency: 'KES',
        callback_url: callbackUrl
      },
      {
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        timeout: 25000
      }
    )

    console.log('✅ Payd STK Push response:', paydResponse.data)

    const externalRef =
      paydResponse.data?.transaction_reference ||
      paydResponse.data?.correlator_id ||
      paydResponse.data?.reference ||
      paydResponse.data?.data?.transaction_reference ||
      paydResponse.data?.data?.reference ||
      null

    if (externalRef) {
      deposit.paydReference = String(externalRef)
      deposit.externalRef = String(externalRef)
      await deposit.save()
    }

    return res.json({
      success: true,
      message: 'STK Push sent to your phone. Please enter your M-Pesa PIN.',
      depositId: deposit._id,
      apiRef: internalRef,
      externalRef
    })
  } catch (error: any) {
    if (depositId) {
      const errMsg = error?.response?.data?.message || error?.response?.data?.error || error?.message || 'Deposit initiation failed'
      await Deposit.findByIdAndUpdate(
        depositId,
        { $set: { status: 'failed', failureReason: errMsg } },
        { new: false }
      ).catch((updateError) => {
        console.error('⚠️ Failed to mark deposit as failed:', updateError?.message || updateError)
      })
    }

    const paydStatus = error?.response?.status
    const paydData = error?.response?.data
    const paydMessage = paydData?.message || paydData?.error || error?.message || 'STK Push failed'
    const responseStatus = Number.isInteger(paydStatus) && paydStatus >= 400 && paydStatus < 600
      ? paydStatus
      : 500

    console.error('❌ Payd STK push failed:', {
      status: paydStatus ?? 'unknown',
      data: paydData ?? error?.message
    })

    return res.status(responseStatus).json({
      error: paydMessage,
      details: paydData
    })
  }
}
