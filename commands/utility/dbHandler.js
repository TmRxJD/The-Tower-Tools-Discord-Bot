// --- Ultimate Weapon Stone Cost Calculator User Settings ---
const sqlite3 = require('sqlite3').verbose();
const { get } = require('http');
const path = require('path');

const pathUW = path.join(__dirname, '../../userUWSettings.db');
const uwDb = new sqlite3.Database(pathUW);

// Drop old table and create new table for stat levels
uwDb.serialize(() => {
    uwDb.run(`DROP TABLE IF EXISTS user_uw_settings`);
    uwDb.run(`CREATE TABLE IF NOT EXISTS user_uw_stat_levels (
        userId TEXT NOT NULL,
        uwKey TEXT NOT NULL,
        statName TEXT NOT NULL,
        level INTEGER NOT NULL,
        userSet INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (userId, uwKey, statName)
    )`);
});

/**
 * Get all UW stat levels for a user.
 * Returns: { [uwKey]: { [statName]: { value, userSet }, ... }, ... }
 */
function getUserUWSettings(userId) {
    return new Promise((resolve, reject) => {
        uwDb.all(
            'SELECT uwKey, statName, level, userSet FROM user_uw_stat_levels WHERE userId = ?',
            [userId],
            (err, rows) => {
                if (err) return reject(err);
                if (!rows || rows.length === 0) return resolve({});
                const result = {};
                for (const row of rows) {
                    if (!result[row.uwKey]) result[row.uwKey] = {};
                    result[row.uwKey][row.statName] = {
                        value: row.level,
                        userSet: !!row.userSet
                    };
                }
                resolve(result);
            }
        );
    });
}

/**
 * Save all stat levels for a user's UW.
 * statLevels: { [statName]: { value, userSet }, ... }
 * Overwrites all stat levels for the given user/uwKey.
 */
function saveUserUWSettings(userId, uwKey, statLevels) {
    return new Promise((resolve, reject) => {
        uwDb.serialize(() => {
            // Remove old stat levels for this user/UW
            uwDb.run(
                'DELETE FROM user_uw_stat_levels WHERE userId = ? AND uwKey = ?',
                [userId, uwKey],
                (err) => {
                    if (err) return reject(err);
                    // Insert new stat levels
                    const stmt = uwDb.prepare('INSERT OR REPLACE INTO user_uw_stat_levels (userId, uwKey, statName, level, userSet) VALUES (?, ?, ?, ?, ?)');
                    for (const [statName, obj] of Object.entries(statLevels)) {
                        let value, userSet;
                        if (typeof obj === 'object' && obj !== null && 'value' in obj) {
                            value = obj.value;
                            userSet = obj.userSet ? 1 : 0;
                        } else {
                            value = obj;
                            userSet = 1; // fallback: treat as user-set
                        }
                        stmt.run(userId, uwKey, statName, value, userSet);
                    }
                    stmt.finalize((err2) => err2 ? reject(err2) : resolve());
                }
            );
        });
    });
}



const db = new sqlite3.Database(
    path.join(__dirname, 'userSettings.db'),
    (err) => {
        if (err) {
            console.error('Error opening database:', err);
        } else {
            createTables();
        }
    }
);

function createTables() {
    db.run(`
        CREATE TABLE IF NOT EXISTS userSettings (
            userId TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            labSpeed INTEGER NOT NULL,
            labRelic REAL NOT NULL,
            labDiscount INTEGER NOT NULL,
            speedUp INTEGER NOT NULL DEFAULT 1,
            startLevel INTEGER NOT NULL DEFAULT 1,
            targetLevel INTEGER NOT NULL DEFAULT 10,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) {
            console.error('Error creating tables:', err);
        } else {
            // Try to add labLevels column if it doesn't exist
            db.get("PRAGMA table_info(userSettings)", (err2, columns) => {
                if (err2) {
                    console.error('Error checking table info:', err2);
                    return;
                }
                const hasLabLevels = Array.isArray(columns) ? columns.some(col => col.name === 'labLevels') : false;
                if (!hasLabLevels) {
                    db.run("ALTER TABLE userSettings ADD COLUMN labLevels TEXT DEFAULT '{}'", (err3) => {
                        if (err3) {
                            // Ignore error if column already exists
                            if (!String(err3).includes('duplicate column name')) {
                                console.error('Error adding labLevels column:', err3);
                            }
                        } else {
                            console.log('labLevels column added to userSettings table');
                        }
                    });
                }
            });
        }
    });
}

async function saveUserSettings(userId, username, labSpeed, labRelic, labDiscount, startLevel = 1, targetLevel = 10, speedUp = 1, labLevels = {}) {
    console.log('Attempting to save settings:', { userId, username, labSpeed, labRelic, labDiscount, startLevel, targetLevel, speedUp, labLevels });
    return new Promise((resolve, reject) => {
        const query = `
            INSERT OR REPLACE INTO userSettings (userId, username, labSpeed, labRelic, labDiscount, startLevel, targetLevel, speedUp, labLevels, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `;
        db.run(query, [userId, username, labSpeed, labRelic, labDiscount, startLevel, targetLevel, speedUp, JSON.stringify(labLevels)], function(err) {
            if (err) {
                console.error('Database save error:', err);
                reject(err);
            } else {
                console.log('Settings saved successfully');
                resolve({ success: true, changes: this.changes });
            }
        });
    });
}

async function getUserSettings(userId) {
    console.log('Fetching settings for user:', userId);
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM userSettings WHERE userId = ?', [userId], (err, row) => {
            if (err) {
                console.error('Database fetch error:', err);
                reject(err);
            } else {
                // Provide defaults for new columns if missing (for backward compatibility)
                if (row) {
                    row.startLevel = row.startLevel ?? 1;
                    row.targetLevel = row.targetLevel ?? 10;
                    row.speedUp = row.speedUp ?? 1;
                    // Parse labLevels JSON
                    if (typeof row.labLevels === 'string') {
                        try {
                            row.labLevels = JSON.parse(row.labLevels);
                        } catch {
                            row.labLevels = {};
                        }
                    } else if (!row.labLevels) {
                        row.labLevels = {};
                    }
                }
                console.log('Settings retrieved:', row);
                resolve(row);
            }
        });
    });
}

// Add a function to check database connection
function checkConnection() {
    return new Promise((resolve, reject) => {
        db.get('SELECT 1', [], (err, row) => {
            if (err) {
                console.error('Database connection error:', err);
                reject(err);
            } else {
                resolve(true);
            }
        });
    });
}

module.exports = {
    saveUserSettings,
    getUserSettings,
    checkConnection,
    getUserUWSettings,
    saveUserUWSettings
};