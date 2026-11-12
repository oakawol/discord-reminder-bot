/**
 * utils/timerManager.js
 * Centralized timer scheduling. Loaded once on startup.
 * Handles recovery of timers after restarts.
 */
const db = require('./database');
const embeds = require('./embeds');

let _client = null;
const MAX_TIMEOUT = 2147483647; // Max 32-bit integer ms (approx 24.8 days)

// ─── Cooldowns ────────────────────────────────────────────────────────────────

async function processExpiredCooldown(cd) {
    // Guard: confirm it still exists in DB before processing
    if (!db.getCooldown(cd.userId)) return;

    try {
        const user = await _client.users.fetch(cd.userId).catch(() => null);
        const channel = await _client.channels.fetch(cd.channelId).catch(() => null);

        // Always clean up regardless of fetch success
        db.clearCooldown(cd.userId, cd.endTime);

        if (!user || !channel) return;

        let initiator = null;
        if (cd.initiatorId) {
            initiator = await _client.users.fetch(cd.initiatorId).catch(() => null);
        }

        const mention = initiator ? `${user} and ${initiator}` : `${user}`;
        const { file, embed } = embeds.cooldownExpiredEmbed(mention);

        // DM the target user
        try {
            const { file: dmFile, embed: dmEmbed } = embeds.cooldownExpiredEmbed(user.username);
            await user.send({ embeds: [dmEmbed], files: [dmFile] });
        } catch { /* DMs may be closed */ }

        // Ping in channel
        await channel.send({ content: `${mention}`, embeds: [embed], files: [file] });
    } catch (err) {
        console.error(`[Cooldown] Error processing for ${cd.userId}:`, err.message);
        db.clearCooldown(cd.userId, cd.endTime);
    }
}

async function processExpiredReminder(reminder) {
    // Guard: confirm still exists
    if (!db.reminderExists(reminder.id)) return;

    try {
        const targetUser = await _client.users.fetch(reminder.userId).catch(() => null);
        const targetChannel = await _client.channels.fetch(reminder.channelId).catch(() => null);
        const initiator = await _client.users.fetch(reminder.initiatorId).catch(() => null);

        db.removeReminder(reminder.id);

        if (!targetUser || !targetChannel) return;

        const initiatorTag = initiator ? (initiator.username || initiator.tag) : 'Oakawol Bot';
        const { file, embed } = embeds.reminderFiredEmbed(reminder.message, initiatorTag);

        // DM
        try { await targetUser.send({ embeds: [embed], files: [file] }); } catch { /* DMs may be closed */ }

        // Channel ping
        await targetChannel.send({ content: `${targetUser}`, embeds: [embed], files: [file] });
    } catch (err) {
        console.error(`[Reminder] Error processing ${reminder.id}:`, err.message);
        db.removeReminder(reminder.id);
    }
}

// ─── Task Pings ──────────────────────────────────────────────────────────────

const activeTaskTimeouts = new Map();

async function processTaskPing(taskPing) {
    // Check if task ping still exists in db
    const current = db.getTaskPing(taskPing.id);
    if (!current) {
        activeTaskTimeouts.delete(taskPing.id);
        return;
    }

    try {
        const targetUser = await _client.users.fetch(current.userId).catch(() => null);
        const channel = await _client.channels.fetch(current.channelId).catch(() => null);

        if (!channel) {
            // Channel doesn't exist anymore, clean up
            db.removeTaskPing(current.id);
            activeTaskTimeouts.delete(current.id);
            return;
        }

        const taskEmbed = embeds.taskPingEmbed(targetUser, current.task, current.initiatorId);

        await channel.send({
            content: `<@${current.userId}>`,
            embeds: [taskEmbed],
        }).catch((err) => {
            console.error(`[TaskPing] Failed to send ping to channel ${current.channelId}:`, err.message);
        });

        // Schedule next interval ping (default 30 minutes)
        const nextTime = Date.now() + (current.intervalMs || 30 * 60 * 1000);
        db.updateTaskPingNextTime(current.id, nextTime);
        current.nextPingTime = nextTime;
        scheduleTaskPing(current);
    } catch (err) {
        console.error(`[TaskPing] Error processing ${taskPing.id}:`, err.message);
    }
}

function scheduleTaskPing(taskPing) {
    if (activeTaskTimeouts.has(taskPing.id)) {
        clearTimeout(activeTaskTimeouts.get(taskPing.id));
        activeTaskTimeouts.delete(taskPing.id);
    }

    const remaining = taskPing.nextPingTime - Date.now();
    if (remaining <= 0) {
        processTaskPing(taskPing);
    } else if (remaining > MAX_TIMEOUT) {
        const to = setTimeout(() => scheduleTaskPing(taskPing), MAX_TIMEOUT);
        activeTaskTimeouts.set(taskPing.id, to);
    } else {
        const to = setTimeout(() => processTaskPing(taskPing), remaining);
        activeTaskTimeouts.set(taskPing.id, to);
    }
}

function cancelTaskPingTimeout(id) {
    if (activeTaskTimeouts.has(id)) {
        clearTimeout(activeTaskTimeouts.get(id));
        activeTaskTimeouts.delete(id);
    }
}

// ─── Scheduling ───────────────────────────────────────────────────────────────

function scheduleCooldown(cd) {
    const remaining = cd.endTime - Date.now();
    if (remaining <= 0) {
        processExpiredCooldown(cd);
    } else if (remaining > MAX_TIMEOUT) {
        setTimeout(() => scheduleCooldown(cd), MAX_TIMEOUT);
    } else {
        setTimeout(() => processExpiredCooldown(cd), remaining);
    }
}

function scheduleReminder(reminder) {
    const remaining = reminder.endTime - Date.now();
    if (remaining <= 0) {
        processExpiredReminder(reminder);
    } else if (remaining > MAX_TIMEOUT) {
        setTimeout(() => scheduleReminder(reminder), MAX_TIMEOUT);
    } else {
        setTimeout(() => processExpiredReminder(reminder), remaining);
    }
}

/**
 * Called once on bot ready. Recovers all persisted timers.
 */
function init(client) {
    _client = client;

    for (const cd of db.getCooldowns()) {
        scheduleCooldown(cd);
    }

    for (const reminder of db.getReminders()) {
        scheduleReminder(reminder);
    }

    for (const tp of db.getTaskPings()) {
        scheduleTaskPing(tp);
    }

    console.log('[TimerManager] Restored all cooldowns, reminders, and task pings.');
}

module.exports = {
    init,
    scheduleCooldown,
    scheduleReminder,
    processExpiredCooldown,
    processExpiredReminder,
    scheduleTaskPing,
    cancelTaskPingTimeout,
};
