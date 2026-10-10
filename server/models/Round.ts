import mongoose, { Schema, Document } from 'mongoose'

export interface IRound extends Document {
  roundId: string
  crashPoint: number
  createdAt: Date
}

const RoundSchema = new Schema<IRound>({
  roundId: {
    type: String,
    required: true,
    unique: true
  },
  crashPoint: {
    type: Number,
    required: true
  }
}, {
  timestamps: true
})

RoundSchema.index({ createdAt: -1 })

export const Round = mongoose.model<IRound>('Round', RoundSchema)
