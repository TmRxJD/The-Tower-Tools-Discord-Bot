/* eslint-env node */
require('dotenv').config({ path: '.env.dev' });
const { Client, Databases, Query } = require('node-appwrite');
const { process, console } = globalThis;

const discordId = process.argv[2] || '371914184822095873';

const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT)
  .setProject(process.env.APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const db = new Databases(client);

async function run() {
  const out = { discordId };

  const botDb = process.env.APPWRITE_DATABASE_ID || 'run-tracker-bot';
  const botUsers = process.env.APPWRITE_USER_SETTINGS_COLLECTION_ID || 'user_settings';
  const settingsDb = process.env.APPWRITE_SETTINGS_DATABASE_ID || 'run-tracker-data';
  const settingsCol = process.env.APPWRITE_SETTINGS_COLLECTION_ID || 'settings';
  const cloudDb = process.env.APPWRITE_CLOUD_DATABASE_ID || 'cloud-saves';
  const modulesCol = process.env.APPWRITE_MODULES_COLLECTION_ID || 'tracker_modules';
  const labsCol = process.env.APPWRITE_LABS_COLLECTION_ID || 'tracker_labs';

  const bot = await db.listDocuments(botDb, botUsers, [Query.equal('userId', discordId), Query.limit(1)]);
  const botDoc = bot.documents[0] || null;
  const usernames = [botDoc?.username].filter(Boolean);

  out.botUserSettings = {
    found: !!botDoc,
    username: botDoc?.username || null,
  };

  const candidateSet = new Set([discordId]);

  for (const username of usernames) {
    const settingsMatches = await db.listDocuments(settingsDb, settingsCol, [
      Query.equal('username', username),
      Query.orderDesc('$updatedAt'),
      Query.limit(10),
    ]);
    for (const doc of settingsMatches.documents) {
      if (typeof doc.$id === 'string' && doc.$id.trim()) {
        candidateSet.add(doc.$id.trim());
      }
    }

    const legacyMatches = await db.listDocuments('labs-data', 'lab-settings', [
      Query.equal('username', username),
      Query.orderDesc('$updatedAt'),
      Query.limit(10),
    ]);
    for (const doc of legacyMatches.documents) {
      if (typeof doc.userId === 'string' && doc.userId.trim()) {
        candidateSet.add(doc.userId.trim());
      }
    }
  }

  const candidates = Array.from(candidateSet);
  out.candidates = candidates;
  out.perCandidate = {};

  for (const id of candidates) {
    const row = { id };

    try {
      const d = await db.getDocument(cloudDb, labsCol, id);
      const parsed = typeof d.data === 'string' ? JSON.parse(d.data) : null;
      const labs = parsed?.settings?.labs || {};
      row.trackerLabs = {
        found: true,
        labSpeed: labs.labSpeed ?? null,
        labRelic: labs.labRelic ?? null,
        labDiscount: labs.labDiscount ?? null,
        recordCount: Array.isArray(parsed?.progress?.records) ? parsed.progress.records.length : 0,
      };
    } catch {
      row.trackerLabs = { found: false };
    }

    const legacySettings = await db.listDocuments('labs-data', 'lab-settings', [
      Query.equal('userId', id),
      Query.limit(1),
    ]);
    const legacyDoc = legacySettings.documents[0];
    row.legacyLabSettings = legacyDoc
      ? {
          found: true,
          labSpeed: legacyDoc.labSpeed ?? null,
          labRelic: legacyDoc.labRelic ?? null,
          labDiscount: legacyDoc.labDiscount ?? null,
          speedUp: legacyDoc.speedUp ?? null,
        }
      : { found: false };

    const legacyProgress = await db.listDocuments('labs-data', 'lab-progress', [
      Query.equal('userId', id),
      Query.limit(1),
    ]);
    row.legacyLabProgress = {
      found: legacyProgress.total > 0,
      total: legacyProgress.total,
    };

    try {
      const sdoc = await db.getDocument(settingsDb, settingsCol, id);
      row.sharedSettings = {
        found: true,
        cloudSyncEnabled: sdoc.cloudSyncEnabled ?? null,
        chartPalettePreset: sdoc.chartPalettePreset ?? null,
        username: sdoc.username ?? null,
      };
    } catch {
      row.sharedSettings = { found: false };
    }

    try {
      const mdoc = await db.getDocument(cloudDb, modulesCol, id);
      const blob = typeof mdoc.data === 'string' ? JSON.parse(mdoc.data) : {};
      const settings = blob?.settings || {};
      row.modules = {
        found: true,
        hasShard: Boolean(settings.shardSplitter || settings.shard_splitter),
        hasReminders: Boolean(settings.reminders || settings.reminderSettings),
        hasChecklist: Boolean(settings.checklist),
        commandKeysPresent: ['bots', 'module', 'workshop', 'stone', 'chart', 'thorns'].filter(k => Boolean(settings[k])),
      };
    } catch {
      row.modules = { found: false };
    }

    out.perCandidate[id] = row;
  }

  console.log(JSON.stringify(out, null, 2));
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
