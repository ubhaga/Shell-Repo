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

export interface TankDescription {
  tankNumber: string;
  grade: string;
  size: number;
  color: string; // hex color for reports/recons
}

/** Look up tank color by gradeId (tank number) or grade description */
export function getTankColor(tanks: TankDescription[], gradeIdOrDesc: string): string | undefined {
  const t = tanks.find(t => t.tankNumber === gradeIdOrDesc || t.grade.toLowerCase() === gradeIdOrDesc.toLowerCase());
  return t?.color;
}

interface MasterDataStore {
  payoutSuppliers: string[];
  eftSuppliers: string[];
  directlyExpensedSuppliers: string[];
  accounts: string[];
  /** Optional account number per debtor account (keyed by account name) */
  accountNumbers: Record<string, string>;
  cashierNames: string[];
  managerNames: string[];
  categories: string[];
  tanks: TankDescription[];
  loaded: boolean;

  loadAll: () => Promise<void>;

  addPayoutSupplier: (name: string) => void;
  updatePayoutSupplier: (old: string, next: string) => void;
  deletePayoutSupplier: (name: string) => void;

  addEftSupplier: (name: string) => void;
  updateEftSupplier: (old: string, next: string) => void;
  deleteEftSupplier: (name: string) => void;

  addDirectlyExpensedSupplier: (name: string) => void;
  updateDirectlyExpensedSupplier: (old: string, next: string) => void;
  deleteDirectlyExpensedSupplier: (name: string) => void;

  addAccount: (name: string) => void;
  updateAccount: (old: string, next: string) => void;
  deleteAccount: (name: string) => void;
  setAccountNumber: (name: string, number: string) => void;

  addCashierName: (name: string) => void;
  updateCashierName: (old: string, next: string) => void;
  deleteCashierName: (name: string) => void;

  addManagerName: (name: string) => void;
  updateManagerName: (old: string, next: string) => void;
  deleteManagerName: (name: string) => void;

  addCategory: (name: string) => void;
  updateCategory: (old: string, next: string) => void;
  deleteCategory: (name: string) => void;

  addTank: (tank: TankDescription) => void;
  updateTank: (index: number, tank: TankDescription) => void;
  deleteTank: (index: number) => void;
}

const replace = (list: string[], old: string, next: string) =>
  list.map(i => (i === old ? next : i));

// Persist a single key to the master_data table
async function persistKey(key: string, data: unknown) {
  await supabase
    .from('master_data')
    .upsert({ key, data: data as never, updated_at: new Date().toISOString() } as never, { onConflict: 'key' });
}

export const useMasterDataStore = create<MasterDataStore>()((set, get) => ({
  payoutSuppliers: [...SUPPLIERS].sort(),
  eftSuppliers: DEFAULT_EFT_SUPPLIERS,
  directlyExpensedSuppliers: ['Dawn Consultants', 'Status Hygiene'],
  accounts: [...DEFAULT_ACCOUNTS],
  accountNumbers: {} as Record<string, string>,
  cashierNames: [...DEFAULT_CASHIER_NAMES],
  managerNames: [...DEFAULT_MANAGER_NAMES],
  categories: [...DEFAULT_CATEGORIES].sort(),
  tanks: [] as TankDescription[],
  loaded: false,

  loadAll: async () => {
    const { data } = await supabase.from('master_data').select('*');
    if (data && data.length > 0) {
      const map: Record<string, unknown> = {};
      data.forEach((r: { key: string; data: unknown }) => { map[r.key] = r.data; });
      set({
        payoutSuppliers: (map.payoutSuppliers as string[]) ?? get().payoutSuppliers,
        eftSuppliers: (map.eftSuppliers as string[]) ?? get().eftSuppliers,
        directlyExpensedSuppliers: (map.directlyExpensedSuppliers as string[]) ?? get().directlyExpensedSuppliers,
        accounts: (map.accounts as string[]) ?? get().accounts,
        accountNumbers: (map.accountNumbers as Record<string, string>) ?? get().accountNumbers,
        cashierNames: (map.cashierNames as string[]) ?? get().cashierNames,
        managerNames: (map.managerNames as string[]) ?? get().managerNames,
        categories: (map.categories as string[]) ?? get().categories,
        tanks: (map.tanks as TankDescription[]) ?? get().tanks,
        loaded: true,
      });
    } else {
      // First time: seed defaults to DB
      const state = get();
      await Promise.all([
        persistKey('payoutSuppliers', state.payoutSuppliers),
        persistKey('eftSuppliers', state.eftSuppliers),
        persistKey('directlyExpensedSuppliers', state.directlyExpensedSuppliers),
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

  addDirectlyExpensedSupplier: (name) => {
    set(s => {
      const next = [...s.directlyExpensedSuppliers, name].sort();
      persistKey('directlyExpensedSuppliers', next);
      return { directlyExpensedSuppliers: next };
    });
  },
  updateDirectlyExpensedSupplier: (old, next) => {
    set(s => {
      const list = replace(s.directlyExpensedSuppliers, old, next).sort();
      persistKey('directlyExpensedSuppliers', list);
      return { directlyExpensedSuppliers: list };
    });
  },
  deleteDirectlyExpensedSupplier: (name) => {
    set(s => {
      const list = s.directlyExpensedSuppliers.filter(i => i !== name);
      persistKey('directlyExpensedSuppliers', list);
      return { directlyExpensedSuppliers: list };
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
      // Migrate account number under new name
      const nums = { ...s.accountNumbers };
      if (old !== next && nums[old] !== undefined) {
        nums[next] = nums[old];
        delete nums[old];
        persistKey('accountNumbers', nums);
      }
      return { accounts: list, accountNumbers: nums };
    });
  },
  deleteAccount: (name) => {
    set(s => {
      const list = s.accounts.filter(i => i !== name);
      persistKey('accounts', list);
      const nums = { ...s.accountNumbers };
      if (nums[name] !== undefined) {
        delete nums[name];
        persistKey('accountNumbers', nums);
      }
      return { accounts: list, accountNumbers: nums };
    });
  },
  setAccountNumber: (name, number) => {
    set(s => {
      const nums = { ...s.accountNumbers };
      const trimmed = number.trim();
      if (trimmed) nums[name] = trimmed;
      else delete nums[name];
      persistKey('accountNumbers', nums);
      return { accountNumbers: nums };
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

  addTank: (tank) => {
    set(s => {
      const next = [...s.tanks, tank];
      persistKey('tanks', next);
      return { tanks: next };
    });
  },
  updateTank: (index, tank) => {
    set(s => {
      const next = [...s.tanks];
      next[index] = tank;
      persistKey('tanks', next);
      return { tanks: next };
    });
  },
  deleteTank: (index) => {
    set(s => {
      const next = s.tanks.filter((_, i) => i !== index);
      persistKey('tanks', next);
      return { tanks: next };
    });
  },
}));
