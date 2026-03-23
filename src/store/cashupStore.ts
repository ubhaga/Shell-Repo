import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DailyCashup, ManagerDailyEntry, MonthlyBranchFigures } from '@/types/cashup';
import { v4 as uuidv4 } from 'uuid';

interface CashupStore {
  cashups: DailyCashup[];
  managerEntries: ManagerDailyEntry[];
  monthlyFigures: MonthlyBranchFigures[];
  
  // Cashier actions
  addCashup: (cashup: Omit<DailyCashup, 'id'>) => string;
  updateCashup: (id: string, cashup: Partial<DailyCashup>) => void;
  deleteCashup: (id: string) => void;
  getCashupByDate: (date: string) => DailyCashup | undefined;
  
  // Manager daily actions
  addManagerEntry: (entry: Omit<ManagerDailyEntry, 'id'>) => string;
  updateManagerEntry: (id: string, entry: Partial<ManagerDailyEntry>) => void;
  getManagerEntryByDate: (date: string) => ManagerDailyEntry | undefined;
  
  // Monthly actions
  addMonthlyFigures: (figures: Omit<MonthlyBranchFigures, 'id'>) => string;
  updateMonthlyFigures: (id: string, figures: Partial<MonthlyBranchFigures>) => void;
  getMonthlyFiguresByMonth: (month: string) => MonthlyBranchFigures | undefined;
}

export const useCashupStore = create<CashupStore>()(
  persist(
    (set, get) => ({
      cashups: [],
      managerEntries: [],
      monthlyFigures: [],

      addCashup: (cashup) => {
        const id = uuidv4();
        set((s) => ({ cashups: [...s.cashups, { ...cashup, id }] }));
        return id;
      },
      updateCashup: (id, cashup) =>
        set((s) => ({ cashups: s.cashups.map((c) => (c.id === id ? { ...c, ...cashup } : c)) })),
      deleteCashup: (id) =>
        set((s) => ({ cashups: s.cashups.filter((c) => c.id !== id) })),
      getCashupByDate: (date) => get().cashups.find((c) => c.date === date),

      addManagerEntry: (entry) => {
        const id = uuidv4();
        set((s) => ({ managerEntries: [...s.managerEntries, { ...entry, id }] }));
        return id;
      },
      updateManagerEntry: (id, entry) =>
        set((s) => ({ managerEntries: s.managerEntries.map((e) => (e.id === id ? { ...e, ...entry } : e)) })),
      getManagerEntryByDate: (date) => get().managerEntries.find((e) => e.date === date),

      addMonthlyFigures: (figures) => {
        const id = uuidv4();
        set((s) => ({ monthlyFigures: [...s.monthlyFigures, { ...figures, id }] }));
        return id;
      },
      updateMonthlyFigures: (id, figures) =>
        set((s) => ({ monthlyFigures: s.monthlyFigures.map((f) => (f.id === id ? { ...f, ...figures } : f)) })),
      getMonthlyFiguresByMonth: (month) => get().monthlyFigures.find((f) => f.month === month),
    }),
    {
      name: 'cashup-store',
      version: 2,
      migrate: (persisted: unknown, version: number) => {
        if (version < 2) {
          // Rename transferFromCoin -> transferFromCoins in all manager entries
          const state = persisted as { managerEntries?: Array<Record<string, unknown>> };
          if (state?.managerEntries) {
            state.managerEntries = state.managerEntries.map(e => {
              if ('transferFromCoin' in e) {
                const { transferFromCoin, ...rest } = e;
                return { ...rest, transferFromCoins: transferFromCoin ?? 0 };
              }
              return e;
            });
          }
        }
        return persisted;
      },
    }
  )
);
