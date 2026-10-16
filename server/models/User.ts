import mongoose, { HydratedDocument } from 'mongoose'
import bcrypt from 'bcryptjs'

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
  referralsCount: {
    type: Number,
    default: 0
  },
  referralsEarnings: {
    type: Number,
    default: 0
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
  wagerProgress: {
    type: Number,
    default: 0
  },
  wagerRequired: {
    type: Number,
    default: 0
  },
  isFrozen: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  methods: {
    comparePassword(candidatePassword: string): boolean {
      return bcrypt.compareSync(candidatePassword, this.password)
    }
  }
})

// Hash password before saving - use function syntax for mongoose 9
UserSchema.pre('save', { document: true }, function() {
  if (this.isModified('password')) {
    this.password = bcrypt.hashSync(this.password, 10)
  }
})

export const User = mongoose.model('User', UserSchema)
export type UserDocument = HydratedDocument<mongoose.InferSchemaType<typeof UserSchema>>
