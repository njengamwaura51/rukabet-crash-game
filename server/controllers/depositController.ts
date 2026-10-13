import { Response } from 'express'
import axios from 'axios'
import { AuthRequest } from '../middleware/auth.js'
import { Deposit } from '../models/Deposit.js'
import { Settings } from '../models/Settings.js'

const MIN_DEPOSIT = 10

function getIntaSendUrl(secretKey: string): string {
  if (secretKey.includes('_test_')) {
    return 'https://sandbox.intasend.com/api/v1/payment/mpesa-stk-push/'
  }
  return 'https://api.intasend.com/api/v1/payment/mpesa-stk-push/'
}

function sanitizeKey(value?: string): string {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/^["']|["']$/g, '')
}

export async function initiateDeposit(req: AuthRequest, res: Response) {
  let depositId: string | null = null

  try {
    const { amount, phone } = req.body
    const userId = req.userId!
    const normalizedInputPhone = typeof phone === 'string' ? phone.replace(/\D/g, '') : ''
    const accountPhone = typeof req.user?.phone === 'string' ? req.user.phone.replace(/\D/g, '') : ''
    const resolvedPhone = normalizedInputPhone || accountPhone
    const depositAmount = Number(amount)

    if (!Number.isFinite(depositAmount) || depositAmount < MIN_DEPOSIT) {
      return res.status(400).json({ error: 'Minimum deposit is KSH 10' })
    }

    if (!/^[17]\d{8}$/.test(resolvedPhone)) {
      return res.status(400).json({ error: 'Invalid phone number' })
    }

    // Get IntaSend config from admin database settings first, falling back to env if not set
    const settings = await Settings.findOne()
    const intasendPublicKey = sanitizeKey(settings?.intasendPublicKey) || sanitizeKey(process.env.INTASEND_PUBLIC_KEY)
    const intasendSecretKey = sanitizeKey(settings?.intasendSecretKey) || sanitizeKey(process.env.INTASEND_SECRET_KEY)

    if (!intasendPublicKey || !intasendSecretKey) {
      return res.status(500).json({ error: 'Payment gateway not configured' })
    }

    const normalizedPhone = `254${resolvedPhone}`
    const apiRef = `${resolvedPhone}-RUKABET-${Date.now()}`

    // Create pending deposit record
    const deposit = await Deposit.create({
      userId,
      phone: normalizedPhone,
      amount: depositAmount,
      apiRef,
      status: 'pending'
    })
    depositId = deposit._id.toString()

    // Call IntaSend STK Push API
    const intasendUrl = getIntaSendUrl(intasendSecretKey)
    const response = await axios.post(intasendUrl, {
      amount: depositAmount,
      phone_number: normalizedPhone,
      api_ref: apiRef
    }, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + intasendSecretKey
      }
    })

    console.log('✅ IntaSend STK Push sent:', response.data)

    // Update deposit with IntaSend invoice ID
    if (response.data.invoice?.invoice_id) {
      deposit.intasendInvoiceId = response.data.invoice.invoice_id
      await deposit.save()
    }

    return res.json({
      success: true,
      message: 'STK Push sent. Check your phone.',
      depositId: deposit._id,
      apiRef
    })
  } catch (error: any) {
    if (depositId) {
      await Deposit.findByIdAndUpdate(
        depositId,
        { $set: { status: 'failed' } },
        { new: false }
      ).catch((updateError) => {
        console.error('⚠️ Failed to mark deposit as failed:', updateError?.message || updateError)
      })
    }

    const intasendStatus = error?.response?.status
    const intasendCode = error?.response?.data?.code || error?.code
    const intasendMessage = error?.response?.data?.message || error?.message || 'Deposit failed'
    const intasendDetails = error?.response?.data?.detail || error?.response?.data?.errors
    const responseStatus = Number.isInteger(intasendStatus) && intasendStatus >= 400 && intasendStatus < 600
      ? intasendStatus
      : 500

    console.error('❌ IntaSend STK push failed:', {
      status: intasendStatus ?? 'unknown',
      code: intasendCode ?? 'unknown',
      message: intasendMessage
    })

    return res.status(responseStatus).json({
      error: intasendMessage,
      code: intasendCode,
      details: intasendDetails
    })
  }
}
