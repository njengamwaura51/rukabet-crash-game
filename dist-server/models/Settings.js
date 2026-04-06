import mongoose, { Schema } from 'mongoose';
const SettingsSchema = new Schema({
    intasendPublicKey: {
        type: String,
        default: ''
    },
    intasendSecretKey: {
        type: String,
        default: ''
    },
    companyName: {
        type: String,
        default: 'RUKA TECH SOLUTIONS'
    },
    whatsappSupport: {
        type: String,
        default: '254712345678'
    },
    minDeposit: {
        type: Number,
        default: 10
    },
    minWithdrawal: {
        type: Number,
        default: 50
    },
    adminToken: {
        type: String,
        default: ''
    },
    jwtSecret: {
        type: String,
        default: ''
    }
}, {
    timestamps: true
});
// Singleton pattern - only one settings document
SettingsSchema.statics.getSettings = async function () {
    let settings = await this.findOne();
    if (!settings) {
        settings = await this.create({
            adminToken: process.env.ADMIN_TOKEN || 'rukabet-admin-2026',
            jwtSecret: process.env.JWT_SECRET || 'rukabet-jwt-secret-2026'
        });
    }
    return settings;
};
export const Settings = mongoose.model('Settings', SettingsSchema);
