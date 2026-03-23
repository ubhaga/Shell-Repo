import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  SUPPLIERS,
  ACCOUNTS as DEFAULT_ACCOUNTS,
  CASHIER_NAMES as DEFAULT_CASHIER_NAMES,
  MANAGER_NAMES as DEFAULT_MANAGER_NAMES,
} from '@/data/masterData';

// EFT suppliers default list (same base suppliers as payout)
const DEFAULT_EFT_SUPPLIERS = [...SUPPLIERS].sort();

interface MasterDataStore {
  payoutSuppliers: string[];
  eftSuppliers: string[];
  accounts: string[];
  cashierNames: string[];
  managerNames: string[];

  // Payout suppliers
  addPayoutSupplier: (name: string) => void;
  updatePayoutSupplier: (old: string, next: string) => void;
  deletePayoutSupplier: (name: string) => void;

  // EFT suppliers
  addEftSupplier: (name: string) => void;
  updateEftSupplier: (old: string, next: string) => void;
  deleteEftSupplier: (name: string) => void;

  // Accounts
  addAccount: (name: string) => void;
  updateAccount: (old: string, next: string) => void;
  deleteAccount: (name: string) => void;

  // Cashier names
  addCashierName: (name: string) => void;
  updateCashierName: (old: string, next: string) => void;
  deleteCashierName: (name: string) => void;

  // Manager names
  addManagerName: (name: string) => void;
  updateManagerName: (old: string, next: string) => void;
  deleteManagerName: (name: string) => void;
}

const replace = (list: string[], old: string, next: string) =>
  list.map(i => (i === old ? next : i));

export const useMasterDataStore = create<MasterDataStore>()(
  persist(
    (set) => ({
      payoutSuppliers: [...SUPPLIERS].sort(),
      eftSuppliers: DEFAULT_EFT_SUPPLIERS,
      accounts: [...DEFAULT_ACCOUNTS],
      cashierNames: [...DEFAULT_CASHIER_NAMES],
      managerNames: [...DEFAULT_MANAGER_NAMES],

      addPayoutSupplier: (name) => set(s => ({ payoutSuppliers: [...s.payoutSuppliers, name].sort() })),
      updatePayoutSupplier: (old, next) => set(s => ({ payoutSuppliers: replace(s.payoutSuppliers, old, next).sort() })),
      deletePayoutSupplier: (name) => set(s => ({ payoutSuppliers: s.payoutSuppliers.filter(i => i !== name) })),

      addEftSupplier: (name) => set(s => ({ eftSuppliers: [...s.eftSuppliers, name].sort() })),
      updateEftSupplier: (old, next) => set(s => ({ eftSuppliers: replace(s.eftSuppliers, old, next).sort() })),
      deleteEftSupplier: (name) => set(s => ({ eftSuppliers: s.eftSuppliers.filter(i => i !== name) })),

      addAccount: (name) => set(s => ({ accounts: [...s.accounts, name] })),
      updateAccount: (old, next) => set(s => ({ accounts: replace(s.accounts, old, next) })),
      deleteAccount: (name) => set(s => ({ accounts: s.accounts.filter(i => i !== name) })),

      addCashierName: (name) => set(s => ({ cashierNames: [...s.cashierNames, name] })),
      updateCashierName: (old, next) => set(s => ({ cashierNames: replace(s.cashierNames, old, next) })),
      deleteCashierName: (name) => set(s => ({ cashierNames: s.cashierNames.filter(i => i !== name) })),

      addManagerName: (name) => set(s => ({ managerNames: [...s.managerNames, name] })),
      updateManagerName: (old, next) => set(s => ({ managerNames: replace(s.managerNames, old, next) })),
      deleteManagerName: (name) => set(s => ({ managerNames: s.managerNames.filter(i => i !== name) })),
    }),
    { name: 'master-data-store', version: 1 }
  )
);
