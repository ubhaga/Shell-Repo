import { create } from 'zustand';
import {
  SUPPLIERS,
  ACCOUNTS as DEFAULT_ACCOUNTS,
  CASHIER_NAMES as DEFAULT_CASHIER_NAMES,
  MANAGER_NAMES as DEFAULT_MANAGER_NAMES,
  CATEGORIES as DEFAULT_CATEGORIES,
} from '@/data/masterData';
import { supabase } from '@/integrations/supabase/client';

const DEFAULT_EFT_SUPPLIERS = [...SUPPLIERS].sort();

interface MasterDataStore {
  payoutSuppliers: string[];
  eftSuppliers: string[];
  accounts: string[];
  cashierNames: string[];
  managerNames: string[];
  categories: string[];
  loaded: boolean;

  loadAll: () => Promise<void>;

  addPayoutSupplier: (name: string) => void;
  updatePayoutSupplier: (old: string, next: string) => void;
  deletePayoutSupplier: (name: string) => void;

  addEftSupplier: (name: string) => void;
  updateEftSupplier: (old: string, next: string) => void;
  deleteEftSupplier: (name: string) => void;

  addAccount: (name: string) => void;
  updateAccount: (old: string, next: string) => void;
  deleteAccount: (name: string) => void;

  addCashierName: (name: string) => void;
  updateCashierName: (old: string, next: string) => void;
  deleteCashierName: (name: string) => void;

  addManagerName: (name: string) => void;
  updateManagerName: (old: string, next: string) => void;
  deleteManagerName: (name: string) => void;

  addCategory: (name: string) => void;
  updateCategory: (old: string, next: string) => void;
  deleteCategory: (name: string) => void;
}

const replace = (list: string[], old: string, next: string) =>
  list.map(i => (i === old ? next : i));

// Persist a single key to the master_data table
async function persistKey(key: string, data: string[]) {
  await supabase
    .from('master_data')
    .upsert({ key, data: data as unknown as never, updated_at: new Date().toISOString() } as never, { onConflict: 'key' });
}

export const useMasterDataStore = create<MasterDataStore>()((set, get) => ({
  payoutSuppliers: [...SUPPLIERS].sort(),
  eftSuppliers: DEFAULT_EFT_SUPPLIERS,
  accounts: [...DEFAULT_ACCOUNTS],
  cashierNames: [...DEFAULT_CASHIER_NAMES],
  managerNames: [...DEFAULT_MANAGER_NAMES],
  categories: [...DEFAULT_CATEGORIES].sort(),
  loaded: false,

  loadAll: async () => {
    const { data } = await supabase.from('master_data').select('*');
    if (data && data.length > 0) {
      const map: Record<string, string[]> = {};
      data.forEach((r: { key: string; data: unknown }) => { map[r.key] = r.data as string[]; });
      set({
        payoutSuppliers: map.payoutSuppliers ?? get().payoutSuppliers,
        eftSuppliers: map.eftSuppliers ?? get().eftSuppliers,
        accounts: map.accounts ?? get().accounts,
        cashierNames: map.cashierNames ?? get().cashierNames,
        managerNames: map.managerNames ?? get().managerNames,
        categories: map.categories ?? get().categories,
        loaded: true,
      });
    } else {
      // First time: seed defaults to DB
      const state = get();
      await Promise.all([
        persistKey('payoutSuppliers', state.payoutSuppliers),
        persistKey('eftSuppliers', state.eftSuppliers),
        persistKey('accounts', state.accounts),
        persistKey('cashierNames', state.cashierNames),
        persistKey('managerNames', state.managerNames),
        persistKey('categories', state.categories),
      ]);
      set({ loaded: true });
    }
  },

  addPayoutSupplier: (name) => {
    set(s => {
      const next = [...s.payoutSuppliers, name].sort();
      persistKey('payoutSuppliers', next);
      return { payoutSuppliers: next };
    });
  },
  updatePayoutSupplier: (old, next) => {
    set(s => {
      const list = replace(s.payoutSuppliers, old, next).sort();
      persistKey('payoutSuppliers', list);
      return { payoutSuppliers: list };
    });
  },
  deletePayoutSupplier: (name) => {
    set(s => {
      const list = s.payoutSuppliers.filter(i => i !== name);
      persistKey('payoutSuppliers', list);
      return { payoutSuppliers: list };
    });
  },

  addEftSupplier: (name) => {
    set(s => {
      const next = [...s.eftSuppliers, name].sort();
      persistKey('eftSuppliers', next);
      return { eftSuppliers: next };
    });
  },
  updateEftSupplier: (old, next) => {
    set(s => {
      const list = replace(s.eftSuppliers, old, next).sort();
      persistKey('eftSuppliers', list);
      return { eftSuppliers: list };
    });
  },
  deleteEftSupplier: (name) => {
    set(s => {
      const list = s.eftSuppliers.filter(i => i !== name);
      persistKey('eftSuppliers', list);
      return { eftSuppliers: list };
    });
  },

  addAccount: (name) => {
    set(s => {
      const next = [...s.accounts, name];
      persistKey('accounts', next);
      return { accounts: next };
    });
  },
  updateAccount: (old, next) => {
    set(s => {
      const list = replace(s.accounts, old, next);
      persistKey('accounts', list);
      return { accounts: list };
    });
  },
  deleteAccount: (name) => {
    set(s => {
      const list = s.accounts.filter(i => i !== name);
      persistKey('accounts', list);
      return { accounts: list };
    });
  },

  addCashierName: (name) => {
    set(s => {
      const next = [...s.cashierNames, name];
      persistKey('cashierNames', next);
      return { cashierNames: next };
    });
  },
  updateCashierName: (old, next) => {
    set(s => {
      const list = replace(s.cashierNames, old, next);
      persistKey('cashierNames', list);
      return { cashierNames: list };
    });
  },
  deleteCashierName: (name) => {
    set(s => {
      const list = s.cashierNames.filter(i => i !== name);
      persistKey('cashierNames', list);
      return { cashierNames: list };
    });
  },

  addManagerName: (name) => {
    set(s => {
      const next = [...s.managerNames, name];
      persistKey('managerNames', next);
      return { managerNames: next };
    });
  },
  updateManagerName: (old, next) => {
    set(s => {
      const list = replace(s.managerNames, old, next);
      persistKey('managerNames', list);
      return { managerNames: list };
    });
  },
  deleteManagerName: (name) => {
    set(s => {
      const list = s.managerNames.filter(i => i !== name);
      persistKey('managerNames', list);
      return { managerNames: list };
    });
  },

  addCategory: (name) => {
    set(s => {
      const next = [...s.categories, name].sort();
      persistKey('categories', next);
      return { categories: next };
    });
  },
  updateCategory: (old, next) => {
    set(s => {
      const list = replace(s.categories, old, next).sort();
      persistKey('categories', list);
      return { categories: list };
    });
  },
  deleteCategory: (name) => {
    set(s => {
      const list = s.categories.filter(i => i !== name);
      persistKey('categories', list);
      return { categories: list };
    });
  },
}));
