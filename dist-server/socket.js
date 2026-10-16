import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { User } from './models/User.js';
import { Bet } from './models/Bet.js';
import { Round } from './models/Round.js';
import { OddsControl } from './models/OddsControl.js';
import { Settings } from './models/Settings.js';
let io = null;
const JWT_SECRET = process.env.JWT_SECRET || 'rukabet-jwt-secret-2026';
const WAIT_MS = 5000;
const CRASH_DISPLAY_MS = 3000;
const CRASHING_MS = 700;
const TICK_MS = 100;
const MAX_HISTORY = 20;
const MAX_LIVE_BETS = 10;
const MIN_BOT_BETS = 42; // increased by 20
const BOT_BET_VARIANCE = 14;
const INITIAL_NONCE = 1;
function getServerClientSeed() {
    const configuredSeed = process.env.GAME_CLIENT_SEED;
    if (configuredSeed)
        return configuredSeed;
    if (process.env.NODE_ENV === 'production') {
        throw new Error('GAME_CLIENT_SEED must be configured in production');
    }
    return 'rukabet-dev-client-seed';
}
const SERVER_CLIENT_SEED = getServerClientSeed();
const BOT_NAMES = [
    '2**9', '2**6', '7**1', '2**3', '2**2', '2**5', '2**0', '2**7',
    '2**4', '7**6', '1**9', '5**2', '8**4', '3**8', '9**1', '6**7',
    '4**5', '2**8', '7**3', '1**6', '5**8', '8**2', '3**5', '9**4',
    '6**1', '4**9', '8**7', '5**3', '3**9', '7**2', '1**4', '9**8',
    '4**2', '6**5', '2**1', '8**9', '5**6', '3**1', '7**8', '1**2'
];
const gameState = {
    phase: 'waiting',
    nonce: INITIAL_NONCE,
    roundId: `round-${INITIAL_NONCE}`,
    multiplier: 1,
    crashPoint: 0,
    waitProgress: 0,
    roundHistory: [],
    elapsedMs: 0,
    serverSeedHash: '',
    revealedSeed: '',
    liveBets: []
};
let currentServerSeed = '';
let waitingStartedAt = Date.now();
let flyingStartedAt = 0;
let crashingStartedAt = 0;
let tickTimer = null;
let waitingTimer = null;
let crashingTimer = null;
let crashedTimer = null;
function emitGameSnapshot(target) {
    if (target) {
        target.emit('GAME_SNAPSHOT', gameState);
        return;
    }
    io?.emit('GAME_SNAPSHOT', gameState);
}
function pushLiveBetUpdate(bet) {
    const idx = gameState.liveBets.findIndex(b => b.id === bet.id);
    if (idx >= 0) {
        gameState.liveBets[idx] = bet;
    }
    else {
        gameState.liveBets.unshift(bet);
    }
    gameState.liveBets = gameState.liveBets
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, MAX_LIVE_BETS);
    io?.emit('LIVE_BETS_SNAPSHOT', gameState.liveBets);
}
function computeMultiplier(ms) {
    return Math.pow(Math.E, 0.00006 * ms);
}
function computeCrashPoint(serverSeed, clientSeed, nonce) {
    const hash = crypto.createHmac('sha256', serverSeed).update(`${clientSeed}:${nonce}`).digest('hex');
    const h = parseInt(hash.slice(0, 13), 16);
    const E = 2 ** 52;
    if (h < E / 100)
        return 1.0;
    const raw = Math.floor((100 * E - h) / (E - h)) / 100;
    return Math.min(200, Math.max(1.01, raw));
}
let activeOddsState = {
    enabled: false,
    mode: 'normal',
    minMultiplier: 2.0,
    maxMultiplier: 5.0,
    durationType: 'minutes',
    durationMinutes: 15,
    roundsTotal: 10,
    roundsRemaining: 10,
    lastActivatedBy: 'system'
};
function mineServerSeedForCondition(condition, clientSeed, nonce) {
    if (condition.mode === 'normal') {
        const serverSeed = crypto.randomBytes(32).toString('hex');
        const crashPoint = computeCrashPoint(serverSeed, clientSeed, nonce);
        return { serverSeed, crashPoint };
    }
    const minMult = Math.max(1.01, condition.min);
    const maxMult = Math.min(200, Math.max(minMult, condition.max));
    if (condition.mode === 'exact' && condition.exact && condition.exact >= 1.01) {
        const target = Math.min(200, Math.max(1.01, Math.round(condition.exact * 100) / 100));
        for (let i = 0; i < 400; i++) {
            const seed = crypto.randomBytes(32).toString('hex');
            const cp = computeCrashPoint(seed, clientSeed, nonce);
            if (Math.abs(cp - target) <= 0.05) {
                return { serverSeed: seed, crashPoint: cp };
            }
        }
    }
    let bestSeed = crypto.randomBytes(32).toString('hex');
    let bestCp = computeCrashPoint(bestSeed, clientSeed, nonce);
    let bestDiff = Math.abs(bestCp - (minMult + maxMult) / 2);
    // Mine seed matching range or min
    for (let attempt = 0; attempt < 500; attempt++) {
        const seed = crypto.randomBytes(32).toString('hex');
        const cp = computeCrashPoint(seed, clientSeed, nonce);
        if (condition.mode === 'min_multiplier') {
            if (cp >= minMult) {
                return { serverSeed: seed, crashPoint: cp };
            }
        }
        else {
            // range mode
            if (cp >= minMult && cp <= maxMult) {
                return { serverSeed: seed, crashPoint: cp };
            }
        }
        const diff = cp < minMult ? (minMult - cp) : (cp > maxMult ? (cp - maxMult) : 0);
        if (diff < bestDiff) {
            bestDiff = diff;
            bestSeed = seed;
            bestCp = cp;
        }
    }
    // Fallback within target bounds
    if (bestCp < minMult || (condition.mode === 'range' && bestCp > maxMult)) {
        const forced = Math.round((minMult + Math.random() * (maxMult - minMult)) * 100) / 100;
        return { serverSeed: bestSeed, crashPoint: Math.min(200, Math.max(minMult, forced)) };
    }
    return { serverSeed: bestSeed, crashPoint: bestCp };
}
async function resetOddsEngineInternal(reason = 'Reset to normal') {
    activeOddsState.enabled = false;
    activeOddsState.mode = 'normal';
    activeOddsState.expiresAt = undefined;
    activeOddsState.roundsRemaining = 0;
    try {
        const doc = await OddsControl.getOddsControl();
        doc.enabled = false;
        doc.mode = 'normal';
        doc.expiresAt = undefined;
        doc.roundsRemaining = 0;
        if (doc.auditLogs && doc.auditLogs.length > 0) {
            const last = doc.auditLogs[doc.auditLogs.length - 1];
            if (!last.expiredAt) {
                last.expiredAt = new Date();
                last.reason = reason;
            }
        }
        await doc.save();
    }
    catch (error) {
        console.error('Error resetting OddsControl in DB:', error);
    }
}
async function checkAndApplyOddsExpiration() {
    if (!activeOddsState.enabled)
        return;
    const now = Date.now();
    // Duration in minutes expired
    if (activeOddsState.durationType === 'minutes' && activeOddsState.expiresAt && now >= activeOddsState.expiresAt) {
        console.log(`[OddsEngine] Scheduled duration (${activeOddsState.durationMinutes}m) expired at ${new Date().toISOString()}. Reverting to normal odds.`);
        await resetOddsEngineInternal('Duration expired');
        return;
    }
    // Scheduled window ended
    if (activeOddsState.durationType === 'scheduled_window') {
        if (activeOddsState.scheduledEndTime && now >= activeOddsState.scheduledEndTime) {
            console.log(`[OddsEngine] Scheduled window ended. Reverting to normal odds.`);
            await resetOddsEngineInternal('Scheduled window ended');
            return;
        }
    }
    // Rounds completed
    if (activeOddsState.durationType === 'rounds' && activeOddsState.roundsRemaining <= 0) {
        console.log(`[OddsEngine] Completed all ${activeOddsState.roundsTotal} scheduled rounds. Reverting to normal odds.`);
        await resetOddsEngineInternal('Completed all scheduled rounds');
        return;
    }
}
function getRandomBotBetAmount(isHighRoller) {
    if (isHighRoller) {
        return Math.floor(5000 + Math.random() * 4000);
    }
    const roll = Math.random();
    if (roll < 0.5)
        return Math.floor(10 + Math.random() * 90);
    if (roll < 0.8)
        return Math.floor(100 + Math.random() * 400);
    return Math.floor(500 + Math.random() * 1500);
}
function getRandomBotCashoutTarget() {
    const roll = Math.random();
    if (roll < 0.35)
        return Math.round((1.12 + Math.random() * 0.25) * 100) / 100;
    if (roll < 0.65)
        return Math.round((1.37 + Math.random() * 0.35) * 100) / 100;
    if (roll < 0.85)
        return Math.round((1.72 + Math.random() * 1.28) * 100) / 100;
    if (roll < 0.95)
        return Math.round((3.00 + Math.random() * 3.50) * 100) / 100;
    return Math.round((6.50 + Math.random() * 13.50) * 100) / 100;
}
function seedRoundBotBets() {
    const count = MIN_BOT_BETS + Math.floor(Math.random() * BOT_BET_VARIANCE);
    const highRollerCount = Math.ceil(count * 0.1);
    for (let i = 0; i < count; i++) {
        const userName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
        const botBet = {
            id: `bot-${gameState.roundId}-${i + 1}`,
            user: userName,
            rank: 1 + Math.floor(Math.random() * 5),
            bet: getRandomBotBetAmount(i < highRollerCount),
            cashout: null,
            won: null,
            cashoutTarget: getRandomBotCashoutTarget(),
            avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${userName}`,
            roundId: gameState.roundId,
            updatedAt: Date.now()
        };
        pushLiveBetUpdate(botBet);
    }
}
function updateBotCashouts(multiplier) {
    const now = Date.now();
    for (const bet of gameState.liveBets) {
        if (!bet.id.startsWith(`bot-${gameState.roundId}`))
            continue;
        if (bet.cashout !== null)
            continue;
        if (multiplier >= bet.cashoutTarget) {
            const cashout = Math.round(multiplier * 100) / 100;
            pushLiveBetUpdate({
                ...bet,
                cashout,
                won: Math.round(bet.bet * cashout * 100) / 100,
                updatedAt: now
            });
        }
    }
}
async function markRoundLostBets(roundId, crashPoint) {
    try {
        await Bet.updateMany({ roundId, status: 'active' }, { status: 'lost', multiplierCaught: crashPoint });
    }
    catch (error) {
        console.error('Round crash persistence error:', error);
    }
}
function stopTimers() {
    if (tickTimer) {
        clearInterval(tickTimer);
        tickTimer = null;
    }
    if (waitingTimer) {
        clearTimeout(waitingTimer);
        waitingTimer = null;
    }
    if (crashingTimer) {
        clearTimeout(crashingTimer);
        crashingTimer = null;
    }
    if (crashedTimer) {
        clearTimeout(crashedTimer);
        crashedTimer = null;
    }
}
function startWaiting() {
    if (!io)
        return;
    gameState.phase = 'waiting';
    gameState.roundId = `round-${gameState.nonce}`;
    gameState.multiplier = 1;
    gameState.elapsedMs = 0;
    gameState.revealedSeed = '';
    gameState.waitProgress = 0;
    waitingStartedAt = Date.now();
    // Check and apply expiration for active odds rules
    checkAndApplyOddsExpiration().catch(() => { });
    let isOverrideActive = false;
    if (activeOddsState.enabled) {
        const now = Date.now();
        if (activeOddsState.durationType === 'scheduled_window') {
            const inWindow = (!activeOddsState.scheduledStartTime || now >= activeOddsState.scheduledStartTime) &&
                (!activeOddsState.scheduledEndTime || now <= activeOddsState.scheduledEndTime);
            isOverrideActive = inWindow;
        }
        else {
            isOverrideActive = true;
        }
    }
    if (isOverrideActive) {
        const mined = mineServerSeedForCondition({
            mode: activeOddsState.mode,
            min: activeOddsState.minMultiplier,
            max: activeOddsState.maxMultiplier,
            exact: activeOddsState.exactMultiplier
        }, SERVER_CLIENT_SEED, gameState.nonce);
        currentServerSeed = mined.serverSeed;
        gameState.serverSeedHash = crypto.createHash('sha256').update(currentServerSeed).digest('hex');
        gameState.crashPoint = mined.crashPoint;
    }
    else {
        currentServerSeed = crypto.randomBytes(32).toString('hex');
        gameState.serverSeedHash = crypto.createHash('sha256').update(currentServerSeed).digest('hex');
        gameState.crashPoint = computeCrashPoint(currentServerSeed, SERVER_CLIENT_SEED, gameState.nonce);
    }
    seedRoundBotBets();
    emitGameSnapshot();
    waitingTimer = setTimeout(() => {
        startFlying();
    }, WAIT_MS);
    tickTimer = setInterval(() => {
        if (gameState.phase !== 'waiting')
            return;
        const waitElapsed = Date.now() - waitingStartedAt;
        gameState.waitProgress = Math.min(100, (waitElapsed / WAIT_MS) * 100);
        emitGameSnapshot();
    }, TICK_MS);
}
function startFlying() {
    if (!io)
        return;
    if (tickTimer) {
        clearInterval(tickTimer);
        tickTimer = null;
    }
    gameState.phase = 'flying';
    gameState.multiplier = 1;
    gameState.waitProgress = 100;
    gameState.elapsedMs = 0;
    flyingStartedAt = Date.now();
    emitGameSnapshot();
    tickTimer = setInterval(() => {
        if (gameState.phase !== 'flying')
            return;
        const elapsed = Date.now() - flyingStartedAt;
        const multiplier = computeMultiplier(elapsed);
        if (multiplier >= gameState.crashPoint) {
            gameState.multiplier = gameState.crashPoint;
            gameState.elapsedMs = elapsed;
            emitGameSnapshot();
            startCrashing();
            return;
        }
        gameState.multiplier = multiplier;
        gameState.elapsedMs = elapsed;
        updateBotCashouts(multiplier);
        emitGameSnapshot();
    }, TICK_MS);
}
function startCrashing() {
    if (!io)
        return;
    if (tickTimer) {
        clearInterval(tickTimer);
        tickTimer = null;
    }
    gameState.phase = 'crashing';
    crashingStartedAt = Date.now();
    gameState.revealedSeed = currentServerSeed;
    emitGameSnapshot();
    crashingTimer = setTimeout(async () => {
        gameState.phase = 'crashed';
        gameState.multiplier = gameState.crashPoint;
        gameState.elapsedMs = Date.now() - crashingStartedAt;
        gameState.roundHistory = [...gameState.roundHistory, gameState.crashPoint].slice(-MAX_HISTORY);
        await markRoundLostBets(gameState.roundId, gameState.crashPoint);
        try {
            await Round.create({
                roundId: gameState.roundId,
                crashPoint: gameState.crashPoint
            });
        }
        catch (error) {
            console.error('Failed to save round to history:', error);
        }
        // Decrement round counter if active round-based rule
        if (activeOddsState.enabled && activeOddsState.durationType === 'rounds') {
            activeOddsState.roundsRemaining = Math.max(0, activeOddsState.roundsRemaining - 1);
            OddsControl.updateOne({}, { roundsRemaining: activeOddsState.roundsRemaining }).catch(() => { });
            if (activeOddsState.roundsRemaining <= 0) {
                resetOddsEngineInternal('Completed all scheduled rounds').catch(() => { });
            }
        }
        emitGameSnapshot();
        crashedTimer = setTimeout(() => {
            gameState.nonce += 1;
            startWaiting();
        }, CRASH_DISPLAY_MS);
    }, CRASHING_MS);
}
async function initializeGameLoop() {
    stopTimers();
    try {
        const recentRounds = await Round.find().sort({ createdAt: -1 }).limit(MAX_HISTORY);
        if (recentRounds.length > 0) {
            gameState.roundHistory = recentRounds.map(r => r.crashPoint).reverse();
            const highestRound = recentRounds[0];
            const match = highestRound.roundId.match(/^round-(\d+)$/);
            if (match) {
                gameState.nonce = parseInt(match[1], 10) + 1;
            }
        }
        else {
            gameState.nonce = INITIAL_NONCE;
        }
    }
    catch (error) {
        console.error('Error loading initial round history:', error);
        gameState.nonce = INITIAL_NONCE;
    }
    // Restore OddsControl rule from DB
    try {
        const oddsDoc = await OddsControl.getOddsControl();
        if (oddsDoc && oddsDoc.enabled) {
            const now = Date.now();
            const isExpired = (oddsDoc.durationType === 'minutes' && oddsDoc.expiresAt && oddsDoc.expiresAt.getTime() <= now) ||
                (oddsDoc.durationType === 'rounds' && oddsDoc.roundsRemaining <= 0) ||
                (oddsDoc.durationType === 'scheduled_window' && oddsDoc.scheduledEndTime && oddsDoc.scheduledEndTime.getTime() <= now);
            if (isExpired) {
                oddsDoc.enabled = false;
                oddsDoc.mode = 'normal';
                await oddsDoc.save();
            }
            else {
                activeOddsState = {
                    enabled: oddsDoc.enabled,
                    mode: oddsDoc.mode,
                    minMultiplier: oddsDoc.minMultiplier,
                    maxMultiplier: oddsDoc.maxMultiplier,
                    exactMultiplier: oddsDoc.exactMultiplier,
                    durationType: oddsDoc.durationType,
                    durationMinutes: oddsDoc.durationMinutes,
                    roundsTotal: oddsDoc.roundsTotal,
                    roundsRemaining: oddsDoc.roundsRemaining,
                    scheduledStartTime: oddsDoc.scheduledStartTime?.getTime(),
                    scheduledEndTime: oddsDoc.scheduledEndTime?.getTime(),
                    startedAt: oddsDoc.startedAt?.getTime(),
                    expiresAt: oddsDoc.expiresAt?.getTime(),
                    lastActivatedBy: oddsDoc.lastActivatedBy
                };
                console.log(`[OddsEngine] Restored active rule from DB: ${activeOddsState.mode} [${activeOddsState.minMultiplier}x - ${activeOddsState.maxMultiplier}x]`);
            }
        }
    }
    catch (e) {
        console.error('Failed to load OddsControl on startup:', e);
    }
    startWaiting();
}
export function initializeSocket(httpServer) {
    io = new Server(httpServer, {
        cors: {
            origin: process.env.NODE_ENV === 'production'
                ? process.env.FRONTEND_URL
                : ['http://localhost:5175', 'http://localhost:3000'],
            methods: ['GET', 'POST'],
            credentials: true
        },
        pingInterval: 25000,
        pingTimeout: 60000,
        transports: ['websocket', 'polling']
    });
    initializeGameLoop();
    io.on('connection', (socket) => {
        console.log(`🔌 Client connected: ${socket.id}`);
        socket.emit('GAME_SNAPSHOT', gameState);
        socket.emit('LIVE_BETS_SNAPSHOT', gameState.liveBets);
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
        socket.on('PLACE_BET', async (data) => {
            try {
                const userId = socket.data.userId;
                if (!userId) {
                    return socket.emit('BET_ERROR', { error: 'Not authenticated' });
                }
                const { amount, isFreebet } = data;
                if (!amount || amount < 1) {
                    return socket.emit('BET_ERROR', { error: 'Invalid bet amount' });
                }
                if (gameState.phase !== 'waiting') {
                    return socket.emit('BET_ERROR', { error: 'Betting window is closed for this round' });
                }
                let user;
                if (isFreebet) {
                    const checkUser = await User.findById(userId);
                    if (!checkUser)
                        return socket.emit('BET_ERROR', { error: 'User not found' });
                    if (checkUser.freebetLocked) {
                        const settings = await Settings.getSettings();
                        const unlockAmount = Number(settings?.freebetUnlockAmount ?? 50);
                        return socket.emit('BET_ERROR', { error: `Freebets locked: Deposit KSH ${unlockAmount}+ to unlock` });
                    }
                    if ((checkUser.freebet || 0) < amount) {
                        return socket.emit('BET_ERROR', { error: 'Insufficient freebet balance' });
                    }
                    user = await User.findOneAndUpdate({ _id: userId, freebet: { $gte: amount } }, { $inc: { freebet: -amount } }, { new: true });
                }
                else {
                    user = await User.findOneAndUpdate({ _id: userId, balance: { $gte: amount } }, { $inc: { balance: -amount } }, { new: true });
                }
                if (!user) {
                    return socket.emit('BET_ERROR', { error: isFreebet ? 'Insufficient freebet balance' : 'Insufficient balance' });
                }
                const bet = await Bet.create({
                    userId,
                    roundId: gameState.roundId,
                    amount,
                    status: 'active'
                });
                console.log(`🎰 Bet placed: User ${user.phone}, Amount ${amount}, Round ${gameState.roundId}`);
                socket.emit('BET_PLACED', {
                    success: true,
                    betId: bet._id.toString(),
                    amount,
                    roundId: gameState.roundId,
                    newBalance: user.balance
                });
                pushLiveBetUpdate({
                    id: `user-${bet._id.toString()}`,
                    user: user.username,
                    rank: 1,
                    bet: amount,
                    cashout: null,
                    won: null,
                    cashoutTarget: 0,
                    isUser: true,
                    roundId: gameState.roundId,
                    updatedAt: Date.now()
                });
                io?.emit('NEW_BET', {
                    username: user.username,
                    amount,
                    roundId: gameState.roundId
                });
            }
            catch (error) {
                console.error('Place bet error:', error);
                socket.emit('BET_ERROR', { error: error.message });
            }
        });
        socket.on('CASH_OUT', async (data) => {
            try {
                const userId = socket.data.userId;
                if (!userId) {
                    return socket.emit('CASHOUT_ERROR', { error: 'Not authenticated' });
                }
                if (gameState.phase !== 'flying') {
                    return socket.emit('CASHOUT_ERROR', { error: 'Cannot cash out outside flying phase' });
                }
                const { betId } = data;
                const serverMultiplier = Math.round(gameState.multiplier * 100) / 100;
                const existingBet = await Bet.findById(betId);
                if (!existingBet) {
                    return socket.emit('CASHOUT_ERROR', { error: 'Bet not found' });
                }
                const winAmount = Math.round(existingBet.amount * serverMultiplier * 100) / 100;
                const bet = await Bet.findOneAndUpdate({ _id: betId, userId, status: 'active' }, {
                    status: 'won',
                    multiplierCaught: serverMultiplier,
                    winAmount
                }, { new: true });
                if (!bet) {
                    return socket.emit('CASHOUT_ERROR', { error: 'Bet not found or already cashed out' });
                }
                const user = await User.findByIdAndUpdate(userId, { $inc: { balance: winAmount } }, { new: true });
                console.log(`💰 Cash out: User ${user?.phone}, Win ${winAmount} at ${serverMultiplier}x`);
                socket.emit('CASHOUT_SUCCESS', {
                    success: true,
                    betId: bet._id.toString(),
                    multiplier: serverMultiplier,
                    winAmount,
                    newBalance: user?.balance
                });
                pushLiveBetUpdate({
                    id: `user-${bet._id.toString()}`,
                    user: user?.username || 'Player',
                    rank: 1,
                    bet: bet.amount,
                    cashout: serverMultiplier,
                    won: winAmount,
                    cashoutTarget: 0,
                    isUser: true,
                    roundId: gameState.roundId,
                    updatedAt: Date.now()
                });
                io?.emit('PLAYER_CASHED_OUT', {
                    username: user?.username,
                    amount: bet.amount,
                    multiplier: serverMultiplier,
                    winAmount
                });
            }
            catch (error) {
                console.error('Cash out error:', error);
                socket.emit('CASHOUT_ERROR', { error: error.message });
            }
        });
        socket.on('ROUND_CRASHED', async () => {
            // Round lifecycle is now server-authoritative; keep handler as no-op for compatibility.
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
export function getOddsEngineState() {
    const now = Date.now();
    let timeRemainingMs = 0;
    if (activeOddsState.enabled && activeOddsState.durationType === 'minutes' && activeOddsState.expiresAt) {
        timeRemainingMs = Math.max(0, activeOddsState.expiresAt - now);
    }
    else if (activeOddsState.enabled && activeOddsState.durationType === 'scheduled_window' && activeOddsState.scheduledEndTime) {
        timeRemainingMs = Math.max(0, activeOddsState.scheduledEndTime - now);
    }
    return {
        ...activeOddsState,
        timeRemainingMs,
        timeRemainingSeconds: Math.ceil(timeRemainingMs / 1000)
    };
}
export async function applyOddsEngineRule(params) {
    const now = Date.now();
    const durationMinutes = Math.max(1, Number(params.durationMinutes) || 15);
    const roundsTotal = Math.max(1, Number(params.roundsTotal) || 10);
    const expiresAt = params.durationType === 'minutes' ? new Date(now + durationMinutes * 60 * 1000) : undefined;
    activeOddsState = {
        enabled: params.mode !== 'normal',
        mode: params.mode,
        minMultiplier: Math.max(1.01, Number(params.minMultiplier) || 2.0),
        maxMultiplier: Math.min(200, Math.max(Number(params.minMultiplier) || 2.0, Number(params.maxMultiplier) || 5.0)),
        exactMultiplier: params.exactMultiplier ? Number(params.exactMultiplier) : undefined,
        durationType: params.durationType,
        durationMinutes,
        roundsTotal,
        roundsRemaining: roundsTotal,
        scheduledStartTime: params.scheduledStartTime ? new Date(params.scheduledStartTime).getTime() : undefined,
        scheduledEndTime: params.scheduledEndTime ? new Date(params.scheduledEndTime).getTime() : undefined,
        startedAt: now,
        expiresAt: expiresAt?.getTime(),
        lastActivatedBy: params.activatedBy || 'admin'
    };
    try {
        const doc = await OddsControl.getOddsControl();
        doc.enabled = activeOddsState.enabled;
        doc.mode = activeOddsState.mode;
        doc.minMultiplier = activeOddsState.minMultiplier;
        doc.maxMultiplier = activeOddsState.maxMultiplier;
        doc.exactMultiplier = activeOddsState.exactMultiplier;
        doc.durationType = activeOddsState.durationType;
        doc.durationMinutes = activeOddsState.durationMinutes;
        doc.roundsTotal = activeOddsState.roundsTotal;
        doc.roundsRemaining = activeOddsState.roundsRemaining;
        doc.scheduledStartTime = params.scheduledStartTime;
        doc.scheduledEndTime = params.scheduledEndTime;
        doc.startedAt = new Date(now);
        doc.expiresAt = expiresAt;
        doc.lastActivatedBy = activeOddsState.lastActivatedBy;
        doc.note = params.note || '';
        doc.auditLogs.push({
            activatedAt: new Date(now),
            mode: activeOddsState.mode,
            minMultiplier: activeOddsState.minMultiplier,
            maxMultiplier: activeOddsState.maxMultiplier,
            durationType: activeOddsState.durationType,
            durationMinutes: activeOddsState.durationMinutes,
            roundsTotal: activeOddsState.roundsTotal,
            activatedBy: activeOddsState.lastActivatedBy,
            reason: params.note || 'Admin configured odds engine rule'
        });
        await doc.save();
    }
    catch (err) {
        console.error('Error saving OddsControl to DB:', err);
    }
    console.log(`[OddsEngine] Rule applied: ${activeOddsState.mode} [${activeOddsState.minMultiplier}x - ${activeOddsState.maxMultiplier}x], duration: ${activeOddsState.durationType} (${activeOddsState.durationMinutes}m / ${activeOddsState.roundsTotal}r)`);
    return getOddsEngineState();
}
export async function resetOddsEngineToNormal(reason = 'Manual admin reset') {
    await resetOddsEngineInternal(reason);
    console.log(`[OddsEngine] Reset to normal odds engine. Reason: ${reason}`);
    return getOddsEngineState();
}
