import type { CashierShift, DailyCashup } from '@/types/cashup';

/** Total shop payouts: day end payout lines + adjustment - lotto payouts. */
export function shopPayoutsTotal(shop: Pick<CashierShift, 'payouts' | 'lottoPayouts'> & { payoutsAdjustment?: number }): number {
  const lines = shop.payouts?.reduce((s, p) => s + (p.amount || 0), 0) ?? 0;
  return lines + (shop.payoutsAdjustment ?? 0) - (shop.lottoPayouts ?? 0);
}

/** Total shop receipts (line items + adjustment). */
export function shopReceiptsTotal(shop: Pick<CashierShift, 'receipts'> & { receiptsAdjustment?: number }): number {
  const lines = shop.receipts?.reduce((s, r) => s + (r.amount || 0), 0) ?? 0;
  return lines + (shop.receiptsAdjustment ?? 0);
}

export function cashupPayoutsTotal(c: DailyCashup): number {
  return shopPayoutsTotal(c.shop);
}

export function cashupReceiptsTotal(c: DailyCashup): number {
  return shopReceiptsTotal(c.shop);
}
