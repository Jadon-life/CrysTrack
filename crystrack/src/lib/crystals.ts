import { z } from 'zod';
export const crystalStateSchema = z.object({enabled:z.boolean(),revision:z.number().int().positive(),
 total:z.string().regex(/^(0|[1-9]\d{0,29})$/),pendingMoment:z.boolean()}).strict();
export type CrystalState = z.infer<typeof crystalStateSchema>;
export const crystalSettingsSchema = z.object({enabled:z.boolean(),revision:z.number().int().positive()}).strict();
export const crystalMomentSchema = z.object({level:z.number().int().min(2).max(1000)}).strict().nullable();
export function crystalStage(level: number) {
 if (!Number.isInteger(level) || level<1) throw new Error('Invalid crystal level');
 return level<=2?'Raw':level<=4?'Shard':level<=6?'Cluster':level<=9?'Prism':'Radiant';
}
/** Integer shard segments: ceil(previous * 6/5). No floating exponential or money math. */
export function crystalProgress(total: string | bigint) {
 if (typeof total==='string' && !/^(0|[1-9]\d{0,29})$/.test(total)) throw new Error('Invalid shard total');
 let remaining=BigInt(total),requirement=BigInt(500),level=1;
 if(remaining<BigInt(0))throw new Error('Invalid shard total');
 while(remaining>=requirement){remaining-=requirement;requirement=(requirement*BigInt(6)+BigInt(4))/BigInt(5);level++;}
 return {level,stage:crystalStage(level),total:String(total),toward:String(remaining),requirement:String(requirement),
  percent:Number(remaining*BigInt(10000)/requirement)/100};
}
