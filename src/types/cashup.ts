export interface PayoutLine {
  id: string;
  vendor: string;
  amount: number;
  isLotto?: boolean;
}

export interface ReceiptLine {
  id: string;
  type: string;
  seqNo: string;
  amount: number;
}

export interface OtherAdjustment {
  id: string;
  explanation: string;
  amount: number;
}

export interface SpeedpointEntry {
  terminal: string;
  batchNo: string;
  shopAmount: number;
  optAmount: number;
}

export interface AccountEntry {
  id: string;
  name: string;
  amount: number;
}

export interface CashierShift {
  // Section 1 - Income
  income: number;
  returns: number; // yesterday shift
  returns_today: number; // new field
  // Section 2 - Payouts
  payouts: PayoutLine[];
  lottoPayouts: number;
  // Section 3 - Receipts
  receipts: ReceiptLine[];
  // MOP Cash (shop only)
  cashConnectTotal: number;
  cashDepositedBanking: number;
  easyPay: number;
  deepFrozenCC: number;
  coins: number;
  // MOP Speedpoints
  speedpoints: SpeedpointEntry[];
  // MOP Account
  accounts: AccountEntry[];
  // Other adjustments
  otherAdjustments: OtherAdjustment[];
  returns_mop: number;
  returnsNotCaptured: number;
  attendantShortOver: number;
  attendantName: string;
}

export interface DailyCashup {
  id: string;
  date: string;
  month: string;
  enteredBy: string;
  shopShiftNumber: number;
  optShiftNumber: number;
  cashierName: string;
  shop: CashierShift;
  opt: Omit<
    CashierShift,
    | "cashConnectTotal"
    | "cashDepositedBanking"
    | "easyPay"
    | "deepFrozenCC"
    | "coins"
    | "receipts"
    | "otherAdjustments"
    | "accounts"
    | "payouts"
    | "lottoPayouts"
    | "returns_mop"
    | "returnsNotCaptured"
    | "attendantShortOver"
    | "attendantName"
  > & {
    income: number;
    returns: number;
    speedpoints: SpeedpointEntry[];
    accounts: AccountEntry[];
  };
  notes: string;
  locked: boolean;
}

export interface InvoiceLine {
  id: string;
  supplier: string;
  category: string;
  branchDocNum: string;
  inclusive: number;
  vat: number;
}

export interface ManagerDailyEntry {
  id: string;
  date: string;
  cashupId: string;
  enteredBy: string;
  explanations: string;
  // Payout invoices
  payoutInvoices: InvoiceLine[];
  // EFT invoices
  eftInvoices: InvoiceLine[];
  // Cash reconciliation
  coinsOpeningBalance: number;
  easypayOpeningBalance: number;
  cashConnectOpeningBalance: number;
  dailyCoins: number;
  cashDepositedEasypay: number;
  cashDepositedCashConnect: number;
  ccBagClosureCoins: number;
  ccBagClosureEasypay: number;
  ccBagClosureCashConnect: number;
  transferFromCoins: number;
  // Branch day end
  branchDayEndTotal: number;
  branchDayEndVat: number;
  invoiceNotes: string;
  cashReconcNotes: string;
  bankChargesRate: number; // cents per R100 inclusive
  bankCharges: number;
  banking: number;
  deepFrozenCC: number;
  blueLabelComm: number;
  easypayComm: number;
  lottoComm: number;
  lottoNetSalesComm: number;
  lottoPayoutComm: number;
  locked: boolean;
}

export interface MonthlyBranchFigures {
  id: string;
  month: string;
  enteredBy: string;
  // Branch report figures
  branchNetSales: number;
  branchTotalPayouts: number;
  branchTotalReceipts: number;
  branchTotalInvoicesCapital: number;
  branchTotalInvoicesVat: number;
  // Month End Report (Other)
  salesCStore: number;
  salesWslDsl: number;
  salesFuel: number;
  salesGas: number;
  salesOil: number;
  adjCStore: number;
  adjWslDsl: number;
  adjFuel: number;
  adjGas: number;
  adjOil: number;
  adjVat: number;
  vatTaxAmount: number;
  // Explanations per metric
  explanationNetSales: string;
  explanationPayouts: string;
  explanationReceipts: string;
  explanationInvoices: string;
  explanationVat: string;
  explanationBankCharges: string;
  // Bank charges (section 6)
  cashConnectInvoiceInclVat: number;
  bankChargesAdj: number;
  // 6.2 Cash Connect Balance (Excl EP)
  ccXero: number;
  ccUnbankedDeposit: number;
  // 6.3 Petty Cash
  pettyCashRecon: number;
  pettyCashXero: number;
  pettyCashUnbankedDeposit: number;
  // 3. EFT Recon
  eftXero: number;
  eftUnbankedDeposit: number;
  // Airtime / Lotto month-end balances
  airtimeBldBalance: number;
  airtimeEasypayBalance: number;
  airtimeLottoBalance: number;
  airtimeBldXero: number;
  airtimeEasypayXero: number;
  airtimeLottoXero: number;
  // Misc
  notes: string;
}

export type DashboardStatus = "green" | "red" | "pending";

export interface DailyDashboardMetric {
  label: string;
  spreadsheetValue: number;
  branchValue: number;
  status: DashboardStatus;
}
