import { useState, useEffect } from "react";
import { format } from "date-fns";
import { CashierDailyForm } from "@/components/cashier/CashierDailyForm";
import { ManagerDailyForm } from "@/components/manager/ManagerDailyForm";
import { ManagerMonthlyForm } from "@/components/manager/ManagerMonthlyForm";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { Reports } from "@/components/reports/Reports";
import { MasterDataSettings } from "@/components/settings/MasterDataSettings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LayoutDashboard, ClipboardList, Briefcase, BarChart3, CalendarCheck, Settings, Loader2 } from "lucide-react";
import { useCashupStore } from "@/store/cashupStore";
import { useMasterDataStore } from "@/store/masterDataStore";

export default function Index() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const cashupLoaded = useCashupStore(s => s.loaded);
  const loadCashups = useCashupStore(s => s.loadAll);
  const masterLoaded = useMasterDataStore(s => s.loaded);
  const loadMaster = useMasterDataStore(s => s.loadAll);

  useEffect(() => {
    if (!cashupLoaded) loadCashups();
    if (!masterLoaded) loadMaster();
  }, []);

  if (!cashupLoaded || !masterLoaded) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card shadow-sm">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary rounded-lg p-2">
              <ClipboardList className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">Shell Craighall Cashup System</h1>
              <p className="text-xs text-muted-foreground">Daily Cashup & Reconciliation</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={selectedDate}
              min="2026-01-01"
              onChange={(e) => setSelectedDate(e.target.value)}
              className="text-sm border border-input rounded-md px-3 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-6 w-full mb-4">
            <TabsTrigger value="dashboard" className="flex items-center gap-1.5 text-xs">
              <LayoutDashboard className="h-3.5 w-3.5" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="cashier" className="flex items-center gap-1.5 text-xs">
              <ClipboardList className="h-3.5 w-3.5" />
              Cashier Daily
            </TabsTrigger>
            <TabsTrigger value="manager-daily" className="flex items-center gap-1.5 text-xs">
              <Briefcase className="h-3.5 w-3.5" />
              Manager Daily
            </TabsTrigger>
            <TabsTrigger value="manager-monthly" className="flex items-center gap-1.5 text-xs">
              <CalendarCheck className="h-3.5 w-3.5" />
              Manager Monthly
            </TabsTrigger>
            <TabsTrigger value="reports" className="flex items-center gap-1.5 text-xs">
              <BarChart3 className="h-3.5 w-3.5" />
              Reports
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-1.5 text-xs">
              <Settings className="h-3.5 w-3.5" />
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            <Dashboard selectedDate={selectedDate} />
          </TabsContent>
          <TabsContent value="cashier">
            <CashierDailyForm selectedDate={selectedDate} />
          </TabsContent>
          <TabsContent value="manager-daily">
            <ManagerDailyForm selectedDate={selectedDate} />
          </TabsContent>
          <TabsContent value="manager-monthly">
            <ManagerMonthlyForm selectedDate={selectedDate} />
          </TabsContent>
          <TabsContent value="reports">
            <Reports />
          </TabsContent>
          <TabsContent value="settings">
            <MasterDataSettings />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
