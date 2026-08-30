import {
  buildSyncedStateReconcileResult,
  defaultSharedUserToolSettings,
  normalizeSharedUserToolSettings,
  sharedUserToolSettingsSchema,
  type SharedUserToolSettings,
} from '@tmrxjd/platform/tools'
import { getToolsBotDb } from './idb'
import { logger } from '../core/logger'
import { loadUserSharedSettingsCloud, saveUserSharedSettingsCloud } from './user-shared-settings-cloud'
import { syncCloudOutboxState } from './cloud-sync-outbox'
import { resolveCanonicalAppwriteUserId } from './identity'

const SHARED_SETTINGS_SCOPE = 'shared-settings'

export type LocalSharedUserToolSettings = SharedUserToolSettings

export type SharedSettingsReconcileResult = {
  autoCloudEnabled: boolean
  hasDifference: boolean
  direction: 'cloud-newer' | 'local-newer' | 'unknown'
  localUpdatedAt: number | null
  cloudUpdatedAt: number | null
  localState: LocalSharedUserToolSettings
  cloudState: LocalSharedUserToolSettings | null
  applyCloudToLocal: () => Promise<LocalSharedUserToolSettings | null>
  applyLocalToCloud: () => Promise<void>
}

async function loadLocalSharedSettingsLegacySqlite(userId: string): Promise<{ state: LocalSharedUserToolSettings; updatedAt: number | null }> {
  const database = getToolsBotDb()
  const row = await database.sharedUserSettings.get(userId)
  const local = row
    ? normalizeSharedUserToolSettings({
        cloudSyncEnabled: Boolean(row.cloudSyncEnabled),
        chartPalettePreset: row.chartPalettePreset,
        chartDataAlignment: row.chartDataAlignment,
        languagePreference: row.languagePreference,
        dateFormatPreference: row.dateFormatPreference,
        decimalSeparatorPreference: row.decimalSeparatorPreference,
        runDeltaMode: row.runDeltaMode,
        useSharedToolInputs: row.useSharedToolInputs,
      })
    : { ...defaultSharedUserToolSettings }

  return {
    state: local,
    updatedAt: Number.isFinite(Number(row?.updatedAt)) ? Number(row?.updatedAt) : null,
  }
}

async function saveLocalSharedSettingsLegacySqlite(userId: string, settings: LocalSharedUserToolSettings): Promise<void> {
  const normalized = normalizeSharedUserToolSettings(settings)
  const database = getToolsBotDb()
  await database.sharedUserSettings.put({
    userId,
    cloudSyncEnabled: normalized.cloudSyncEnabled ? 1 : 0,
    useSharedToolInputs: normalized.useSharedToolInputs ? 1 : 0,
    chartPalettePreset: normalized.chartPalettePreset,
    chartDataAlignment: normalized.chartDataAlignment,
    languagePreference: normalized.languagePreference,
    dateFormatPreference: normalized.dateFormatPreference,
    decimalSeparatorPreference: normalized.decimalSeparatorPreference,
    runDeltaMode: normalized.runDeltaMode,
    updatedAt: Date.now(),
  })
}

async function loadLocalSharedSettings(userId: string): Promise<{ state: LocalSharedUserToolSettings; updatedAt: number | null }> {
  try {
    const { loadSharedSettingsFromRxDB } = await import('../rxdb/user-state-rxdb-store.js')
    return await loadSharedSettingsFromRxDB(userId)
  } catch (error) {
    logger.warn('[shared-settings] RxDB read failed; falling back to legacy sqlite', { userId, error })
    return loadLocalSharedSettingsLegacySqlite(userId)
  }
}

async function saveLocalSharedSettings(userId: string, settings: LocalSharedUserToolSettings): Promise<void> {
  try {
    const { saveSharedSettingsToRxDB } = await import('../rxdb/user-state-rxdb-store.js')
    await saveSharedSettingsToRxDB(userId, settings)
    return
  } catch (error) {
    logger.warn('[shared-settings] RxDB write failed; falling back to legacy sqlite', { userId, error })
  }

  await saveLocalSharedSettingsLegacySqlite(userId, settings)
}

export async function getUserSharedSettings(userId: string): Promise<LocalSharedUserToolSettings> {
  try {
    const local = await loadLocalSharedSettings(userId)
    return local.state
  } catch (error) {
    logger.warn('Failed to read shared user settings, using defaults', error)
    return { ...defaultSharedUserToolSettings }
  }
}

function hasMeaningfulSharedSettings(candidate: LocalSharedUserToolSettings): boolean {
  return candidate.cloudSyncEnabled !== defaultSharedUserToolSettings.cloudSyncEnabled
    || candidate.useSharedToolInputs !== defaultSharedUserToolSettings.useSharedToolInputs
    || candidate.chartPalettePreset !== defaultSharedUserToolSettings.chartPalettePreset
    || candidate.chartDataAlignment !== defaultSharedUserToolSettings.chartDataAlignment
    || candidate.languagePreference !== defaultSharedUserToolSettings.languagePreference
    || candidate.dateFormatPreference !== defaultSharedUserToolSettings.dateFormatPreference
    || candidate.decimalSeparatorPreference !== defaultSharedUserToolSettings.decimalSeparatorPreference
    || candidate.runDeltaMode !== defaultSharedUserToolSettings.runDeltaMode
}

export async function getEffectiveUserSharedSettings(discordUserId: string): Promise<LocalSharedUserToolSettings> {
  const primary = await getUserSharedSettings(discordUserId)
  const canonicalUserId = resolveCanonicalAppwriteUserId(discordUserId)

  if (!canonicalUserId || canonicalUserId === discordUserId) {
    return primary
  }

  if (hasMeaningfulSharedSettings(primary)) {
    return primary
  }

  const canonical = await getUserSharedSettings(canonicalUserId)
  if (hasMeaningfulSharedSettings(canonical)) {
    return canonical
  }

  const cloud = await loadUserSharedSettingsCloud(discordUserId)
  if (cloud?.state.cloudSyncEnabled) {
    return cloud.state
  }

  return primary
}

export async function saveUserSharedSettings(userId: string, settings: LocalSharedUserToolSettings): Promise<void> {
  try {
    const normalized = sharedUserToolSettingsSchema.parse(normalizeSharedUserToolSettings(settings)) as LocalSharedUserToolSettings
    const [existingLocal, existingCloud] = await Promise.all([
      loadLocalSharedSettings(userId),
      loadUserSharedSettingsCloud(userId),
    ])

    await saveLocalSharedSettings(userId, normalized)

    const shouldQueueCloudSync = normalized.cloudSyncEnabled
      || existingLocal.state.cloudSyncEnabled
      || existingCloud?.state.cloudSyncEnabled === true

    if (!shouldQueueCloudSync) {
      return
    }

    await syncCloudOutboxState({
      userId,
      scope: SHARED_SETTINGS_SCOPE,
      payload: normalized as unknown as Record<string, unknown>,
      send: async payload => saveUserSharedSettingsCloud(userId, payload as unknown as LocalSharedUserToolSettings),
    })
  } catch (error) {
    logger.warn('Failed to save shared user settings', error)
  }
}

export async function reconcileUserSharedSettings(userId: string): Promise<SharedSettingsReconcileResult> {
  let local = await loadLocalSharedSettings(userId)
  const cloud = await loadUserSharedSettingsCloud(userId)

  if (local.updatedAt === null && cloud?.state.cloudSyncEnabled) {
    await saveLocalSharedSettings(userId, cloud.state)
    local = {
      state: cloud.state,
      updatedAt: cloud.updatedAt ?? Date.now(),
    }
  }

  return buildSyncedStateReconcileResult({
    local,
    cloud: {
      state: cloud?.state ?? null,
      updatedAt: cloud?.updatedAt ?? null,
    },
    autoCloudEnabled: local.state.cloudSyncEnabled,
    normalize: input => normalizeSharedUserToolSettings(input ?? defaultSharedUserToolSettings),
    saveLocal: async state => saveLocalSharedSettings(userId, state),
    queueCloudSync: async state => {
      await syncCloudOutboxState({
        userId,
        scope: SHARED_SETTINGS_SCOPE,
        payload: state as unknown as Record<string, unknown>,
        send: async payload => saveUserSharedSettingsCloud(userId, payload as unknown as LocalSharedUserToolSettings),
      })
    },
  })
}
