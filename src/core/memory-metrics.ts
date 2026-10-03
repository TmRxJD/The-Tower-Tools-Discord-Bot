import type { Client } from 'discord.js';

export interface MemoryActivityCounts {
  gatewayDispatches: number;
  messageCreates: number;
  interactionCreates: number;
}

export interface MemoryStateCounts {
  rxdbDatabases: number;
  rxdbInitializing: number;
  rxdbSubscriptions: number;
  identityCache: number;
  scopedSessions: number;
  battleDeliveryPending: number;
  kbChunks: number;
  kbEmbeddings: number;
}

/** Aggregate sizes only: never copy cache entries, event payloads, names or user identifiers. */
export function collectMemoryMetrics(client: Client, state: MemoryStateCounts, activity: MemoryActivityCounts) {
  let members = 0;
  let messages = 0;
  for (const guild of client.guilds.cache.values()) members += guild.members.cache.size;
  for (const channel of client.channels.cache.values()) {
    if ('messages' in channel) messages += channel.messages.cache.size;
  }
  const resources = process.getActiveResourcesInfo();
  return {
    schemaVersion: 1,
    utc: new Date().toISOString(),
    pid: process.pid,
    uptimeSeconds: Math.floor(process.uptime()),
    memory: process.memoryUsage(),
    discord: {
      ready: client.isReady(),
      guilds: client.guilds.cache.size,
      channels: client.channels.cache.size,
      users: client.users.cache.size,
      members,
      messages,
      listeners: client.eventNames().reduce((total, event) => total + client.listenerCount(event), 0),
      interactionListeners: client.listenerCount('interactionCreate'),
      messageListeners: client.listenerCount('messageCreate'),
      rawListeners: client.listenerCount('raw'),
    },
    state: {
      rxdbDatabases: state.rxdbDatabases,
      rxdbInitializing: state.rxdbInitializing,
      rxdbSubscriptions: state.rxdbSubscriptions,
      identityCache: state.identityCache,
      scopedSessions: state.scopedSessions,
      battleDeliveryPending: state.battleDeliveryPending,
      kbChunks: state.kbChunks,
      kbEmbeddings: state.kbEmbeddings,
    },
    activity: {
      gatewayDispatches: activity.gatewayDispatches,
      messageCreates: activity.messageCreates,
      interactionCreates: activity.interactionCreates,
    },
    resources: {
      timeouts: resources.filter(resource => resource === 'Timeout').length,
      sockets: resources.filter(resource => resource === 'TCPSocketWrap' || resource === 'TCPWrap').length,
      servers: resources.filter(resource => resource === 'TCPServerWrap').length,
      filesystemRequests: resources.filter(resource => resource === 'FSReqCallback').length,
    },
  };
}
