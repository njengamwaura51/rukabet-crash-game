import mongoose, { Schema, Document } from 'mongoose'

export interface IDeposit extends Document {
  _id: mongoose.Types.ObjectId
  userId: mongoose.Types.ObjectId
  phone: string
  amount: number
  apiRef: string
  status: 'pending' | 'completed' | 'failed'
  credited: boolean
  creditedAt?: Date | null
  paydReference?: string | null
  externalRef?: string | null
  mpesaReceipt?: string | null
  submittedReceipt?: string | null
  failureReason?: string | null
  intasendInvoiceId?: string | null
  intasendTrackerId?: string | null
  rawWebhookPayload?: any
  createdAt: Date
  updatedAt: Date
}

const DepositSchema = new Schema<IDeposit>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  phone: {
    type: String,
    required: true,
    index: true
  },
  amount: {
    type: Number,
    required: true,
    min: 1
  },
  apiRef: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'pending',
    index: true
  },
  credited: {
    type: Boolean,
    default: false,
    index: true
  },
  creditedAt: {
    type: Date,
    default: null
  },
  paydReference: {
    type: String,
    default: null,
    index: true
  },
  externalRef: {
    type: String,
    default: null,
    index: true
  },
  mpesaReceipt: {
    type: String,
    default: null,
    index: true
  },
  submittedReceipt: {
    type: String,
    default: null,
    index: true
  },
  failureReason: {
    type: String,
    default: null
  },
  intasendInvoiceId: {
    type: String,
    default: null,
    index: true
  },
  intasendTrackerId: {
    type: String,
    default: null,
    index: true
  },
  rawWebhookPayload: {
    type: Schema.Types.Mixed,
    default: null
  }
}, {
  timestamps: true
})

DepositSchema.index({ userId: 1, createdAt: -1 })
DepositSchema.index({ phone: 1, amount: 1, status: 1, createdAt: -1 })

export const Deposit = mongoose.model<IDeposit>('Deposit', DepositSchema)
