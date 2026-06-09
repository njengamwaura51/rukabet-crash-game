import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
function generateReferralCode() {
    const random = Math.random().toString(36).slice(2, 10).toUpperCase();
    const timestamp = Date.now().toString(36).slice(-4).toUpperCase();
    return `RB${timestamp}${random}`.slice(0, 12);
}
// Define the schema
const UserSchema = new mongoose.Schema({
    phone: {
        type: String,
        required: [true, 'Phone number is required'],
        unique: true,
        trim: true,
        index: true
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: 4
    },
    username: {
        type: String,
        required: true,
        trim: true,
        maxlength: 20
    },
    balance: {
        type: Number,
        default: 0,
        min: 0
    },
    freebet: {
        type: Number,
        default: 150
    },
    freebetLocked: {
        type: Boolean,
        default: true
    },
    hasPlayedWithMoney: {
        type: Boolean,
        default: false
    },
    referralCode: {
        type: String,
        unique: true,
        index: true,
        default: generateReferralCode
    },
    referredBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    hasReceivedReferralReward: {
        type: Boolean,
        default: false
    },
    referredUsers: [{
            userId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
                required: true
            },
            username: {
                type: String,
                required: true
            },
            depositAmount: {
                type: Number,
                default: 0,
                min: 0
            },
            rewardEarned: {
                type: Number,
                default: 0,
                min: 0
            },
            referredAt: {
                type: Date,
                default: Date.now
            }
        }]
}, {
    timestamps: true,
    methods: {
        comparePassword(candidatePassword) {
            return bcrypt.compareSync(candidatePassword, this.password);
        }
    }
});
// Hash password before saving - use function syntax for mongoose 9
UserSchema.pre('save', { document: true }, function () {
    if (this.isModified('password')) {
        this.password = bcrypt.hashSync(this.password, 10);
    }
});
export const User = mongoose.model('User', UserSchema);
