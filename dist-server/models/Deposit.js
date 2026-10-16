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
});
DepositSchema.index({ userId: 1, createdAt: -1 });
DepositSchema.index({ phone: 1, amount: 1, status: 1, createdAt: -1 });
export const Deposit = mongoose.model('Deposit', DepositSchema);
