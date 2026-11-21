/**
 * utils/database.js
 * ⚡ Pure JavaScript high-performance JSON database engine.
 * Zero native C++ dependencies (no node-gyp, no compilation errors on Docker / Bot-Hosting).
 * In-memory sub-millisecond access with atomic asynchronous/synchronous file persistence.
 */
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const DB_PATH = path.join(dataDir, 'database.json');
const TMP_PATH = path.join(dataDir, 'database.json.tmp');

// Default database structure
const defaultSchema = {
    users: {},
    transactions: [],
    cooldowns: {},
    reminders: {},
    guilds: {},
    categories: {},
    tickets: {},
    blacklist: {},
    memory: {},
    brain_memories: [],
    user_profiles: {},
    user_conversations: {},
    upi: {},
    task_pings: {},
};

// In-memory data store
let db = { ...defaultSchema };

function loadDatabase() {
    try {
        if (fs.existsSync(DB_PATH)) {
            const raw = fs.readFileSync(DB_PATH, 'utf8');
            const parsed = JSON.parse(raw);
            db = {
                users: parsed.users || {},
                transactions: parsed.transactions || [],
                cooldowns: parsed.cooldowns || {},
                reminders: parsed.reminders || {},
                guilds: parsed.guilds || {},
                categories: parsed.categories || {},
                tickets: parsed.tickets || {},
                blacklist: parsed.blacklist || {},
                memory: parsed.memory || {},
                brain_memories: parsed.brain_memories || [],
                user_profiles: parsed.user_profiles || {},
                user_conversations: parsed.user_conversations || {},
                upi: parsed.upi || {},
                task_pings: parsed.task_pings || {},
            };
        } else {
            saveSync();
        }
    } catch (err) {
        console.error('[Database] Failed to parse database.json, initializing defaults:', err.message);
        db = { ...defaultSchema };
    }
}

// Atomic file save to prevent corruption
let saveTimeout = null;
function saveSync() {
    try {
        const json = JSON.stringify(db, null, 2);
        fs.writeFileSync(TMP_PATH, json, 'utf8');
        fs.renameSync(TMP_PATH, DB_PATH);
    } catch (err) {
        console.error('[Database] Sync save error:', err.message);
    }
}

function scheduleSave() {
    if (saveTimeout) return;
    saveTimeout = setTimeout(() => {
        saveTimeout = null;
        saveSync();
    }, 100);
}

// Ensure database is saved before process exits
process.on('exit', () => saveSync());
process.on('SIGINT', () => { saveSync(); process.exit(0); });
process.on('SIGTERM', () => { saveSync(); process.exit(0); });

// Initialize database
loadDatabase();

// ─── Economy ──────────────────────────────────────────────────────────────────

function ensureUser(userId) {
    if (!db.users[userId]) {
        db.users[userId] = { userId, balance: 0 };
        scheduleSave();
    }
}

function getUser(userId) {
    ensureUser(userId);
    return db.users[userId];
}

function addMoney(userId, amount, reason = null, executorId = null) {
    ensureUser(userId);
    const oldBalance = db.users[userId].balance;
    const newBalance = oldBalance + amount;
    db.users[userId].balance = newBalance;

    db.transactions.push({
        id: db.transactions.length + 1,
        userId,
        type: 'ADD',
        amount,
        oldBalance,
        newBalance,
        reason,
        executorId,
        timestamp: Date.now(),
    });

    scheduleSave();
    return newBalance;
}

function removeMoney(userId, amount, reason = null, executorId = null) {
    ensureUser(userId);
    const oldBalance = db.users[userId].balance;
    const newBalance = oldBalance - amount;
    db.users[userId].balance = newBalance;

    db.transactions.push({
        id: db.transactions.length + 1,
        userId,
        type: 'REMOVE',
        amount,
        oldBalance,
        newBalance,
        reason,
        executorId,
        timestamp: Date.now(),
    });

    scheduleSave();
    return newBalance;
}

function getTransactions(userId, limit = 5) {
    return db.transactions
        .filter((t) => t.userId === userId)
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit);
}

function getAllUsers() {
    return Object.values(db.users).sort((a, b) => (b.balance || 0) - (a.balance || 0));
}

// ─── Cooldowns ────────────────────────────────────────────────────────────────

function getCooldown(userId) {
    return db.cooldowns[userId] || null;
}

function getCooldowns() {
    return Object.values(db.cooldowns);
}

function setCooldown(userId, channelId, endTime, initiatorId) {
    db.cooldowns[userId] = {
        id: Date.now(),
        userId,
        channelId,
        endTime,
        initiatorId,
    };
    scheduleSave();
}

function clearCooldown(userId, endTime) {
    const cd = db.cooldowns[userId];
    if (cd && (!endTime || cd.endTime === endTime)) {
        delete db.cooldowns[userId];
        scheduleSave();
    }
}

function removeCooldownByUserId(userId) {
    if (db.cooldowns[userId]) {
        delete db.cooldowns[userId];
        scheduleSave();
    }
}

// ─── Reminders ────────────────────────────────────────────────────────────────

function addReminder(userId, channelId, message, endTime, initiatorId) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    db.reminders[id] = {
        id,
        userId,
        channelId,
        message,
        endTime,
        initiatorId,
    };
    scheduleSave();
    return id;
}

function getReminders() {
    return Object.values(db.reminders);
}

function reminderExists(id) {
    return Boolean(db.reminders[id]);
}

function removeReminder(id) {
    if (db.reminders[id]) {
        delete db.reminders[id];
        scheduleSave();
    }
}

function removeRemindersByUserId(userId) {
    let changed = false;
    for (const [id, r] of Object.entries(db.reminders)) {
        if (r.userId === userId) {
            delete db.reminders[id];
            changed = true;
        }
    }
    if (changed) scheduleSave();
}

// ─── Guild / Tickets ──────────────────────────────────────────────────────────

function getGuildConfig(guildId) {
    return db.guilds[guildId] || {};
}

function setGuildConfig(guildId, data) {
    if (!db.guilds[guildId]) {
        db.guilds[guildId] = { guildId, ticketCount: 0 };
    }
    db.guilds[guildId] = { ...db.guilds[guildId], ...data, guildId };
    scheduleSave();
}

function incrementTicketCount(guildId) {
    if (!db.guilds[guildId]) {
        db.guilds[guildId] = { guildId, ticketCount: 0 };
    }
    db.guilds[guildId].ticketCount = (db.guilds[guildId].ticketCount || 0) + 1;
    scheduleSave();
    return db.guilds[guildId].ticketCount;
}

function getCategories(guildId) {
    return Object.values(db.categories).filter((c) => c.guildId === guildId);
}

function getCategory(id) {
    return db.categories[id] || null;
}

function createCategory(data) {
    db.categories[data.id] = {
        id: data.id,
        guildId: data.guildId,
        name: data.name,
        emoji: data.emoji,
        roles: typeof data.roles === 'string' ? data.roles : JSON.stringify(data.roles || []),
        categoryId: data.categoryId,
        maxTickets: data.maxTickets || 1,
        questions: typeof data.questions === 'string' ? data.questions : JSON.stringify(data.questions || []),
    };
    scheduleSave();
}

function deleteCategory(id) {
    if (db.categories[id]) {
        delete db.categories[id];
        scheduleSave();
    }
}

function createTicket(data) {
    db.tickets[data.channelId] = {
        channelId: data.channelId,
        guildId: data.guildId,
        userId: data.userId,
        categoryId: data.categoryId,
        status: 'open',
        claimantId: null,
        createdAt: data.createdAt || Date.now(),
        closedAt: null,
        answers: typeof data.answers === 'string' ? data.answers : JSON.stringify(data.answers || {}),
    };
    scheduleSave();
}

function getTicket(channelId) {
    return db.tickets[channelId] || null;
}

function updateTicket(channelId, data) {
    if (db.tickets[channelId]) {
        db.tickets[channelId] = { ...db.tickets[channelId], ...data };
        scheduleSave();
    }
}

function getUserActiveTickets(userId, guildId) {
    return Object.values(db.tickets).filter(
        (t) => t.userId === userId && t.guildId === guildId && t.status === 'open'
    );
}

function getUserTickets(userId, guildId) {
    return Object.values(db.tickets)
        .filter((t) => t.userId === userId && t.guildId === guildId)
        .sort((a, b) => b.createdAt - a.createdAt);
}

function isBlacklisted(guildId, userId) {
    return Boolean(db.blacklist[`${guildId}_${userId}`]);
}

// ─── Memory ───────────────────────────────────────────────────────────────────

function setMemory(slot, message) {
    db.memory[slot] = message;
    scheduleSave();
}

function getMemory(slot) {
    return db.memory[slot] || null;
}

function getAllMemory() {
    return { ...db.memory };
}

// ─── Brain Memories ────────────────────────────────────────────────────────────

function addBrainMemory(scope, scopeId, content) {
    db.brain_memories.push({
        id: db.brain_memories.length + 1,
        scope,
        scopeId: scopeId || null,
        content,
        timestamp: Date.now(),
    });
    scheduleSave();
}

function deleteBrainMemoryByKeyword(scope, scopeId, keyword) {
    const prevLen = db.brain_memories.length;
    const kw = keyword.toLowerCase();
    db.brain_memories = db.brain_memories.filter((m) => {
        if (m.scope !== scope) return true;
        if (scope !== 'global' && m.scopeId !== scopeId) return true;
        return !m.content.toLowerCase().includes(kw);
    });
    const changes = prevLen - db.brain_memories.length;
    if (changes > 0) scheduleSave();
    return { changes };
}

function getBrainMemories(scope, scopeId) {
    if (scope === 'global') {
        return db.brain_memories.filter((m) => m.scope === 'global');
    }
    return db.brain_memories.filter((m) => m.scope === scope && m.scopeId === scopeId);
}

function getAllRelevantBrainMemories(userId, guildId) {
    return db.brain_memories
        .filter((m) => {
            if (m.scope === 'global') return true;
            if (m.scope === 'user' && m.scopeId === userId) return true;
            if (m.scope === 'server' && m.scopeId === guildId) return true;
            return false;
        })
        .sort((a, b) => a.timestamp - b.timestamp);
}

// ─── User Profile & Cross-Session Memory ─────────────────────────────────────

function getUserProfile(userId) {
    if (!db.user_profiles[userId]) {
        db.user_profiles[userId] = {
            userId,
            preferredName: null,
            facts: [],
            summary: null,
            updatedAt: Date.now(),
        };
    }
    return db.user_profiles[userId];
}

function updateUserProfile(userId, updates = {}) {
    const profile = getUserProfile(userId);
    Object.assign(profile, updates);
    profile.updatedAt = Date.now();
    scheduleSave();
    return profile;
}

function addUserFact(userId, fact) {
    const profile = getUserProfile(userId);
    const cleanFact = (fact || '').trim();
    if (!cleanFact) return profile;

    if (!Array.isArray(profile.facts)) profile.facts = [];

    // Avoid exact or near duplicates
    if (!profile.facts.some(f => f.toLowerCase() === cleanFact.toLowerCase())) {
        profile.facts.push(cleanFact);
        // Keep up to 30 facts max
        if (profile.facts.length > 30) {
            profile.facts.shift();
        }
        profile.updatedAt = Date.now();
        scheduleSave();
    }
    return profile;
}

function removeUserFact(userId, keyword) {
    const profile = getUserProfile(userId);
    if (!Array.isArray(profile.facts)) return 0;
    const kw = (keyword || '').toLowerCase();
    const prevLen = profile.facts.length;
    profile.facts = profile.facts.filter(f => !f.toLowerCase().includes(kw));
    const changes = prevLen - profile.facts.length;
    if (changes > 0) {
        profile.updatedAt = Date.now();
        scheduleSave();
    }
    return changes;
}

function getUserConversation(userId, limit = 20) {
    const history = db.user_conversations[userId] || [];
    return history.slice(-limit);
}

function appendUserConversation(userId, role, content) {
    if (!db.user_conversations[userId]) {
        db.user_conversations[userId] = [];
    }
    db.user_conversations[userId].push({
        role,
        content: String(content || '').trim(),
        timestamp: Date.now(),
    });
    // Keep last 40 turns in persistent history
    if (db.user_conversations[userId].length > 40) {
        db.user_conversations[userId] = db.user_conversations[userId].slice(-40);
    }
    scheduleSave();
}

function clearUserMemory(userId) {
    let cleared = false;
    if (db.user_profiles[userId]) {
        delete db.user_profiles[userId];
        cleared = true;
    }
    if (db.user_conversations[userId]) {
        delete db.user_conversations[userId];
        cleared = true;
    }
    const prevBrainLen = db.brain_memories.length;
    db.brain_memories = db.brain_memories.filter(m => !(m.scope === 'user' && m.scopeId === userId));
    if (db.brain_memories.length !== prevBrainLen) {
        cleared = true;
    }
    if (cleared) scheduleSave();
    return cleared;
}

// ─── UPI ─────────────────────────────────────────────────────────────────────

function setUpi(userId, guildId, upiId, qrUrl) {
    db.upi[`${userId}_${guildId}`] = {
        userId,
        guildId,
        upiId,
        qrUrl: qrUrl || null,
        savedAt: Date.now(),
    };
    scheduleSave();
}

function getUpi(userId, guildId) {
    return db.upi[`${userId}_${guildId}`] || null;
}

function deleteUpi(userId, guildId) {
    if (db.upi[`${userId}_${guildId}`]) {
        delete db.upi[`${userId}_${guildId}`];
        scheduleSave();
    }
}

function getAllUpi(guildId) {
    return Object.values(db.upi).filter((u) => u.guildId === guildId);
}

// ─── Task Pings ──────────────────────────────────────────────────────────────

function addTaskPing(userId, channelId, task, initiatorId, intervalMs = 30 * 60 * 1000) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const nextPingTime = Date.now() + intervalMs;
    db.task_pings[id] = {
        id,
        userId,
        channelId,
        task,
        initiatorId,
        intervalMs,
        nextPingTime,
        createdAt: Date.now(),
    };
    scheduleSave();
    return db.task_pings[id];
}

function getTaskPings() {
    return Object.values(db.task_pings || {});
}

function getTaskPing(id) {
    return db.task_pings?.[id] || null;
}

function getActiveTaskPingsForUserInChannel(userId, channelId) {
    return Object.values(db.task_pings || {}).filter(
        (tp) => tp.userId === userId && tp.channelId === channelId
    );
}

function updateTaskPingNextTime(id, nextPingTime) {
    if (db.task_pings && db.task_pings[id]) {
        db.task_pings[id].nextPingTime = nextPingTime;
        scheduleSave();
    }
}

function removeTaskPing(id) {
    if (db.task_pings && db.task_pings[id]) {
        const removed = db.task_pings[id];
        delete db.task_pings[id];
        scheduleSave();
        return removed;
    }
    return null;
}

function removeTaskPingsByUserAndChannel(userId, channelId) {
    let removedList = [];
    if (!db.task_pings) return removedList;
    for (const [id, tp] of Object.entries(db.task_pings)) {
        if (tp.userId === userId && tp.channelId === channelId) {
            removedList.push(tp);
            delete db.task_pings[id];
        }
    }
    if (removedList.length > 0) scheduleSave();
    return removedList;
}

module.exports = {
    // Economy
    getUser, addMoney, removeMoney, getAllUsers, getTransactions,
    // Cooldowns
    getCooldown, getCooldowns, setCooldown, clearCooldown, removeCooldownByUserId,
    // Reminders
    addReminder, getReminders, reminderExists, removeReminder, removeRemindersByUserId,
    // Guild/Tickets
    getGuildConfig, setGuildConfig, incrementTicketCount,
    getCategories, getCategory, createCategory, deleteCategory,
    createTicket, getTicket, updateTicket, getUserActiveTickets, getUserTickets,
    isBlacklisted,
    // Memory
    setMemory, getMemory, getAllMemory,
    // Brain Memories
    addBrainMemory, deleteBrainMemoryByKeyword, getBrainMemories, getAllRelevantBrainMemories,
    // User Profile & Memory
    getUserProfile, updateUserProfile, addUserFact, removeUserFact, getUserConversation, appendUserConversation, clearUserMemory,
    // UPI
    setUpi, getUpi, deleteUpi, getAllUpi,
    // Task Pings
    addTaskPing, getTaskPings, getTaskPing, getActiveTaskPingsForUserInChannel,
    updateTaskPingNextTime, removeTaskPing, removeTaskPingsByUserAndChannel,
};
