import { Request, Response } from 'express'
import { SettingsModel } from '../models/Settings.js'

export function getSettings(req: Request, res: Response) {
  try {
    const settings = SettingsModel.get()
    if (!settings) return res.status(404).json({ error: 'Settings not found' })
    const { intasend_secret_key, ...publicSettings } = settings
    return res.json({ success: true, settings: publicSettings })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
}

export function updateSettings(req: Request, res: Response) {
  try {
    const { intasend_public_key, intasend_secret_key, company_name, whatsapp_support, min_deposit, min_withdrawal } = req.body
    const updates: any = {}
    if (intasend_public_key !== undefined) updates.intasend_public_key = intasend_public_key
    if (intasend_secret_key !== undefined) updates.intasend_secret_key = intasend_secret_key
    if (company_name !== undefined) updates.company_name = company_name
    if (whatsapp_support !== undefined) updates.whatsapp_support = whatsapp_support
    if (min_deposit !== undefined) updates.min_deposit = min_deposit
    if (min_withdrawal !== undefined) updates.min_withdrawal = min_withdrawal

    const settings = SettingsModel.update(updates)
    console.log('✅ Settings updated:', Object.keys(updates).join(', '))
    
    const { intasend_secret_key: _, ...publicSettings } = settings
    return res.json({ success: true, message: 'Settings updated', settings: publicSettings })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
}
