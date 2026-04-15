import { useState } from 'react';
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMasterDataStore, type TankDescription } from '@/store/masterDataStore';
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
    <div className="space-y-6">
      <div className="bg-card border rounded-lg p-4">
        <h2 className="text-base font-bold text-foreground">Master Data / Settings</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Manage the lists used across the cashup forms. Hover over an item to edit or delete it.
        </p>
      </div>

      {/* Section 1.1 & 1.2 — Invoice Tables */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 px-1">
          1.1 Payout Invoice Suppliers &amp; 1.2 EFT / Non-Cash Invoice Suppliers
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <EditableList
            title="Payout Invoice Suppliers (1.1)"
            color="bg-red-600"
            items={store.payoutSuppliers}
            onAdd={item => store.addPayoutSupplier(item)}
            onUpdate={(old, next) => store.updatePayoutSupplier(old, next)}
            onDelete={item => store.deletePayoutSupplier(item)}
          />
          <EditableList
            title="EFT / Non-Cash Invoice Suppliers (1.2)"
            color="bg-orange-600"
            items={store.eftSuppliers}
            onAdd={item => store.addEftSupplier(item)}
            onUpdate={(old, next) => store.updateEftSupplier(old, next)}
            onDelete={item => store.deleteEftSupplier(item)}
          />
          <EditableList
            title="Invoice Categories (1.1 &amp; 1.2)"
            color="bg-amber-700"
            items={store.categories}
            onAdd={item => store.addCategory(item)}
            onUpdate={(old, next) => store.updateCategory(old, next)}
            onDelete={item => store.deleteCategory(item)}
          />
        </div>
      </div>

      {/* Other master data */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 px-1">
          Other Lists
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
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

      {/* Tank Descriptions */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 px-1">
          Fuel Tanks
        </h3>
        <TankDescriptionList />
      </div>
    </div>
  );
}

function TankDescriptionList() {
  const store = useMasterDataStore();
  const [newTank, setNewTank] = useState({ tankNumber: '', grade: '', size: '', color: '#3B82F6' });
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editVal, setEditVal] = useState({ tankNumber: '', grade: '', size: '', color: '#3B82F6' });

  const handleAdd = () => {
    if (!newTank.tankNumber.trim() || !newTank.grade.trim()) return;
    store.addTank({ tankNumber: newTank.tankNumber.trim(), grade: newTank.grade.trim(), size: parseFloat(newTank.size) || 0, color: newTank.color });
    setNewTank({ tankNumber: '', grade: '', size: '', color: '#3B82F6' });
    toast({ title: 'Tank added' });
  };

  const startEdit = (i: number) => {
    const t = store.tanks[i];
    setEditIdx(i);
    setEditVal({ tankNumber: t.tankNumber, grade: t.grade, size: String(t.size), color: t.color || '#3B82F6' });
  };

  const confirmEdit = () => {
    if (editIdx === null) return;
    store.updateTank(editIdx, { tankNumber: editVal.tankNumber.trim(), grade: editVal.grade.trim(), size: parseFloat(editVal.size) || 0, color: editVal.color });
    setEditIdx(null);
    toast({ title: 'Tank updated' });
  };

  return (
    <div className="border rounded-lg overflow-hidden max-w-2xl">
      <div className="bg-emerald-700 text-white px-4 py-2.5 font-semibold text-sm flex items-center justify-between">
        <span>Tank Descriptions</span>
        <span className="text-xs font-normal opacity-80">{store.tanks.length} tanks</span>
      </div>
      <div className="flex gap-2 p-3 border-b bg-muted/20">
        <input value={newTank.tankNumber} onChange={e => setNewTank(p => ({ ...p, tankNumber: e.target.value }))}
          placeholder="Tank #" className="w-24 text-sm border border-input rounded-md px-2 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
        <input value={newTank.grade} onChange={e => setNewTank(p => ({ ...p, grade: e.target.value }))}
          placeholder="Grade (e.g. ULP95)" className="flex-1 text-sm border border-input rounded-md px-2 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
        <input value={newTank.size} onChange={e => setNewTank(p => ({ ...p, size: e.target.value }))} type="number"
          placeholder="Size (L)" className="w-28 text-sm border border-input rounded-md px-2 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
        <Button size="sm" onClick={handleAdd} className="shrink-0"><Plus className="h-3.5 w-3.5 mr-1" /> Add</Button>
      </div>
      <div className="divide-y">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/30 text-xs font-medium text-muted-foreground">
          <span className="w-24">Tank #</span>
          <span className="flex-1">Grade</span>
          <span className="w-28 text-right">Size (L)</span>
          <span className="w-16"></span>
        </div>
        {store.tanks.map((tank, i) => (
          <div key={i} className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/30 group">
            {editIdx === i ? (
              <>
                <input value={editVal.tankNumber} onChange={e => setEditVal(p => ({ ...p, tankNumber: e.target.value }))}
                  className="w-24 text-sm border border-input rounded px-2 py-0.5 bg-background" autoFocus />
                <input value={editVal.grade} onChange={e => setEditVal(p => ({ ...p, grade: e.target.value }))}
                  className="flex-1 text-sm border border-input rounded px-2 py-0.5 bg-background" />
                <input value={editVal.size} onChange={e => setEditVal(p => ({ ...p, size: e.target.value }))} type="number"
                  className="w-28 text-sm border border-input rounded px-2 py-0.5 bg-background text-right" />
                <div className="w-16 flex gap-1">
                  <button onClick={confirmEdit} className="text-green-600 p-1"><Check className="h-3.5 w-3.5" /></button>
                  <button onClick={() => setEditIdx(null)} className="text-muted-foreground p-1"><X className="h-3.5 w-3.5" /></button>
                </div>
              </>
            ) : (
              <>
                <span className="w-24 text-sm font-medium">{tank.tankNumber}</span>
                <span className="flex-1 text-sm">{tank.grade}</span>
                <span className="w-28 text-sm text-right">{tank.size.toLocaleString()}</span>
                <div className="w-16 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => startEdit(i)} className="text-muted-foreground hover:text-foreground p-1"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => { store.deleteTank(i); toast({ title: 'Tank removed' }); }} className="text-destructive hover:text-destructive/70 p-1"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </>
            )}
          </div>
        ))}
        {store.tanks.length === 0 && <div className="px-3 py-4 text-sm text-muted-foreground text-center">No tanks configured. Add your first tank above.</div>}
      </div>
    </div>
  );
}
