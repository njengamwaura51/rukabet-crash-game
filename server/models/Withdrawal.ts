import mongoose, { Schema, Document } from 'mongoose'

export interface IWithdrawal extends Document {
  userId: mongoose.Types.ObjectId
  phone: string
  amount: number
  status: 'pending' | 'completed' | 'failed'
  createdAt: Date
  updatedAt: Date
}

const WithdrawalSchema = new Schema<IWithdrawal>({
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
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'pending'
  }
}, {
  timestamps: true
})

WithdrawalSchema.index({ userId: 1, createdAt: -1 })

export const Withdrawal = mongoose.model<IWithdrawal>('Withdrawal', WithdrawalSchema)
