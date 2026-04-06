import { Request, Response } from 'express'
import axios from 'axios'
import { SettingsModel } from '../models/Settings.js'
import { DepositModel } from '../models/Deposit.js'

export async function initiateDeposit(req: Request, res: Response) {
  try {
    const { amount, phone } = req.body
    const userId = (req as any).userId
    if (!amount || !phone) return res.status(400).json({ success: false, error: 'Amount and phone required' })
    if (amount < 10) return res.status(400).json({ success: false, error: 'Minimum deposit is KSH 10' })
    
    let normalizedPhone = phone.replace(/\s+/g, '')
    if (normalizedPhone.startsWith('0')) normalizedPhone = '254' + normalizedPhone.slice(1)
    else if (normalizedPhone.startsWith('7') || normalizedPhone.startsWith('1')) normalizedPhone = '254' + normalizedPhone
    else if (!normalizedPhone.startsWith('254')) return res.status(400).json({ success: false, error: 'Invalid phone' })

    const config = SettingsModel.getIntaSendConfig()
    if (!config) return res.status(500).json({ success: false, error: 'Payment gateway not configured' })

    const apiRef = `${normalizedPhone}-RUKABET`
    const deposit = DepositModel.create(userId, normalizedPhone, amount, apiRef)

    console.log('🔄 IntaSend STK Push:', { apiRef, amount })
    
    const response = await axios.post('https://sandbox.intasend.com/api/v1/payment/mpesa-stk-push/', {
      public_key: config.publicKey,
      amount: amount,
      phone_number: normalizedPhone,
      api_ref: apiRef
    }, {
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.secretKey}` }
    })

    if (response.data?.invoice) {
      DepositModel.updateStatus(deposit.id, 'pending' as any, response.data.invoice.invoice_id, response.data.id)
      return res.json({ success: true, message: 'STK Push sent! Check your phone', invoice_id: response.data.invoice.invoice_id, api_ref: apiRef })
    } else {
      throw new Error('Invalid IntaSend response')
    }
  } catch (error: any) {
    console.error('❌ Deposit error:', error.response?.data || error.message)
    return res.status(500).json({ success: false, error: error.response?.data?.detail || error.message })
  }
}
