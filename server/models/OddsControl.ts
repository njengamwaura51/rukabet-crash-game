import mongoose, { Schema, Document } from 'mongoose'

export interface IOddsAuditLog {
  activatedAt: Date
  expiredAt?: Date
  mode: string
  minMultiplier: number
  maxMultiplier?: number
  durationType: string
  durationMinutes?: number
  roundsTotal?: number
  activatedBy: string
  reason?: string
}

export interface IOddsControl extends Document {
  _id: mongoose.Types.ObjectId
  enabled: boolean
  mode: 'normal' | 'range' | 'min_multiplier' | 'exact'
  minMultiplier: number
  maxMultiplier: number
  exactMultiplier?: number
  durationType: 'minutes' | 'rounds' | 'scheduled_window' | 'indefinite'
  durationMinutes: number
  roundsTotal: number
  roundsRemaining: number
  scheduledStartTime?: Date
  scheduledEndTime?: Date
  startedAt?: Date
  expiresAt?: Date
  lastActivatedBy: string
  note?: string
  auditLogs: IOddsAuditLog[]
  updatedAt: Date
  createdAt: Date
}

export interface IOddsControlModel extends mongoose.Model<IOddsControl> {
  getOddsControl(): Promise<IOddsControl>
}

const OddsAuditLogSchema = new Schema<IOddsAuditLog>({
  activatedAt: { type: Date, default: Date.now },
  expiredAt: { type: Date },
  mode: { type: String, default: 'range' },
  minMultiplier: { type: Number, default: 2.0 },
  maxMultiplier: { type: Number, default: 5.0 },
  durationType: { type: String, default: 'minutes' },
  durationMinutes: { type: Number },
  roundsTotal: { type: Number },
  activatedBy: { type: String, default: 'admin' },
  reason: { type: String }
}, { _id: false })

const OddsControlSchema = new Schema<IOddsControl>({
  enabled: {
    type: Boolean,
    default: false
  },
  mode: {
    type: String,
    enum: ['normal', 'range', 'min_multiplier', 'exact'],
    default: 'normal'
  },
  minMultiplier: {
    type: Number,
    default: 2.0
  },
  maxMultiplier: {
    type: Number,
    default: 5.0
  },
  exactMultiplier: {
    type: Number
  },
  durationType: {
    type: String,
    enum: ['minutes', 'rounds', 'scheduled_window', 'indefinite'],
    default: 'minutes'
  },
  durationMinutes: {
    type: Number,
    default: 15
  },
  roundsTotal: {
    type: Number,
    default: 10
  },
  roundsRemaining: {
    type: Number,
    default: 10
  },
  scheduledStartTime: {
    type: Date
  },
  scheduledEndTime: {
    type: Date
  },
  startedAt: {
    type: Date
  },
  expiresAt: {
    type: Date
  },
  lastActivatedBy: {
    type: String,
    default: 'admin'
  },
  note: {
    type: String,
    default: ''
  },
  auditLogs: {
    type: [OddsAuditLogSchema],
    default: []
  }
}, {
  timestamps: true
})

// Singleton pattern for OddsControl
OddsControlSchema.statics.getOddsControl = async function() {
  let doc = await this.findOne()
  if (!doc) {
    doc = await this.create({
      enabled: false,
      mode: 'normal',
      minMultiplier: 2.0,
      maxMultiplier: 5.0,
      durationType: 'minutes',
      durationMinutes: 15,
      roundsTotal: 10,
      roundsRemaining: 10
    })
  }
  return doc
}

export const OddsControl = mongoose.model<IOddsControl, IOddsControlModel>('OddsControl', OddsControlSchema)
