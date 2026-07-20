import type { AccountEntry, CashierShift, DailyCashup, SpeedpointEntry } from '@/types/cashup';

type OptShiftLike = {
  income?: number;
  returns?: number;
  speedpoints?: SpeedpointEntry[];
  accounts?: AccountEntry[];
};

const sumAmounts = <T>(items: T[] | undefined, pick: (item: T) => number | undefined): number =>
  items?.reduce((sum, item) => sum + (pick(item) ?? 0), 0) ?? 0;

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

export function shopNetSales(shop: Pick<CashierShift, 'income' | 'returns' | 'returns_today'>): number {
  return (shop.income ?? 0) - (shop.returns ?? 0) - (shop.returns_today ?? 0);
}

export function optNetSales(opt: OptShiftLike): number {
  return (opt.income ?? 0) - (opt.returns ?? 0);
}

export function shopTotalTakings(shop: CashierShift): number {
  return shopNetSales(shop) - shopPayoutsTotal(shop) + shopReceiptsTotal(shop);
}

export function shopCashConnectTotal(shop: Pick<CashierShift, 'cashDepositedBanking' | 'easyPay' | 'coins'>): number {
  return (shop.cashDepositedBanking ?? 0) + (shop.easyPay ?? 0) + (shop.coins ?? 0);
}

export function shopSpeedpointTotal(shop: Pick<CashierShift, 'speedpoints'>): number {
  return sumAmounts(shop.speedpoints, (sp) => sp.shopAmount);
}

export function optSpeedpointTotal(opt: OptShiftLike): number {
  return sumAmounts(opt.speedpoints, (sp) => sp.optAmount);
}

export function shopAccountTotal(shop: Pick<CashierShift, 'accounts'>): number {
  return sumAmounts(shop.accounts, (account) => account.amount);
}

export function optAccountTotal(opt: OptShiftLike): number {
  return sumAmounts(opt.accounts, (account) => account.amount);
}

export function shopManualOtherAdjustmentsTotal(shop: Pick<CashierShift, 'otherAdjustments'>): number {
  return sumAmounts(shop.otherAdjustments, (adjustment) => adjustment.amount);
}

export function shopSection8Total(
  shop: Pick<CashierShift, 'otherAdjustments' | 'returns_mop' | 'returnsNotCaptured' | 'attendantShortOver'>,
): number {
  return (
    shopManualOtherAdjustmentsTotal(shop) +
    (shop.returns_mop ?? 0) +
    (shop.returnsNotCaptured ?? 0) +
    (shop.attendantShortOver ?? 0)
  );
}

/** Cashier Daily shop Short/(Over): includes net payout definition and subtracts lotto payout separately. */
export function shopShortOver(shop: CashierShift): number {
  return (
    shopTotalTakings(shop) -
    shopCashConnectTotal(shop) -
    shopSpeedpointTotal(shop) -
    shopAccountTotal(shop) -
    shopManualOtherAdjustmentsTotal(shop) -
    (shop.returns_mop ?? 0) -
    (shop.returnsNotCaptured ?? 0) -
    (shop.lottoPayouts ?? 0) -
    (shop.attendantShortOver ?? 0)
  );
}

export function optShortOver(opt: OptShiftLike): number {
  return optNetSales(opt) - optSpeedpointTotal(opt) - optAccountTotal(opt);
}

export function cashupShortOver(c: DailyCashup): { shopDiff: number; optDiff: number; totalDiff: number } {
  const shopDiff = shopShortOver(c.shop);
  const optDiff = optShortOver(c.opt);
  return { shopDiff, optDiff, totalDiff: shopDiff + optDiff };
}

export function cashupPayoutsTotal(c: DailyCashup): number {
  return shopPayoutsTotal(c.shop);
}

export function cashupReceiptsTotal(c: DailyCashup): number {
  return shopReceiptsTotal(c.shop);
}
