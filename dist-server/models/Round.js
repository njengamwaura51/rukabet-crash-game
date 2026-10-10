import mongoose, { Schema } from 'mongoose';
const RoundSchema = new Schema({
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
});
RoundSchema.index({ createdAt: -1 });
export const Round = mongoose.model('Round', RoundSchema);
