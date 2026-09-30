import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import {
  battleConditionsBridgeEventSchema,
  battleConditionsBridgeHost,
  battleConditionsBridgePath,
  battleConditionsBridgePort,
} from '@tmrxjd/platform/tools';
import type { ToolsBotClient } from '../core/tools-bot-client';
import { logger } from '../core/logger';
import { deliverBattleConditionsRecord } from './battle-conditions-delivery';

const MAX_BODY_BYTES = 256 * 1024;

let server: Server | null = null;
let boundPort: number | null = null;

function isLoopbackRequest(request: IncomingMessage): boolean {
  const remoteAddress = request.socket.remoteAddress;
  return remoteAddress === '127.0.0.1'
    || remoteAddress === '::1'
    || remoteAddress === '::ffff:127.0.0.1';
}

function sendJson(response: ServerResponse, statusCode: number, body: Record<string, unknown>): void {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes > MAX_BODY_BYTES) {
      throw new Error('Request body exceeded the maximum allowed size.');
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks).toString('utf8');
}

async function handleRequest(client: ToolsBotClient, request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method !== 'POST' || request.url !== battleConditionsBridgePath) {
    sendJson(response, 404, { ok: false, error: 'Not Found' });
    return;
  }

  if (!isLoopbackRequest(request)) {
    sendJson(response, 403, { ok: false, error: 'Loopback only' });
    return;
  }

  try {
    const rawBody = await readBody(request);
    const parsed = battleConditionsBridgeEventSchema.parse(JSON.parse(rawBody));
    const result = await deliverBattleConditionsRecord(client, {
      id: `${parsed.record.rank}:${parsed.record.tournamentDate}`,
      ...parsed.record,
    });
    sendJson(response, 200, {
      ok: true,
      delivered: result.delivered,
      skipped: result.skipped,
      failed: result.failed,
    });
  } catch (error) {
    logger.warn('Failed to process battle conditions bridge payload', error);
    sendJson(response, 400, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export interface BattleConditionsBridgeOptions {
  /** Defaults to the platform's fixed bridge port; tests pass 0 to get a free one. */
  port?: number;
}

/**
 * Starts the loopback bridge. Resolves with the port actually bound, which differs from the
 * configured one only when the caller asked for an ephemeral port. Callers that do not need
 * the port can ignore the promise: a bind failure is logged, not thrown.
 */
export function startBattleConditionsBridgeServer(
  client: ToolsBotClient,
  options: BattleConditionsBridgeOptions = {},
): Promise<number | null> {
  if (server) {
    return Promise.resolve(boundPort);
  }

  const port = options.port ?? battleConditionsBridgePort;
  const created = createServer((request, response) => {
    void handleRequest(client, request, response);
  });
  server = created;

  return new Promise((resolve) => {
    created.once('error', error => {
      logger.error('Battle conditions bridge server failed', error);
      if (server === created) {
        server = null;
        boundPort = null;
      }
      resolve(null);
    });

    created.listen(port, battleConditionsBridgeHost, () => {
      const address = created.address();
      boundPort = typeof address === 'object' && address ? address.port : port;
      logger.info('Battle conditions bridge server started', {
        host: battleConditionsBridgeHost,
        port: boundPort,
        path: battleConditionsBridgePath,
      });
      resolve(boundPort);
    });
  });
}

export function stopBattleConditionsBridgeServer(): void {
  if (!server) {
    return;
  }

  server.close();
  server = null;
  boundPort = null;
}