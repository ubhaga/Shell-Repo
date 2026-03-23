import { useState } from 'react';
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMasterDataStore } from '@/store/masterDataStore';
import { toast } from '@/hooks/use-toast';

interface EditableListProps {
  title: string;
  color: string;
  items: string[];
  onAdd: (item: string) => void;
  onUpdate: (oldItem: string, newItem: string) => void;
  onDelete: (item: string) => void;
}

function EditableList({ title, color, items, onAdd, onUpdate, onDelete }: EditableListProps) {
  const [newItem, setNewItem] = useState('');
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const handleAdd = () => {
    const trimmed = newItem.trim();
    if (!trimmed) return;
    if (items.map(i => i.toLowerCase()).includes(trimmed.toLowerCase())) {
      toast({ title: 'Duplicate', description: `"${trimmed}" already exists.`, variant: 'destructive' });
      return;
    }
    onAdd(trimmed);
    setNewItem('');
    toast({ title: 'Added', description: `"${trimmed}" added to ${title}.` });
  };

  const startEdit = (item: string) => {
    setEditingItem(item);
    setEditValue(item);
  };

  const confirmEdit = () => {
    const trimmed = editValue.trim();
    if (!trimmed || !editingItem) return;
    if (trimmed !== editingItem && items.map(i => i.toLowerCase()).includes(trimmed.toLowerCase())) {
      toast({ title: 'Duplicate', description: `"${trimmed}" already exists.`, variant: 'destructive' });
      return;
    }
    onUpdate(editingItem, trimmed);
    setEditingItem(null);
    toast({ title: 'Updated', description: `Renamed to "${trimmed}".` });
  };

  const cancelEdit = () => setEditingItem(null);

  const handleDelete = (item: string) => {
    onDelete(item);
    toast({ title: 'Removed', description: `"${item}" removed.` });
  };

  const sorted = [...items].sort((a, b) => a.localeCompare(b));

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className={`${color} text-white px-4 py-2.5 font-semibold text-sm flex items-center justify-between`}>
        <span>{title}</span>
        <span className="text-xs font-normal opacity-80">{items.length} items</span>
      </div>

      {/* Add new */}
      <div className="flex gap-2 p-3 border-b bg-muted/20">
        <input
          value={newItem}
          onChange={e => setNewItem(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder={`Add new ${title.toLowerCase().replace(/s$/, '')}...`}
          className="flex-1 text-sm border border-input rounded-md px-3 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <Button size="sm" onClick={handleAdd} className="shrink-0">
          <Plus className="h-3.5 w-3.5 mr-1" /> Add
        </Button>
      </div>

      {/* List */}
      <div className="max-h-72 overflow-y-auto divide-y">
        {sorted.map(item => (
          <div key={item} className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/30 group">
            {editingItem === item ? (
              <>
                <input
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') confirmEdit(); if (e.key === 'Escape') cancelEdit(); }}
                  autoFocus
                  className="flex-1 text-sm border border-input rounded px-2 py-0.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button onClick={confirmEdit} className="text-green-600 hover:text-green-700 p-1">
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button onClick={cancelEdit} className="text-muted-foreground hover:text-foreground p-1">
                  <X className="h-3.5 w-3.5" />
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm">{item}</span>
                <button onClick={() => startEdit(item)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground p-1 transition-opacity">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => handleDelete(item)}
                  className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive/70 p-1 transition-opacity">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        ))}
        {items.length === 0 && (
          <div className="px-3 py-4 text-sm text-muted-foreground text-center">No items yet</div>
        )}
      </div>
    </div>
  );
}

export function MasterDataSettings() {
  const store = useMasterDataStore();

  return (
    <div className="space-y-4">
      <div className="bg-card border rounded-lg p-4">
        <h2 className="text-base font-bold text-foreground">Master Data / Settings</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Manage the lists used across the cashup forms. Hover over an item to edit or delete it.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <EditableList
          title="Payout Suppliers"
          color="bg-red-600"
          items={store.payoutSuppliers}
          onAdd={item => store.addPayoutSupplier(item)}
          onUpdate={(old, next) => store.updatePayoutSupplier(old, next)}
          onDelete={item => store.deletePayoutSupplier(item)}
        />
        <EditableList
          title="EFT / Non-Cash Suppliers"
          color="bg-orange-600"
          items={store.eftSuppliers}
          onAdd={item => store.addEftSupplier(item)}
          onUpdate={(old, next) => store.updateEftSupplier(old, next)}
          onDelete={item => store.deleteEftSupplier(item)}
        />
        <EditableList
          title="Accounts (Debtors)"
          color="bg-blue-600"
          items={store.accounts}
          onAdd={item => store.addAccount(item)}
          onUpdate={(old, next) => store.updateAccount(old, next)}
          onDelete={item => store.deleteAccount(item)}
        />
        <EditableList
          title="Cashier Names"
          color="bg-green-700"
          items={store.cashierNames}
          onAdd={item => store.addCashierName(item)}
          onUpdate={(old, next) => store.updateCashierName(old, next)}
          onDelete={item => store.deleteCashierName(item)}
        />
        <EditableList
          title="Manager Names"
          color="bg-purple-700"
          items={store.managerNames}
          onAdd={item => store.addManagerName(item)}
          onUpdate={(old, next) => store.updateManagerName(old, next)}
          onDelete={item => store.deleteManagerName(item)}
        />
      </div>
    </div>
  );
}
