const Database = require('better-sqlite3');
const path = require('node:path');
const fs = require('node:fs');

const dbPath = path.join(__dirname, '..', 'guilds.db');
let db;

function init() {
    const exists = fs.existsSync(dbPath);
    db = new Database(dbPath);
    db.exec(`
        CREATE TABLE IF NOT EXISTS guilds (
            guild_id TEXT PRIMARY KEY,
            joined_at INTEGER
        );
    `);
    return { migratedFromConfig: !exists };
}

function addGuild(guildId) {
    const stmt = db.prepare('INSERT OR IGNORE INTO guilds (guild_id, joined_at) VALUES (?, ?)');
    const info = stmt.run(guildId, Date.now());
    return info.changes > 0;
}

function hasGuild(guildId) {
    const row = db.prepare('SELECT guild_id FROM guilds WHERE guild_id = ?').get(guildId);
    return !!row;
}

function getAllGuilds() {
    const rows = db.prepare('SELECT guild_id FROM guilds').all();
    return rows.map(r => r.guild_id);
}

function migrateFromConfig(configPath) {
    try {
        if (!fs.existsSync(configPath)) return 0;
        const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const guildIds = Array.isArray(cfg.guildIds) ? cfg.guildIds : [];
        let added = 0;
        const insert = db.prepare('INSERT OR IGNORE INTO guilds (guild_id, joined_at) VALUES (?, ?)');
        const now = Date.now();
        const trans = db.transaction((ids) => {
            for (const id of ids) {
                const info = insert.run(id, now);
                if (info.changes > 0) added++;
            }
        });
        trans(guildIds);
        return added;
    } catch (err) {
        console.error('Failed to migrate guild IDs from config:', err);
        return 0;
    }
}

module.exports = { init, addGuild, hasGuild, getAllGuilds, migrateFromConfig };
