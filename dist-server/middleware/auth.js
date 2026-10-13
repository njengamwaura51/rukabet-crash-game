import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { User } from '../models/User.js';
import { Settings } from '../models/Settings.js';
const JWT_SECRET = process.env.JWT_SECRET || 'rukabet-jwt-secret-2026';
function safeCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') {
        return false;
    }
    const aBuffer = Buffer.from(a);
    const bBuffer = Buffer.from(b);
    if (aBuffer.length !== bBuffer.length) {
        return false;
    }
    return crypto.timingSafeEqual(aBuffer, bBuffer);
}
export async function authMiddleware(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.userId);
        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }
        req.user = user;
        req.userId = decoded.userId;
        next();
    }
    catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
    }
}
export async function adminMiddleware(req, res, next) {
    try {
        const authorizationHeader = req.headers.authorization;
        const adminToken = req.headers['x-admin-token'] || (authorizationHeader?.startsWith('Bearer ') ? authorizationHeader.slice(7) : '');
        const adminUsername = req.headers['x-admin-username'];
        const adminPassword = req.headers['x-admin-password'];
        const settings = await Settings.findOne();
        const validToken = process.env.ADMIN_TOKEN || settings?.adminToken || '117402';
        const validAdminUsername = process.env.ADMIN_USERNAME || 'pirate101';
        const validAdminPassword = process.env.ADMIN_PASSWORD || '117402';
        // 1. Check if Bearer token is a signed admin JWT
        if (adminToken) {
            try {
                const decoded = jwt.verify(adminToken, JWT_SECRET);
                if (decoded?.role === 'admin') {
                    return next();
                }
            }
            catch {
                // Not a JWT, check as raw token string below
            }
            // Check if token matches raw ADMIN_TOKEN
            if (safeCompare(adminToken, validToken)) {
                return next();
            }
        }
        // 2. Check Basic Auth or custom headers
        const basicAuthEncoded = authorizationHeader?.startsWith('Basic ') ? authorizationHeader.slice(6) : '';
        const basicAuthDecoded = basicAuthEncoded ? Buffer.from(basicAuthEncoded, 'base64').toString('utf8') : '';
        const separatorIndex = basicAuthDecoded.indexOf(':');
        const basicAuthUsername = separatorIndex >= 0 ? basicAuthDecoded.slice(0, separatorIndex) : '';
        const basicAuthPassword = separatorIndex >= 0 ? basicAuthDecoded.substring(separatorIndex + 1) : '';
        const providedUsername = adminUsername || basicAuthUsername;
        const providedPassword = adminPassword || basicAuthPassword;
        const isCredentialValid = !!providedUsername &&
            !!providedPassword &&
            safeCompare(providedUsername.trim(), validAdminUsername) &&
            safeCompare(providedPassword, validAdminPassword);
        if (isCredentialValid) {
            return next();
        }
        return res.status(403).json({ error: 'Admin access required' });
    }
    catch (error) {
        return res.status(500).json({ error: 'Auth check failed' });
    }
}
