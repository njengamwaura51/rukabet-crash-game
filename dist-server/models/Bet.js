import mongoose, { Schema } from 'mongoose';
const BetSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    roundId: {
        type: String,
        required: true,
        index: true
    },
    amount: {
        type: Number,
        required: true,
        min: 1
    },
    multiplierCaught: {
        type: Number,
        default: null
    },
    status: {
        type: String,
        enum: ['pending', 'active', 'won', 'lost', 'cancelled'],
        default: 'pending'
    },
    winAmount: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});
// Index for querying user bet history
BetSchema.index({ userId: 1, createdAt: -1 });
// Index for round queries
BetSchema.index({ roundId: 1, status: 1 });
export const Bet = mongoose.model('Bet', BetSchema);
