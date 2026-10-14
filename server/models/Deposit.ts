import mongoose, { Schema, Document } from 'mongoose'

export interface IDeposit extends Document {
  _id: mongoose.Types.ObjectId
  userId: mongoose.Types.ObjectId
  phone: string
  amount: number
  apiRef: string
  status: 'pending' | 'completed' | 'failed'
  paydReference?: string | null
  externalRef?: string | null
  mpesaReceipt?: string | null
  failureReason?: string | null
  intasendInvoiceId?: string | null
  intasendTrackerId?: string | null
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
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 10
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
    default: 'pending'
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
    default: null
  },
  failureReason: {
    type: String,
    default: null
  },
  intasendInvoiceId: {
    type: String,
    default: null
  },
  intasendTrackerId: {
    type: String,
    default: null
  }
}, {
  timestamps: true
})

export const Deposit = mongoose.model<IDeposit>('Deposit', DepositSchema)
