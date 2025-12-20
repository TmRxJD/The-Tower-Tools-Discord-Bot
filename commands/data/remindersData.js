// Reminders configuration and simple scheduling helpers.
// Display should be universal (UTC); internal AZ mentions removed.

const reminders = [
    { key: 'tourney_1hr_til_start', group: 'Tourney', title: '1-Hour til Start', description: '1 hour until tourney starts', defaultEnabled: false },
    { key: 'tourney_start', group: 'Tourney', title: 'Start', description: 'Tourney start', defaultEnabled: true },
    { key: 'tourney_1hr_left_to_join', group: 'Tourney', title: '1-Hour left to Join', description: '1 hour left to join the tourney', defaultEnabled: false },
    { key: 'tourney_10min_left_to_join', group: 'Tourney', title: '10-min left to Join', description: '10 minutes left to join the tourney', defaultEnabled: false },
    { key: 'tourney_join_cutoff', group: 'Tourney', title: 'Join Time Cutoff', description: '24 hours after the start (join cutoff)', defaultEnabled: false },
    { key: 'tourney_end_rewards', group: 'Tourney', title: 'End/Rewards Available', description: '4 hours after end (28 hours after start)', defaultEnabled: false },

    { key: 'punday_announcement', group: 'Pun Day', title: 'Announcement', description: 'Pun Day announcement', defaultEnabled: false },
    { key: 'punday_1day_left', group: 'Pun Day', title: '1 Day Left to Submit', description: '1 day left to submit to Pun Day', defaultEnabled: false },
    { key: 'punday_1hr_left', group: 'Pun Day', title: '1 Hour Left to Submit', description: '1 hour left to submit', defaultEnabled: false },
    { key: 'punday_submission_cutoff', group: 'Pun Day', title: 'Submission Cutoff', description: 'Submission cutoff (1 week later)', defaultEnabled: false },
    { key: 'punday_polls_open', group: 'Pun Day', title: 'Polls Open for Voting', description: 'Polls open 1 hour after cutoff and stay open 24 hours', defaultEnabled: false },
    { key: 'punday_1hr_til_polls_close', group: 'Pun Day', title: '1 Hour Til Polls Close', description: '1 hour until polls close', defaultEnabled: false },
    { key: 'punday_polls_closed_winner', group: 'Pun Day', title: 'Polls Closed/Winner Announced', description: 'Polls closed and winner announced', defaultEnabled: false },

    { key: 'meme_announcement', group: 'Meme Contest', title: 'Announcement', description: 'Meme contest announcement', defaultEnabled: false },
    { key: 'meme_1day_left', group: 'Meme Contest', title: '1 Day Left to Submit', description: '1 day left to submit to Meme Contest', defaultEnabled: false },
    { key: 'meme_1hr_left', group: 'Meme Contest', title: '1 Hour Left to Submit', description: '1 hour left to submit', defaultEnabled: false },
    { key: 'meme_submission_cutoff', group: 'Meme Contest', title: 'Submission Cutoff', description: 'Submission cutoff', defaultEnabled: false },
    { key: 'meme_polls_open', group: 'Meme Contest', title: 'Polls Open for Voting', description: 'Polls open for voting', defaultEnabled: false },
    { key: 'meme_1hr_til_polls_close', group: 'Meme Contest', title: '1 Hour Til Polls Close', description: '1 hour til polls close', defaultEnabled: false },
    { key: 'meme_polls_closed_winner', group: 'Meme Contest', title: 'Polls Closed/Winner Announced', description: 'Polls closed and winner announced', defaultEnabled: false },

    { key: 'creator_code_reenter', group: 'Creator Code', title: 'Reenter Before Store Reset', description: 'Reminder to reenter creator code before store reset', defaultEnabled: false }
];

function getByKey(key) {
    return reminders.find(r => r.key === key);
}

// Helper: find next occurrence for weekly events given UTC weekday(s) and hour/minute UTC
function nextWeeklyUtc(daysUtc, hourUtc = 0, minuteUtc = 0, validator = null, afterMs = Date.now()) {
    const nowTs = afterMs;
    for (let d = 0; d < 42; d++) {
        const cand = new Date(nowTs + d * 86400000);
        const year = cand.getUTCFullYear();
        const month = cand.getUTCMonth();
        const date = cand.getUTCDate();
        const candidateUtc = Date.UTC(year, month, date, hourUtc, minuteUtc, 0);
        const candidate = new Date(candidateUtc);
        if (daysUtc.includes(candidate.getUTCDay())) {
            if (candidate.getTime() > nowTs) {
                if (typeof validator === 'function') {
                    try {
                        if (!validator(candidate)) continue;
                    } catch (e) {
                        // if validator throws, skip
                        continue;
                    }
                }
                return Math.floor(candidate.getTime() / 1000);
            }
        }
    }
    return null;
}

// Helper: for tourney reminders that are offsets from start, find the next start whose offset is still in the future
function nextTourneyWithOffset(offsetSeconds) {
    const nowMs = Date.now();
    // Try up to the next 8 tourneys (4 weeks); breaks well before 42-day cap inside nextWeeklyUtc
    let afterMs = nowMs;
    for (let i = 0; i < 8; i++) {
        const startTs = nextWeeklyUtc([3, 6], 0, 0, null, afterMs); // Wed(3), Sat(6) at 00:00 UTC
        if (!startTs) return null;
        const reminderTs = startTs + offsetSeconds;
        if (reminderTs * 1000 > nowMs) return reminderTs;
        // Move search window just after this start to find the next one
        afterMs = (startTs + 1) * 1000;
    }
    return null;
}

    // Anchor: known Pun Day on 2025-12-22 at 20:00 UTC (the user said next Pun Day starts 2025-12-22)
    const anchorPunDayUtc = Date.UTC(2025, 11, 22, 20, 0, 0);

    // Returns next reminder timestamp in seconds (UTC) or null if unknown
    function getNextTimestampFor(key) {
    // Map known schedules to UTC weekdays/times. These are simplified conversions:
    // - Tourney start: Tue & Fri at 17:00 AZ -> in UTC this is Wed & Sat at 00:00
    // - Pun Day announcement: Mon at 13:00 AZ -> Mon at 20:00 UTC
    // - Meme announcement: same pattern as Pun Day (for now pick next Monday)

    if (key === 'tourney_start') {
        // UTC weekdays: Wed(3), Sat(6) at 00:00
        return nextWeeklyUtc([3, 6], 0, 0);
    }
    if (key === 'tourney_1hr_til_start') {
        return nextTourneyWithOffset(-3600);
    }
    if (key === 'tourney_1hr_left_to_join') {
        // Join window stays open for 24h after start; 1h-left warning is 23h after start
        return nextTourneyWithOffset(23 * 3600);
    }
    if (key === 'tourney_10min_left_to_join') {
        // 10m-left warning is 23h50m after start
        return nextTourneyWithOffset(23 * 3600 + 50 * 60);
    }
    if (key === 'tourney_join_cutoff') {
        return nextTourneyWithOffset(24 * 3600);
    }
    if (key === 'tourney_end_rewards') {
        return nextTourneyWithOffset(28 * 3600);
    }

    if (key === 'punday_announcement') {
        // Mon at 20:00 UTC, but only on Pun Day weeks (every other week). Use anchor to determine parity.
        const validator = (candidate) => {
            const weeksDiff = Math.floor((candidate.getTime() - anchorPunDayUtc) / (7 * 24 * 3600 * 1000));
            return (weeksDiff % 2) === 0; // even offset weeks from anchor are Pun Day weeks
        };
        return nextWeeklyUtc([1], 20, 0, validator);
    }
    if (key === 'punday_1day_left' || key === 'punday_1hr_left' || key === 'punday_submission_cutoff' || key === 'punday_polls_open' || key === 'punday_1hr_til_polls_close' || key === 'punday_polls_closed_winner') {
        const announce = getNextTimestampFor('punday_announcement');
        if (!announce) return null;
        const cutoff = announce + 7 * 24 * 3600; // 1-week submission window
        if (key === 'punday_1day_left') return cutoff - 24 * 3600;
        if (key === 'punday_1hr_left') return cutoff - 3600;
        if (key === 'punday_submission_cutoff') return cutoff;
        // polls open 1h after cutoff, last 24h
        if (key === 'punday_polls_open') return cutoff + 3600;
        if (key === 'punday_1hr_til_polls_close') return cutoff + 3600 + 23 * 3600; // 1 hour before polls close
        if (key === 'punday_polls_closed_winner') return cutoff + 3600 + 24 * 3600;
    }

    if (key === 'meme_announcement') {
        // Monday at 20:00 UTC, but only on Meme Contest weeks (the weeks between Pun Day weeks)
        const validator = (candidate) => {
            const weeksDiff = Math.floor((candidate.getTime() - anchorPunDayUtc) / (7 * 24 * 3600 * 1000));
            return (weeksDiff % 2) !== 0; // odd offset weeks are Meme weeks
        };
        return nextWeeklyUtc([1], 20, 0, validator);
    }
    if (key === 'meme_1day_left' || key === 'meme_1hr_left' || key === 'meme_submission_cutoff' || key === 'meme_polls_open' || key === 'meme_1hr_til_polls_close' || key === 'meme_polls_closed_winner') {
        const announce = getNextTimestampFor('meme_announcement');
        if (!announce) return null;
        const cutoff = announce + 7 * 24 * 3600; // 1-week submission window
        if (key === 'meme_1day_left') return cutoff - 24 * 3600;
        if (key === 'meme_1hr_left') return cutoff - 3600;
        if (key === 'meme_submission_cutoff') return cutoff;
        if (key === 'meme_polls_open') return cutoff + 3600;
        if (key === 'meme_1hr_til_polls_close') return cutoff + 3600 + 23 * 3600;
        if (key === 'meme_polls_closed_winner') return cutoff + 3600 + 24 * 3600;
    }

    if (key === 'creator_code_reenter') {
        // 24 hours before the 1st of every month (UTC). Compute next month's 1st at 00:00 UTC and subtract 24h.
        const now = new Date();
        const year = now.getUTCFullYear();
        const month = now.getUTCMonth();
        // compute next first-of-month
        let candidateYear = year;
        let candidateMonth = month + 1; // next month
        if (candidateMonth > 11) {
            candidateMonth = 0;
            candidateYear += 1;
        }
        const firstOfNext = Date.UTC(candidateYear, candidateMonth, 1, 0, 0, 0);
        const ts = Math.floor((firstOfNext - 24 * 3600 * 1000) / 1000);
        return ts;
    }

    // other reminders: no schedule
    return null;
}

module.exports = { reminders, getByKey, getNextTimestampFor };
