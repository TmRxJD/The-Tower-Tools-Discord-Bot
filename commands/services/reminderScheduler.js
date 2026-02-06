const { reminders, getNextTimestampFor } = require('../data/remindersData');
const db = require('./dbHandler');
const reminderService = require('./reminderService');

let interval = null;

// scheduler runs every 60 seconds and checks for reminders that should fire within the next window
async function checkAndSend(client) {
    try {
        const nowSec = Math.floor(Date.now() / 1000);
        const windowSeconds = 70; // allow a small window to catch timestamps

        for (const r of reminders) {
            const key = r.key;
            const nextTs = getNextTimestampFor(key);
            if (!nextTs) continue;
            // if nextTs is within [now, now + windowSeconds]
            if (nextTs >= nowSec && nextTs <= nowSec + windowSeconds) {
                // get users who enabled this reminder
                const users = await db.getUsersForReminder(key);
                if (!users || users.length === 0) continue;
                for (const userId of users) {
                    try {
                        const settings = await db.getReminderSettings(userId);
                        if (settings && settings.paused) continue;
                        const lastSent = await db.getLastSent(userId, key);
                        if (lastSent && lastSent >= nextTs) continue; // already sent for this occurrence
                        const ok = await reminderService.sendReminderDM(client, userId, key);
                        if (ok) await db.setLastSent(userId, key, nextTs);
                    } catch (e) {
                        console.error('Error sending scheduled reminder to', userId, key, e);
                    }
                }
            }
        }
    } catch (err) {
        console.error('Reminder scheduler error:', err);
    }
}

function startScheduler(client) {
    if (interval) return; // already started
    // run immediately then every 60s
    checkAndSend(client);
    interval = setInterval(() => checkAndSend(client), 60 * 1000);
    console.log('Reminder scheduler started.');
}

function stopScheduler() {
    if (!interval) return;
    clearInterval(interval);
    interval = null;
}

module.exports = { startScheduler, stopScheduler };
