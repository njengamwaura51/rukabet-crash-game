import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { Settings } from '../models/Settings.js';
const JWT_SECRET = process.env.JWT_SECRET || 'rukabet-jwt-secret-2026';
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
        const adminToken = req.headers['x-admin-token'];
        const adminUsername = req.headers['x-admin-username'];
        const adminPassword = req.headers['x-admin-password'];
        const settings = await Settings.findOne();
        const validToken = settings?.adminToken || process.env.ADMIN_TOKEN || 'rukabet-admin-2026';
        const validAdminUsername = process.env.ADMIN_USERNAME;
        const validAdminPassword = process.env.ADMIN_PASSWORD;
        const isTokenValid = !!adminToken && adminToken === validToken;
        const isCredentialValid = !!validAdminUsername &&
            !!validAdminPassword &&
            !!adminUsername &&
            !!adminPassword &&
            adminUsername === validAdminUsername &&
            adminPassword === validAdminPassword;
        if (!isTokenValid && !isCredentialValid) {
            return res.status(403).json({ error: 'Admin access required (invalid token or credentials)' });
        }
        next();
    }
    catch (error) {
        return res.status(500).json({ error: 'Auth check failed' });
    }
}
