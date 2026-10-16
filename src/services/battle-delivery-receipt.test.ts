import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { sendWithBattleReceipt } from './battle-delivery-receipt';
const roots: string[] = [];
async function root() { const p=await mkdtemp(path.join(os.tmpdir(),'battle-receipt-')); roots.push(p); return p; }
const nonce='a'.repeat(24);
afterEach(async()=>{await Promise.all(roots.splice(0).map(p=>rm(p,{recursive:true,force:true})));});
it('reuses persisted success across reopen without a duplicate post',async()=>{const p=await root(),send=vi.fn(async()=>({id:'message'}));expect(await sendWithBattleReceipt(nonce,send,p)).toBe('message');expect(await sendWithBattleReceipt(nonce,send,p)).toBe('message');expect(send).toHaveBeenCalledTimes(1);});
it('holds ambiguous timeout across restart without replaying',async()=>{const p=await root(),send=vi.fn().mockRejectedValue(new Error('timeout'));await expect(sendWithBattleReceipt(nonce,send,p)).rejects.toThrow();expect(await sendWithBattleReceipt(nonce,send,p)).toBeNull();expect(send).toHaveBeenCalledTimes(1);});
it('allows retry after explicit rejection',async()=>{const p=await root(),send=vi.fn().mockRejectedValueOnce({status:429}).mockResolvedValue({id:'message'});await expect(sendWithBattleReceipt(nonce,send,p)).rejects.toEqual({status:429});expect(await sendWithBattleReceipt(nonce,send,p)).toBe('message');});
