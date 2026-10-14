import mongoose, { Schema, Document } from 'mongoose'

export interface ISettings extends Document {
  _id: mongoose.Types.ObjectId
  paydWalletUsername: string
  paydApiUsername: string
  paydApiPassword: string
  paydApiBaseUrl: string
  paydCallbackUrl: string
  intasendPublicKey?: string
  intasendSecretKey?: string
  companyName: string
  whatsappSupport: string
  minDeposit: number
  minWithdrawal: number
  adminToken: string
  jwtSecret: string
  updatedAt: Date
}

const SettingsSchema = new Schema<ISettings>({
  paydWalletUsername: {
    type: String,
    default: ''
  },
  paydApiUsername: {
    type: String,
    default: ''
  },
  paydApiPassword: {
    type: String,
    default: ''
  },
  paydApiBaseUrl: {
    type: String,
    default: 'https://api.mypayd.app/api/v2/payments'
  },
  paydCallbackUrl: {
    type: String,
    default: ''
  },
  intasendPublicKey: {
    type: String,
    default: ''
  },
  intasendSecretKey: {
    type: String,
    default: ''
  },
  companyName: {
    type: String,
    default: 'RUKA TECH SOLUTIONS'
  },
  whatsappSupport: {
    type: String,
    default: '254712345678'
  },
  minDeposit: {
    type: Number,
    default: 10
  },
  minWithdrawal: {
    type: Number,
    default: 50
  },
  adminToken: {
    type: String,
    default: ''
  },
  jwtSecret: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
})

// Singleton pattern - only one settings document
SettingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne()
  if (!settings) {
    settings = await this.create({
      adminToken: process.env.ADMIN_TOKEN || 'rukabet-admin-2026',
      jwtSecret: process.env.JWT_SECRET || 'rukabet-jwt-secret-2026'
    })
  }
  return settings
}

export const Settings = mongoose.model<ISettings>('Settings', SettingsSchema)
