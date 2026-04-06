import mongoose, { Schema } from 'mongoose';
const DepositSchema = new Schema({
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
});
export const Deposit = mongoose.model('Deposit', DepositSchema);
