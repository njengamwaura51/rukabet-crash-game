import { Request, Response } from 'express'
import { Settings } from '../models/Settings.js'

export async function getPublicConfig(req: Request, res: Response) {
  try {
    const settings = await Settings.findOne()
    return res.json({
      success: true,
      config: {
        whatsappSupportNumber: settings?.whatsappSupport || '254712345678',
      },
    })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
}

function sanitizeKey(value?: string): string {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/^["']|["']$/g, '')
}

export async function getSettings(req: Request, res: Response) {
  try {
    let settings = await Settings.findOne()
    
    if (!settings) {
      settings = await Settings.create({
        adminToken: process.env.ADMIN_TOKEN || '117402',
        jwtSecret: process.env.JWT_SECRET || 'rukabet-jwt-secret-2026',
        paydApiBaseUrl: 'https://api.mypayd.app/api/v2/payments'
      })
    }

    const hasPassword = Boolean(settings.paydApiPassword)
    const hasSecret = Boolean(settings.paydApiSecret)

    return res.json({
      success: true,
      settings: {
        paydWalletUsername: settings.paydWalletUsername || '',
        paydApiUsername: settings.paydApiUsername || '',
        paydApiBaseUrl: (settings.paydApiBaseUrl || 'https://api.payd.money/api/v2/payments').replace('api.mypayd.app', 'api.payd.money').replace('mypayd.app', 'payd.money'),
        paydCallbackUrl: settings.paydCallbackUrl || '',
        isPasswordConfigured: hasPassword,
        isSecretConfigured: hasSecret,
        isManagedViaAdmin: Boolean(settings.paydWalletUsername || settings.paydApiUsername || settings.paydApiSecret),
        companyName: settings.companyName,
        whatsappSupport: settings.whatsappSupport,
        minDeposit: settings.minDeposit,
        minWithdrawal: settings.minWithdrawal,
        updatedAt: settings.updatedAt,
        // Legacy compatibility
        intasendPublicKey: ''
      }
    })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
}

export async function updateSettings(req: Request, res: Response) {
  try {
    const updates = req.body
    
    // Sanitize - only allow specific fields to be updated
    const allowedFields = [
      'paydWalletUsername',
      'paydApiUsername',
      'paydApiPassword',
      'paydApiSecret',
      'paydApiBaseUrl',
      'paydCallbackUrl',
      'companyName',
      'whatsappSupport',
      'minDeposit',
      'minWithdrawal'
    ]

    const sanitizedUpdates: any = {}
    for (const key of allowedFields) {
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase()
      const val = updates[key] !== undefined ? updates[key] : updates[snakeKey]
      
      if (val !== undefined) {
        // If updating password or secret, set if valid new secret/password, or clear if explicitly empty
        if (key === 'paydApiPassword' || key === 'paydApiSecret') {
          if (val === '' || val === null) {
            sanitizedUpdates[key] = ''
          } else if (typeof val === 'string' && val.trim().length > 0 && !val.includes('•') && !val.includes('*')) {
            sanitizedUpdates[key] = sanitizeKey(val)
          }
        } else {
          sanitizedUpdates[key] = typeof val === 'string' ? sanitizeKey(val) : val
        }
      }
    }

    const settings = await Settings.findOneAndUpdate(
      {},
      { $set: sanitizedUpdates },
      { new: true, upsert: true }
    )

    const hasPassword = Boolean(settings.paydApiPassword)
    const hasSecret = Boolean(settings.paydApiSecret)

    return res.json({
      success: true,
      message: 'Settings updated successfully',
      settings: {
        paydWalletUsername: settings.paydWalletUsername || '',
        paydApiUsername: settings.paydApiUsername || '',
        paydApiBaseUrl: (settings.paydApiBaseUrl || 'https://api.payd.money/api/v2/payments').replace('api.mypayd.app', 'api.payd.money').replace('mypayd.app', 'payd.money'),
        paydCallbackUrl: settings.paydCallbackUrl || '',
        isPasswordConfigured: hasPassword,
        isSecretConfigured: hasSecret,
        isManagedViaAdmin: true,
        companyName: settings.companyName,
        whatsappSupport: settings.whatsappSupport,
        minDeposit: settings.minDeposit,
        minWithdrawal: settings.minWithdrawal,
        updatedAt: settings.updatedAt
      }
    })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
}
