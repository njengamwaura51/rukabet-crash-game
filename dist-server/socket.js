import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { User } from './models/User.js';
import { Bet } from './models/Bet.js';
let io = null;
const JWT_SECRET = process.env.JWT_SECRET || 'rukabet-jwt-secret-2026';
export function initializeSocket(httpServer) {
    io = new Server(httpServer, {
        cors: {
            origin: process.env.NODE_ENV === 'production'
                ? process.env.FRONTEND_URL
                : ['http://localhost:5175', 'http://localhost:3000'],
            methods: ['GET', 'POST'],
            credentials: true
        },
        // Heroku-friendly settings to prevent connection drops
        pingInterval: 25000, // Send ping every 25 seconds
        pingTimeout: 60000, // Wait 60 seconds for pong before disconnecting
        transports: ['websocket', 'polling']
    });
    io.on('connection', (socket) => {
        console.log(`🔌 Client connected: ${socket.id}`);
        // Authenticate user and join their room
        socket.on('authenticate', async (token) => {
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                const user = await User.findById(decoded.userId);
                if (user) {
                    socket.data.userId = decoded.userId;
                    socket.join(`user:${decoded.userId}`);
                    console.log(`✅ User ${user.phone} authenticated on socket ${socket.id}`);
                    socket.emit('authenticated', {
                        success: true,
                        balance: user.balance,
                        freebet: user.freebet
                    });
                }
            }
            catch (error) {
                console.error('Socket auth error:', error);
                socket.emit('authenticated', { success: false, error: 'Invalid token' });
            }
        });
        // Handle bet placement
        socket.on('PLACE_BET', async (data) => {
            try {
                const userId = socket.data.userId;
                if (!userId) {
                    return socket.emit('BET_ERROR', { error: 'Not authenticated' });
                }
                const { amount, roundId } = data;
                if (!amount || amount < 1) {
                    return socket.emit('BET_ERROR', { error: 'Invalid bet amount' });
                }
                // Deduct balance atomically
                const user = await User.findOneAndUpdate({ _id: userId, balance: { $gte: amount } }, { $inc: { balance: -amount } }, { new: true });
                if (!user) {
                    return socket.emit('BET_ERROR', { error: 'Insufficient balance' });
                }
                // Create bet record
                const bet = await Bet.create({
                    userId,
                    roundId,
                    amount,
                    status: 'active'
                });
                console.log(`🎰 Bet placed: User ${user.phone}, Amount ${amount}, Round ${roundId}`);
                socket.emit('BET_PLACED', {
                    success: true,
                    betId: bet._id.toString(),
                    amount,
                    newBalance: user.balance
                });
                // Broadcast to all clients for live bets display
                io?.emit('NEW_BET', {
                    username: user.username,
                    amount,
                    roundId
                });
            }
            catch (error) {
                console.error('Place bet error:', error);
                socket.emit('BET_ERROR', { error: error.message });
            }
        });
        // Handle cash out
        socket.on('CASH_OUT', async (data) => {
            try {
                const userId = socket.data.userId;
                if (!userId) {
                    return socket.emit('CASHOUT_ERROR', { error: 'Not authenticated' });
                }
                const { betId, multiplier } = data;
                // Find and update bet atomically
                const bet = await Bet.findOneAndUpdate({ _id: betId, userId, status: 'active' }, {
                    status: 'won',
                    multiplierCaught: multiplier,
                    winAmount: Math.floor(multiplier * 100) / 100 * (await Bet.findById(betId)).amount
                }, { new: true });
                if (!bet) {
                    return socket.emit('CASHOUT_ERROR', { error: 'Bet not found or already cashed out' });
                }
                const winAmount = Math.floor(bet.amount * multiplier * 100) / 100;
                // Credit winnings atomically
                const user = await User.findByIdAndUpdate(userId, { $inc: { balance: winAmount } }, { new: true });
                console.log(`💰 Cash out: User ${user?.phone}, Win ${winAmount} at ${multiplier}x`);
                socket.emit('CASHOUT_SUCCESS', {
                    success: true,
                    betId: bet._id.toString(),
                    multiplier,
                    winAmount,
                    newBalance: user?.balance
                });
                // Broadcast win to all clients
                io?.emit('PLAYER_CASHED_OUT', {
                    username: user?.username,
                    amount: bet.amount,
                    multiplier,
                    winAmount
                });
            }
            catch (error) {
                console.error('Cash out error:', error);
                socket.emit('CASHOUT_ERROR', { error: error.message });
            }
        });
        // Handle round crash - mark all active bets as lost
        socket.on('ROUND_CRASHED', async (data) => {
            try {
                const { roundId, crashPoint } = data;
                // Mark all active bets in this round as lost
                await Bet.updateMany({ roundId, status: 'active' }, { status: 'lost', multiplierCaught: crashPoint });
                console.log(`💥 Round ${roundId} crashed at ${crashPoint}x`);
            }
            catch (error) {
                console.error('Round crash error:', error);
            }
        });
        socket.on('disconnect', () => {
            console.log(`🔌 Client disconnected: ${socket.id}`);
        });
    });
    return io;
}
export function getIO() {
    return io;
}
