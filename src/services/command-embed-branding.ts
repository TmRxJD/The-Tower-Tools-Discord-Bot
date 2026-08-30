import { EmbedBuilder } from 'discord.js'
import { getBotConfig } from '../config/bot-config'

const COMMAND_ROUTE_MAP: Record<string, string> = {
  bots: '/calculators/bots',
  chart: '/tools/chart',
  cph: '/tools?dialog=cph-calculator',
  guardian: '/calculators/guardians',
  lab: '/calculators/labs',
  module: '/calculators/modules',
  shard: '/calculators/shard-splitter',
  stone: '/calculators/uw',
  thorns: '/calculators/thorns',
  workshop: '/calculators/workshop',
  enemy_stats: '/calculators/enemy-stats',
}

function getSiteBaseUrl(): string {
  const configured = getBotConfig().common.toolsHub.siteUrl || 'https://www.the-tower-run-tracker.com'
  return configured.endsWith('/') ? configured.slice(0, -1) : configured
}

export function getCommandSiteUrl(commandName: string): string {
  const route = COMMAND_ROUTE_MAP[commandName] || getBotConfig().common.toolsHub.toolsPath || '/tools'
  return `${getSiteBaseUrl()}${route.startsWith('/') ? route : `/${route}`}`
}

export function getCommandUsageFooter(commandName: string): string {
  return `Use /${commandName} to use this command`
}

export function brandCommandEmbed(embed: EmbedBuilder, commandName: string): EmbedBuilder {
  const nextEmbed = EmbedBuilder.from(embed)
  nextEmbed.setURL(getCommandSiteUrl(commandName))
  nextEmbed.setFooter({ text: getCommandUsageFooter(commandName) })
  return nextEmbed
}

export function brandCommandEmbeds(embeds: readonly EmbedBuilder[], commandName: string): EmbedBuilder[] {
  return embeds.map(embed => brandCommandEmbed(embed, commandName))
}