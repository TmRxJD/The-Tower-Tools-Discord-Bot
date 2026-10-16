import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
const defaultRoot = path.resolve(__dirname, '../../.data/battle-delivery-receipts');
const receiptSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('pending'), at: z.number() }).strict(),
  z.object({ state: z.literal('sent'), at: z.number(), messageId: z.string().min(1) }).strict(),
]);
/** A crash/ambiguous send is held for reconciliation, never blindly replayed. */
export async function sendWithBattleReceipt(nonce: string, send: () => Promise<{ id: string }>, root = defaultRoot): Promise<string | null> {
  if (!/^[a-f0-9]{24}$/.test(nonce)) throw new Error('Invalid battle delivery nonce');
  await fs.mkdir(root, { recursive: true });
  const file = path.join(root, nonce + '.json');
  let handle;
  try { handle = await fs.open(file, 'wx'); }
  catch (error) {
    if ((error as { code?: string }).code !== 'EEXIST') throw error;
    const receipt = receiptSchema.parse(JSON.parse(await fs.readFile(file, 'utf8')));
    return receipt.state === 'sent' ? receipt.messageId : null;
  }
  try { await handle.writeFile(JSON.stringify({ state: 'pending', at: Date.now() })); await handle.sync(); }
  finally { await handle.close(); }
  try {
    const message = await send();
    const temp = file + '.tmp';
    const complete = await fs.open(temp, 'w');
    try { await complete.writeFile(JSON.stringify({ state: 'sent', at: Date.now(), messageId: message.id })); await complete.sync(); }
    finally { await complete.close(); }
    await fs.rename(temp, file);
    return message.id;
  } catch (error) {
    // An explicit Discord rejection cannot have created the message. Transport/5xx failures
    // are ambiguous; keep the pending receipt across restart until an operator reconciles it.
    const status = (error as { status?: number }).status;
    if (typeof status === 'number' && status >= 400 && status < 500) await fs.unlink(file);
    throw error;
  }
}
