import React, { useMemo, useState, useEffect } from "react";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  PieChart,
  Pie,
  Cell,
  YAxis,
} from "recharts";
import {
  Expense,
  UserSettings,
  Category,
  Income,
  WealthItem,
  UserProfile,
  BudgetItem,
  View,
  Bill,
} from "../types";
import { CATEGORY_COLORS, getCurrencySymbol } from "../constants";
import {
  TrendingUp,
  Activity,
  Landmark,
  ArrowRight,
  BrainCircuit,
  LayoutPanelLeft,
  BarChart3,
  PieChart as PieIcon,
  Percent,
  AlertTriangle,
  Sparkles,
  ArrowUpDown,
  History,
  TrendingDown,
  UserCircle2,
  X,
  ReceiptText,
  CalendarDays,
  RefreshCw,
  Grid3X3,
} from "lucide-react";
import { triggerHaptic } from "../utils/haptics";
import { analyzeBudgetSpending } from "../services/geminiService";

interface DashboardProps {
  expenses: Expense[];
  incomes: Income[];
  wealthItems: WealthItem[];
  budgetItems: BudgetItem[];
  bills: Bill[];
  settings: UserSettings;
  user: UserProfile | null;
  onCategorizeClick: () => void;
  onConfirmExpense: (id: string, category: Category) => void;
  onSmartAdd: () => void;
  onAffordabilityCheck: () => void;
  onNavigate: (view: View, filter?: string) => void;
  viewDate: Date;
  onMonthChange: (direction: number) => void;
  onGoToDate: (year: number, month: number) => void;
}

const Dashboard: React.FC<DashboardProps> = ({
  expenses,
  incomes,
  wealthItems,
  budgetItems,
  bills,
  settings,
  viewDate,
  onCategorizeClick,
  onNavigate,
}) => {
  const [trendViewMode, setTrendViewMode] = useState<"grid" | "area" | "bar">(
    "grid",
  );
  const [selectedGridDay, setSelectedGridDay] = useState<any | null>(null);
  const currencySymbol = getCurrencySymbol(settings.currency);
  const pendingCount = useMemo(
    () => expenses.filter((e) => !e.isConfirmed).length,
    [expenses],
  );
  const isCompact = settings.density === "Compact";

  useEffect(() => {
    setSelectedGridDay(null);
  }, [viewDate]);

  // Index expenses by localized/normalized date string to optimize performance on the checkerboard view
  const expensesByDate = useMemo(() => {
    const map: Record<string, Expense[]> = {};
    expenses.forEach((e) => {
      if (!e.date) return;
      const cleanDate = e.date.split("T")[0];
      const parts = cleanDate.split("-");
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const d = parseInt(parts[2], 10);
        const key = `${y}-${m}-${d}`;
        if (!map[key]) {
          map[key] = [];
        }
        map[key].push(e);
      }
    });
    return map;
  }, [expenses]);

  // Calculate grid of the last 12 months (GitHub-style 53-week checkerboard with newest first)
  const monthlySpendingGrid = useMemo(() => {
    const endDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0);
    const endOfGrid = new Date(endDate);
    const currentDayOfWeek = endOfGrid.getDay();
    if (currentDayOfWeek < 6) {
      endOfGrid.setDate(endOfGrid.getDate() + (6 - currentDayOfWeek));
    }

    const grid = [];
    // 7 rows (Sunday-Saturday)
    for (let r = 0; r < 7; r++) {
      const row = [];
      // 53 columns (newest week first on the left, oldest week last on the right)
      for (let c = 0; c < 53; c++) {
        const cellDate = new Date(endOfGrid);
        // c is the week offset (0 is the newest, 52 is the oldest)
        // 6 - r is the day of the week offset (6 is Saturday, 0 is Sunday)
        const daysBack = (c * 7) + (6 - r);
        cellDate.setDate(endOfGrid.getDate() - daysBack);

        const cy = cellDate.getFullYear();
        const cm = cellDate.getMonth() + 1;
        const cd = cellDate.getDate();
        const key = `${cy}-${cm}-${cd}`;

        const currentDayExps = expensesByDate[key] || [];
        const totalSpent = currentDayExps.reduce(
          (sum, e) => sum + e.amount,
          0,
        );

        const avgDaily = settings.monthlyIncome / 30;
        const isHighSpend = totalSpent > avgDaily;
        const isExtremeSpend = totalSpent > avgDaily * 2;
        const isAvoidSpend = currentDayExps.some((e) => e.isAvoid);

        row.push({
          date: new Date(cellDate),
          dayNumber: cd,
          monthNumber: cm - 1,
          yearNumber: cy,
          totalSpent,
          expenses: currentDayExps,
          isConfirmed: currentDayExps.every((e) => e.isConfirmed),
          isHighSpend,
          isExtremeSpend,
          isAvoidSpend,
        });
      }
      grid.push(row);
    }
    return grid;
  }, [expensesByDate, viewDate, settings.monthlyIncome]);

  const [budgetAnalysis, setBudgetAnalysis] = useState<{
    insights: Array<{
      category: string;
      type: "warning" | "info" | "danger";
      message: string;
      actionableTip: string;
    }>;
    summary: string;
  } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Cache signature to prevent duplicate AI calls on simple page transitions
  const cachedKey = useMemo(() => {
    const currentMonth = viewDate.getMonth();
    const currentYear = viewDate.getFullYear();
    const currentMonthExps = expenses.filter((e) => {
      const d = new Date(e.date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });
    return `auth-key-${currentMonthExps.length}-${budgetItems.length}-${settings.monthlyIncome}-${currentMonth}-${currentYear}`;
  }, [expenses, budgetItems, settings.monthlyIncome, viewDate]);

  const runAnalysis = async (force = false) => {
    setIsAnalyzing(true);
    setAnalysisError(null);
    try {
      if (!force) {
        const cached = localStorage.getItem(
          `budget_analysis_cache_${cachedKey}`,
        );
        if (cached) {
          setBudgetAnalysis(JSON.parse(cached));
          setIsAnalyzing(false);
          return;
        }
      }

      const result = await analyzeBudgetSpending(
        expenses,
        budgetItems,
        settings.monthlyIncome,
        currencySymbol,
      );

      setBudgetAnalysis(result);
      localStorage.setItem(
        `budget_analysis_cache_${cachedKey}`,
        JSON.stringify(result),
      );
    } catch (err: any) {
      console.error("Failed to run budget AI analysis:", err);
      setAnalysisError(err?.message || "Audit failure");
    } finally {
      setIsAnalyzing(false);
    }
  };

  useEffect(() => {
    runAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cachedKey]);

  const wealthStats = useMemo(() => {
    const assets = wealthItems
      .filter((i) => i.type === "Investment")
      .reduce((sum, i) => sum + i.value, 0);
    const liabilities = wealthItems
      .filter((i) => i.type === "Liability")
      .reduce((sum, i) => sum + i.value, 0);
    const liquid = wealthItems
      .filter(
        (i) =>
          i.type === "Investment" && ["Savings", "Cash"].includes(i.category),
      )
      .reduce((sum, i) => sum + i.value, 0);
    return {
      netWorth: Math.round(assets - liabilities),
      liquid: Math.round(liquid),
    };
  }, [wealthItems]);

  const stats = useMemo(() => {
    const m = viewDate.getMonth();
    const y = viewDate.getFullYear();
    const currentExps = expenses.filter(
      (e) =>
        e.isConfirmed &&
        new Date(e.date).getMonth() === m &&
        new Date(e.date).getFullYear() === y,
    );
    const spent = currentExps.reduce((sum, e) => sum + e.amount, 0);
    const monthlyIncomes = incomes.filter(
      (i) =>
        new Date(i.date).getMonth() === m &&
        new Date(i.date).getFullYear() === y,
    );
    const totalIncome =
      monthlyIncomes.reduce((sum, i) => sum + i.amount, 0) ||
      settings.monthlyIncome;

    const catData = (["Needs", "Wants", "Savings", "Avoids"] as const).map(
      (cat) => {
        let val;
        if (cat === "Avoids") {
          val = currentExps
            .filter((e) => e.isAvoid)
            .reduce((sum, e) => sum + e.amount, 0);
        } else {
          val = currentExps
            .filter((e) => e.category === cat && !e.isAvoid)
            .reduce((sum, e) => sum + e.amount, 0);
        }

        const splitPercentage =
          settings.split[cat as keyof typeof settings.split] || 0;
        const budget =
          cat === "Avoids"
            ? 0
            : (settings.monthlyIncome * splitPercentage) / 100;

        return {
          name: cat,
          value: val || 0.1,
          displayValue: Math.round(val),
          color: CATEGORY_COLORS[cat],
          utilization: budget > 0 ? (val / budget) * 100 : 0,
        };
      },
    );

    const surplus = totalIncome - spent;
    const retentionRate = totalIncome > 0 ? (surplus / totalIncome) * 100 : 0;
    const avoidsTotal = currentExps
      .filter((e) => e.isAvoid)
      .reduce((sum, e) => sum + e.amount, 0);
    const efficiencyRate = spent > 0 ? (1 - avoidsTotal / spent) * 100 : 100;

    const today = new Date();
    const isCurrentMonth = today.getMonth() === m && today.getFullYear() === y;
    const daysElapsed = isCurrentMonth
      ? today.getDate()
      : new Date(y, m + 1, 0).getDate();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const dailyBurn = spent / daysElapsed;
    const projectedFinish = dailyBurn * daysInMonth;

    return {
      spent: Math.round(spent),
      income: Math.round(totalIncome),
      surplus: Math.round(surplus),
      retentionRate,
      catData,
      dailyBurn,
      projectedFinish,
      efficiencyRate,
      avoidsTotal: Math.round(avoidsTotal),
    };
  }, [expenses, incomes, settings, viewDate]);

  const { trendData, categoryComparisonData } = useMemo(() => {
    const tData = [];
    const m = viewDate.getMonth();
    const y = viewDate.getFullYear();
    const prevDateObj = new Date(y, m - 1, 1);
    const pm = prevDateObj.getMonth();
    const py = prevDateObj.getFullYear();

    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    for (let i = 0; i < 6; i++) {
      const d = new Date(y, m - i, 1);
      const targetY = d.getFullYear();
      const targetM = d.getMonth() + 1; // 1-based

      const monthExps = expenses.filter((e) => {
        if (!e.date || !e.isConfirmed) return false;
        if (e.subCategory === "Transfer") return false;
        const parts = e.date.split("T")[0].split("-");
        if (parts.length < 2) return false;
        const ey = parseInt(parts[0], 10);
        const em = parseInt(parts[1], 10);
        return ey === targetY && em === targetM;
      });

      const monthLabel = `${months[d.getMonth()]}'${d.getFullYear().toString().slice(-2)}`;

      tData.push({
        month: monthLabel,
        Needs: Math.round(
          monthExps
            .filter((e) => e.category === "Needs")
            .reduce((s, e) => s + e.amount, 0),
        ),
        Wants: Math.round(
          monthExps
            .filter((e) => e.category === "Wants")
            .reduce((s, e) => s + e.amount, 0),
        ),
        Savings: Math.round(
          monthExps
            .filter((e) => e.category === "Savings")
            .reduce((s, e) => s + e.amount, 0),
        ),
        Avoids: Math.round(
          monthExps
            .filter((e) => e.category === "Avoids")
            .reduce((s, e) => s + e.amount, 0),
        ),
      });
    }

    const categories: Category[] = ["Needs", "Wants", "Savings", "Avoids"];
    const compData = categories.map((cat) => {
      const current = expenses
        .filter((e) => {
          if (!e.date || !e.isConfirmed || e.category !== cat) return false;
          if (e.subCategory === "Transfer") return false;
          const parts = e.date.split("T")[0].split("-");
          return parseInt(parts[0], 10) === y && parseInt(parts[1], 10) === (m + 1);
        })
        .reduce((s, e) => s + e.amount, 0);

      const previous = expenses
        .filter((e) => {
          if (!e.date || !e.isConfirmed || e.category !== cat) return false;
          if (e.subCategory === "Transfer") return false;
          const parts = e.date.split("T")[0].split("-");
          return parseInt(parts[0], 10) === py && parseInt(parts[1], 10) === (pm + 1);
        })
        .reduce((s, e) => s + e.amount, 0);

      return {
        name: cat,
        current: Math.round(current),
        previous: Math.round(previous),
        color: CATEGORY_COLORS[cat],
        isHigh:
          current > previous &&
          previous > 0 &&
          (current - previous) / previous > 0.15,
      };
    });

    return { trendData: tData, categoryComparisonData: compData };
  }, [expenses, viewDate]);

  const totalBillsAmount = useMemo(() => {
    return bills.filter((b) => !b.isPaid).reduce((sum, b) => sum + b.amount, 0);
  }, [bills]);

  return (
    <div
      className={`pb-32 pt-0 animate-slide-up flex flex-col ${isCompact ? "gap-1.5" : "gap-3"}`}
    >
      <div className="bg-gradient-to-r from-brand-primary to-brand-secondary px-3 py-2 rounded-xl mb-1 mx-0.5 shadow-md h-[50px] flex items-center shrink-0 border border-white/5">
        <div className="flex flex-col px-1">
          <h1 className="text-[14px] font-black text-brand-headerText uppercase leading-none tracking-tight">
            Dashboard
          </h1>
          <p className="text-[7px] font-bold text-brand-headerText/50 uppercase tracking-[0.2em] mt-1">
            Wealth Summary
          </p>
        </div>
      </div>

      <div className={`px-0.5 ${isCompact ? "space-y-1.5" : "space-y-3"}`}>
        <section
          className={`bg-brand-surface ${isCompact ? "rounded-[20px] p-3 pt-4" : "rounded-[28px] p-5 pt-7"} text-brand-text shadow-xl relative overflow-hidden flex items-center justify-between border border-brand-border`}
        >
          <div className="absolute top-0 right-0 p-2 opacity-5 rotate-12">
            <Landmark size={isCompact ? 40 : 60} />
          </div>
          <button
            onClick={() => {
              triggerHaptic();
              onNavigate("Accounts");
            }}
            className="relative z-10 flex flex-col text-left active:scale-95 transition-transform"
          >
            <p className="text-[8px] font-black uppercase tracking-[0.3em] text-indigo-500 mb-1">
              Total Worth
            </p>
            <h2
              className={`${isCompact ? "text-lg" : "text-2xl"} font-black tracking-tighter leading-none`}
            >
              <span className="text-xs opacity-40 mr-0.5 font-bold">
                {currencySymbol}
              </span>
              {Math.round(wealthStats.netWorth).toLocaleString()}
            </h2>
          </button>
          <button
            onClick={() => {
              triggerHaptic();
              onNavigate("Accounts");
            }}
            className="relative z-10 flex flex-col items-end border-l border-brand-border pl-6 text-right active:scale-95 transition-transform"
          >
            <p className="text-[8px] font-black uppercase tracking-[0.3em] text-emerald-500 mb-1">
              Cash Balance
            </p>
            <h2
              className={`${isCompact ? "text-lg" : "text-xl"} font-black tracking-tighter leading-none`}
            >
              <span className="text-xs opacity-40 mr-0.5 font-bold">
                {currencySymbol}
              </span>
              {Math.round(wealthStats.liquid).toLocaleString()}
            </h2>
          </button>
        </section>

        <div className={`grid grid-cols-3 ${isCompact ? "gap-1.5" : "gap-3"}`}>
          <button
            onClick={() => {
              triggerHaptic();
              onNavigate("Ledger", "Avoids");
            }}
            className={`bg-brand-surface ${isCompact ? "p-2.5 rounded-2xl" : "p-4 rounded-[24px]"} border border-brand-border shadow-sm text-left active:scale-95 transition-transform`}
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              <AlertTriangle size={12} className="text-amber-500" />
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">
                Wasted
              </p>
            </div>
            <h3
              className={`${isCompact ? "text-xs" : "text-sm"} font-black text-brand-text tracking-tighter leading-none`}
            >
              {currencySymbol}
              {Math.round(stats.avoidsTotal).toLocaleString()}
            </h3>
            <p className="text-[6px] font-bold text-slate-400 uppercase mt-1">
              Avoided
            </p>
          </button>

          <button
            onClick={() => {
              triggerHaptic();
              onNavigate("Budget", "Bills");
            }}
            className={`bg-brand-surface ${isCompact ? "p-2.5 rounded-2xl" : "p-4 rounded-[24px]"} border border-brand-border shadow-sm text-left active:scale-95 transition-transform`}
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              <ReceiptText size={12} className="text-rose-500" />
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">
                Bills
              </p>
            </div>
            <h3
              className={`${isCompact ? "text-xs" : "text-sm"} font-black text-brand-text tracking-tighter leading-none`}
            >
              {currencySymbol}
              {Math.round(totalBillsAmount).toLocaleString()}
            </h3>
            <p className="text-[6px] font-bold text-slate-400 uppercase mt-1">
              Pending
            </p>
          </button>

          <button
            onClick={() => {
              triggerHaptic();
              onNavigate("Ledger");
            }}
            className={`bg-brand-surface ${isCompact ? "p-2.5 rounded-2xl" : "p-4 rounded-[24px]"} border border-brand-border shadow-sm text-left active:scale-95 transition-transform`}
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              <Percent size={12} className="text-brand-primary" />
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">
                Saved %
              </p>
            </div>
            <h3
              className={`${isCompact ? "text-xs" : "text-sm"} font-black text-brand-text tracking-tighter leading-none`}
            >
              {Math.round(stats.efficiencyRate)}%
            </h3>
            <p className="text-[6px] font-bold text-slate-400 uppercase mt-1">
              Score
            </p>
          </button>
        </div>



        <div className={`grid grid-cols-12 ${isCompact ? "gap-1.5" : "gap-3"}`}>
          <section
            className={`col-span-7 bg-brand-surface ${isCompact ? "p-2.5 rounded-2xl" : "p-3 rounded-[24px]"} border border-brand-border shadow-sm overflow-hidden`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <PieIcon size={12} className="text-indigo-400" />
                <h3 className="text-[8px] font-black text-slate-400 uppercase tracking-widest">
                  Spending
                </h3>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div
                className={`${isCompact ? "h-16 w-16" : "h-20 w-20"} relative flex-shrink-0`}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.catData}
                      cx="50%"
                      cy="50%"
                      innerRadius={isCompact ? 14 : 18}
                      outerRadius={isCompact ? 28 : 32}
                      paddingAngle={3}
                      dataKey="value"
                      stroke="none"
                    >
                      {stats.catData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col gap-0.5 min-w-0">
                <h4
                  className={`${isCompact ? "text-xs" : "text-sm"} font-black tracking-tighter leading-none truncate ${stats.surplus >= 0 ? "text-emerald-500" : "text-rose-500"}`}
                >
                  {stats.surplus < 0 ? "-" : ""}
                  {currencySymbol}
                  {Math.abs(Math.round(stats.surplus)).toLocaleString()}
                </h4>
                <p className="text-[7px] font-black text-slate-400 uppercase tracking-tighter">
                  Leftover
                </p>
              </div>
            </div>
          </section>

          <section
            className={`col-span-5 bg-brand-surface ${isCompact ? "p-2.5 rounded-2xl" : "p-3 rounded-[24px]"} border border-brand-border shadow-sm overflow-hidden`}
          >
            <div className="flex items-center gap-1.5 mb-2.5">
              <Activity size={10} className="text-slate-400" />
              <h3 className="text-[8px] font-black text-slate-400 uppercase tracking-widest">
                Saved
              </h3>
            </div>
            <div className="flex flex-col items-center justify-center py-2">
              <h3
                className={`${isCompact ? "text-xl" : "text-2xl"} font-black text-brand-text tracking-tighter`}
              >
                {Math.round(stats.retentionRate)}%
              </h3>
              <span className="text-[6px] font-black text-slate-400 uppercase tracking-widest">
                Rate
              </span>
            </div>
          </section>
        </div>

        <section
          className={`bg-brand-surface ${trendViewMode === "grid" ? (isCompact ? "p-1.5 rounded-2xl" : "p-3 rounded-[28px]") : (isCompact ? "p-3 rounded-2xl" : "p-5 rounded-[28px]")} border border-brand-border shadow-sm`}
        >
          <div
            className={`flex items-center justify-between ${isCompact ? "mb-2" : "mb-3.5"}`}
          >
            <div className="flex items-center gap-1.5">
              <TrendingUp size={14} className="text-slate-400" />
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Spending Trends
              </h3>
            </div>
            <div className="flex items-center bg-brand-accent p-0.5 rounded-xl border border-brand-border">
              <button
                onClick={() => {
                  triggerHaptic();
                  setTrendViewMode("grid");
                }}
                className={`p-1.5 rounded-lg transition-all ${trendViewMode === "grid" ? "bg-brand-surface text-brand-accentUi shadow-sm" : "text-slate-500"}`}
                title="Grid View (Checkerboard)"
              >
                <Grid3X3 size={14} />
              </button>
              <button
                onClick={() => {
                  triggerHaptic();
                  setTrendViewMode("area");
                }}
                className={`p-1.5 rounded-lg transition-all ${trendViewMode === "area" ? "bg-brand-surface text-brand-accentUi shadow-sm" : "text-slate-500"}`}
                title="Area View"
              >
                <LayoutPanelLeft size={14} />
              </button>
              <button
                onClick={() => {
                  triggerHaptic();
                  setTrendViewMode("bar");
                }}
                className={`p-1.5 rounded-lg transition-all ${trendViewMode === "bar" ? "bg-brand-surface text-brand-accentUi shadow-sm" : "text-slate-500"}`}
                title="Bar View"
              >
                <BarChart3 size={14} />
              </button>
            </div>
          </div>

          <div className={`${trendViewMode === "grid" ? "h-auto" : isCompact ? "h-36" : "h-48"} w-full`}>
            {trendViewMode === "grid" ? (
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-end items-center border-b border-brand-border/40 pb-1">
                  <div className="flex items-center gap-1.5 text-[7px] font-black uppercase text-slate-500">
                    <span>Less</span>
                    <div className="w-2.5 h-2.5 rounded-sm bg-slate-900 border border-slate-800/10" title="Zero spend" />
                    <div className="w-2.5 h-2.5 rounded-sm bg-brand-primary/25" title="Low spend" />
                    <div className="w-2.5 h-2.5 rounded-sm bg-brand-primary/55" title="Medium spend" />
                    <div className="w-2.5 h-2.5 rounded-sm bg-brand-primary/85" title="High spend" />
                    <div className="w-2.5 h-2.5 rounded-sm bg-rose-500" title="Critical/Avoid spend" />
                    <span>More</span>
                  </div>
                </div>

                <div className="flex justify-start md:justify-center items-center py-0.5 overflow-x-auto no-scrollbar">
                  <div className="flex py-0.5 gap-1.5 items-start shrink-0">
                    {/* Day Labels Column */}
                    <div className="sticky left-0 bg-brand-surface pr-1.5 flex flex-col gap-[2px] text-right font-mono text-[7px] font-black text-slate-500 dark:text-slate-400 w-4 shrink-0 z-10">
                      {["S", "M", "T", "W", "T", "F", "S"].map((day, idx) => (
                        <div key={idx} className="h-3 flex items-center justify-end leading-none">
                          {day}
                        </div>
                      ))}
                    </div>

                    {/* Checker Grid Column */}
                    <div className="flex flex-col gap-[2px]">
                      {monthlySpendingGrid.map((row, dIdx) => (
                        <div key={dIdx} className="flex gap-[2px]">
                          {row.map((cell, wIdx) => {
                            const { date, totalSpent, isHighSpend, isExtremeSpend, isAvoidSpend } = cell;

                            let cellColor = "bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/40 hover:bg-slate-200 dark:hover:bg-slate-800";
                            if (totalSpent > 0) {
                              if (isAvoidSpend) {
                                cellColor = "bg-rose-500 shadow-[0_0_6px_rgba(239,68,68,0.3)] border border-rose-400/20";
                              } else if (isExtremeSpend) {
                                cellColor = "bg-amber-500 border border-amber-400/20";
                              } else if (isHighSpend) {
                                cellColor = "bg-brand-primary border border-brand-primary/20";
                              } else {
                                const avgDaily = settings.monthlyIncome / 30;
                                const ratio = totalSpent / avgDaily;
                                if (ratio < 0.3) {
                                  cellColor = "bg-brand-primary/25 border border-brand-primary/10";
                                } else if (ratio < 0.8) {
                                  cellColor = "bg-brand-primary/55 border border-brand-primary/20";
                                } else {
                                  cellColor = "bg-brand-primary/85 border border-brand-primary/30";
                                }
                              }
                            }

                            const isSelected = selectedGridDay && selectedGridDay.date.getTime() === cell.date.getTime();

                            const formattedDate = date.toLocaleDateString("default", {
                              month: "short",
                              day: "numeric",
                              year: "numeric"
                            });

                            return (
                              <button
                                key={wIdx}
                                onClick={() => {
                                  triggerHaptic(5);
                                  if (isSelected) {
                                    setSelectedGridDay(null);
                                  } else {
                                    setSelectedGridDay(cell);
                                  }
                                }}
                                className={`w-3 h-3 rounded-sm relative transition-all duration-300 hover:scale-[1.2] active:scale-95 ${cellColor} ${
                                  isSelected ? "ring-2 ring-white scale-110 z-10 shadow-md" : ""
                                }`}
                                title={`${formattedDate}: ${totalSpent > 0 ? `${currencySymbol}${Math.round(totalSpent).toLocaleString()}` : "No spend"}`}
                              />
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {selectedGridDay && (
                  <div className="bg-brand-accent/45 rounded-xl p-3 border border-brand-border/60 animate-kick text-left space-y-2 mt-1">
                    <div className="flex items-center justify-between border-b border-brand-border/30 pb-1.5 font-mono">
                      <h4 className="text-[9px] font-black uppercase text-slate-700 dark:text-slate-300">
                        {selectedGridDay.date.toLocaleDateString("default", { weekday: "long", month: "short", day: "numeric", year: "numeric" })} DETAILS
                      </h4>
                      <span className="text-[9px] font-black text-brand-primary">
                        Total: {currencySymbol}{Math.round(selectedGridDay.totalSpent).toLocaleString()}
                      </span>
                    </div>
                    {selectedGridDay.expenses.length === 0 ? (
                      <p className="text-[8px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest text-center py-2 font-mono">No expenses logged on this day.</p>
                    ) : (
                      <div className="max-h-24 overflow-y-auto no-scrollbar space-y-1 font-mono">
                        {selectedGridDay.expenses.map((exp: any) => (
                          <div key={exp.id} className="flex justify-between items-center text-[9px] font-bold bg-slate-100/80 dark:bg-black/20 p-1.5 rounded-lg border border-slate-200/50 dark:border-white/5">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span
                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                style={{ backgroundColor: exp.isAvoid ? "var(--brand-primary)" : CATEGORY_COLORS[exp.category as Category] }}
                              />
                              <span className="text-slate-900 dark:text-slate-200 truncate font-black">{exp.merchant}</span>
                              <span className="text-slate-500 dark:text-slate-400 font-normal italic pr-2 truncate">({exp.note || "no note"})</span>
                            </div>
                            <span className={`font-black ${exp.isAvoid ? "text-rose-500" : "text-slate-900 dark:text-slate-100"}`}>
                              {currencySymbol}{Math.round(exp.amount).toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : trendViewMode === "area" ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={trendData}
                  margin={{ top: 10, right: 20, left: 20, bottom: 20 }}
                >
                  <XAxis
                    dataKey="month"
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                    tick={{ fontSize: 9, fontWeight: 900, fill: "#64748b" }}
                    dy={10}
                  />
                  <Tooltip
                    formatter={(value: number) =>
                      Math.round(value).toLocaleString()
                    }
                    contentStyle={{
                      backgroundColor: "var(--brand-surface)",
                      border: "1px solid var(--brand-border)",
                      borderRadius: "16px",
                      fontSize: "9px",
                    }}
                    itemStyle={{ padding: "2px 0" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="Needs"
                    stackId="1"
                    stroke={CATEGORY_COLORS.Needs}
                    fill={CATEGORY_COLORS.Needs}
                    fillOpacity={0.6}
                  />
                  <Area
                    type="monotone"
                    dataKey="Wants"
                    stackId="1"
                    stroke={CATEGORY_COLORS.Wants}
                    fill={CATEGORY_COLORS.Wants}
                    fillOpacity={0.5}
                  />
                  <Area
                    type="monotone"
                    dataKey="Savings"
                    stackId="1"
                    stroke={CATEGORY_COLORS.Savings}
                    fill={CATEGORY_COLORS.Savings}
                    fillOpacity={0.4}
                  />
                  <Area
                    type="monotone"
                    dataKey="Avoids"
                    stackId="1"
                    stroke={CATEGORY_COLORS.Avoids}
                    fill={CATEGORY_COLORS.Avoids}
                    fillOpacity={0.3}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={trendData}
                  margin={{ top: 10, right: 20, left: 20, bottom: 20 }}
                >
                  <XAxis
                    dataKey="month"
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                    tick={{ fontSize: 9, fontWeight: 900, fill: "#64748b" }}
                    dy={10}
                  />
                  <Tooltip
                    cursor={{ fill: "transparent" }}
                    formatter={(value: number) =>
                      Math.round(value).toLocaleString()
                    }
                    contentStyle={{
                      backgroundColor: "var(--brand-surface)",
                      border: "1px solid var(--brand-border)",
                      borderRadius: "16px",
                      fontSize: "9px",
                    }}
                  />
                  <Bar
                    dataKey="Needs"
                    stackId="a"
                    fill={CATEGORY_COLORS.Needs}
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="Wants"
                    stackId="a"
                    fill={CATEGORY_COLORS.Wants}
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="Savings"
                    stackId="a"
                    fill={CATEGORY_COLORS.Savings}
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="Avoids"
                    stackId="a"
                    fill={CATEGORY_COLORS.Avoids}
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section
          className={`bg-brand-surface ${isCompact ? "p-3 rounded-2xl" : "p-5 rounded-[28px]"} border border-brand-border shadow-sm`}
        >
          <div
            className={`flex items-center justify-between ${isCompact ? "mb-3" : "mb-5"}`}
          >
            <div className="flex items-center gap-1.5">
              <History size={14} className="text-slate-400" />
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Monthly Variance
              </h3>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-400 opacity-40" />
                <span className="text-[7px] font-black text-slate-500 uppercase">
                  Last
                </span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-brand-accentUi" />
                <span className="text-[7px] font-black text-slate-500 uppercase">
                  Current
                </span>
              </div>
            </div>
          </div>

          <div className={`${isCompact ? "h-40" : "h-52"} w-full`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={categoryComparisonData}
                margin={{ top: 10, right: 0, left: -20, bottom: 20 }}
                barGap={2}
              >
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fontSize: 9,
                    fontStyle: "normal",
                    fontWeight: 900,
                    fill: "#64748b",
                  }}
                  dy={10}
                />
                <Tooltip
                  cursor={{ fill: "var(--brand-accent)" }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      const diff = data.current - data.previous;
                      const percent =
                        data.previous > 0 ? (diff / data.previous) * 100 : 0;
                      return (
                        <div className="bg-brand-surface p-3 rounded-2xl border border-brand-border shadow-xl">
                          <p className="text-[10px] font-black text-brand-text uppercase mb-2">
                            {data.name}
                          </p>
                          <div className="space-y-1">
                            <div className="flex justify-between gap-4">
                              <span className="text-[8px] font-bold text-slate-500 uppercase">
                                Previous
                              </span>
                              <span className="text-[9px] font-black">
                                {currencySymbol}
                                {data.previous.toLocaleString()}
                              </span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-[8px] font-bold text-slate-500 uppercase">
                                Current
                              </span>
                              <span className="text-[9px] font-black">
                                {currencySymbol}
                                {data.current.toLocaleString()}
                              </span>
                            </div>
                            <div className="pt-1 mt-1 border-t border-brand-border flex justify-between gap-4">
                              <span className="text-[8px] font-black uppercase text-indigo-400">
                                Variance
                              </span>
                              <span
                                className={`text-[9px] font-black ${diff > 0 ? "text-rose-500" : "text-emerald-500"}`}
                              >
                                {diff > 0 ? "+" : ""}
                                {Math.round(percent)}%
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="previous" radius={[4, 4, 0, 0]} opacity={0.2}>
                  {categoryComparisonData.map((entry, index) => (
                    <Cell key={`cell-prev-${index}`} fill={entry.color} />
                  ))}
                </Bar>
                <Bar dataKey="current" radius={[4, 4, 0, 0]}>
                  {categoryComparisonData.map((entry, index) => (
                    <Cell
                      key={`cell-curr-${index}`}
                      fill={entry.color}
                      style={{
                        filter: entry.isHigh
                          ? "drop-shadow(0 0 4px rgba(255,0,0,0.3))"
                          : undefined,
                      }}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-2 flex justify-center gap-4">
            {categoryComparisonData.some((d) => d.isHigh) && (
              <div className="flex items-center gap-1 bg-rose-500/5 px-2 py-1 rounded-lg border border-rose-500/10">
                <AlertTriangle size={10} className="text-rose-500" />
                <span className="text-[7px] font-black text-rose-500 uppercase tracking-widest">
                  Protocol Warning: Elevated Burn Rate Detected
                </span>
              </div>
            )}
          </div>
        </section>

        {pendingCount > 0 && (
          <button
            onClick={() => {
              triggerHaptic();
              onCategorizeClick();
            }}
            className={`w-full bg-indigo-600 ${isCompact ? "rounded-[24px] p-3.5" : "rounded-[32px] p-5"} flex items-center justify-between active:scale-[0.98] transition-all group shadow-xl border border-indigo-400/20`}
          >
            <div
              className={`flex items-center ${isCompact ? "gap-3" : "gap-5"} px-1`}
            >
              <div
                className={`${isCompact ? "p-2" : "p-3"} bg-white/20 rounded-2xl backdrop-blur-md`}
              >
                <BrainCircuit
                  size={isCompact ? 18 : 24}
                  className="text-white"
                />
              </div>
              <div className="text-left">
                <h3
                  className={`${isCompact ? "text-[10px]" : "text-[12px]"} font-black text-white uppercase tracking-wider`}
                >
                  {pendingCount} Transactions to Sort
                </h3>
                <p className="text-[7px] font-bold text-indigo-200 uppercase tracking-[0.2em]">
                  Categorization needed
                </p>
              </div>
            </div>
            <div className="bg-white/10 p-2 rounded-2xl text-white">
              <ArrowRight size={14} strokeWidth={3} />
            </div>
          </button>
        )}

        {/* AI BUDGET AUDITOR (DADDY MIND PROTOCOL) - MOVED AS LAST WIDGET */}
        <section
          className={`bg-brand-surface ${isCompact ? "p-3 rounded-[20px]" : "p-5 rounded-[28px]"} border border-brand-border shadow-md relative overflow-hidden`}
        >
          {/* Subtle neural ambient backdrop */}
          <div className="absolute top-0 right-0 p-3 opacity-5 pointer-events-none">
            <BrainCircuit size={48} className="text-brand-accentUi" />
          </div>

          <div className="flex items-center justify-between mb-4 pb-2 border-b border-brand-border/40">
            <div className="flex items-center gap-2">
              <div className="bg-brand-accentUi/10 p-1.5 rounded-lg text-brand-accentUi">
                <BrainCircuit
                  size={16}
                  className={isAnalyzing ? "animate-pulse" : ""}
                />
              </div>
              <div>
                <h3 className="text-[10px] font-black tracking-widest text-slate-300 uppercase">
                  AI Budget Audit
                </h3>
                <p className="text-[6px] font-black text-brand-accentUi uppercase tracking-[0.25em]">
                  Daddy Mind Protocol Active
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                triggerHaptic();
                runAnalysis(true);
              }}
              disabled={isAnalyzing}
              className="p-1.5 rounded-lg hover:bg-white/5 active:scale-90 transition-all text-slate-400 hover:text-white flex items-center gap-1 text-[8px] font-black uppercase tracking-wider disabled:opacity-50"
              title="Recalculate budget analysis"
            >
              <RefreshCw
                size={10}
                className={isAnalyzing ? "animate-spin" : ""}
              />
              <span>Refresh</span>
            </button>
          </div>

          {isAnalyzing ? (
            <div className="flex flex-col items-center justify-center py-6 gap-2 text-center animate-pulse">
              <RefreshCw
                size={24}
                className="text-brand-accentUi animate-spin mb-1"
              />
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">
                Running Forensic Budget Check...
              </p>
              <p className="text-[7px] font-bold text-slate-500 uppercase tracking-wider italic">
                Daddy is reviewing your card swipes
              </p>
            </div>
          ) : analysisError ? (
            <p className="text-[9px] font-bold text-rose-500 uppercase text-center py-4">
              {analysisError}
            </p>
          ) : budgetAnalysis ? (
            <div className="space-y-4">
              {/* Blunt Advisor Verdict */}
              {budgetAnalysis.summary && (
                <div className="bg-brand-accent px-4 py-3 rounded-2xl border-l-4 border-brand-accentUi relative italic">
                  <p className="text-[10px] font-bold text-slate-800 dark:text-slate-300 leading-relaxed">
                    "{budgetAnalysis.summary}"
                  </p>
                </div>
              )}

              {/* Actionable Insights */}
              <div className="space-y-2">
                {budgetAnalysis.insights &&
                budgetAnalysis.insights.length > 0 ? (
                  // Sort insights to optimize priority (Avoids or danger alerts first!)
                  [...budgetAnalysis.insights]
                    .sort((a, b) => {
                      const priorityA =
                        a.category === "Avoids" || a.type === "danger"
                          ? 2
                          : a.type === "warning"
                            ? 1
                            : 0;
                      const priorityB =
                        b.category === "Avoids" || b.type === "danger"
                          ? 2
                          : b.type === "warning"
                            ? 1
                            : 0;
                      return priorityB - priorityA;
                    })
                    .map((insight, idx) => {
                      const isDanger =
                        insight.type === "danger" ||
                        insight.category === "Avoids";
                      const isWarning = insight.type === "warning";
                      const iconColor = isDanger
                        ? "text-rose-500"
                        : isWarning
                          ? "text-amber-500"
                          : "text-indigo-400";
                      const bgColor = isDanger
                        ? "bg-rose-500/5 border-rose-500/10"
                        : isWarning
                          ? "bg-amber-500/5 border-amber-500/10"
                          : "bg-indigo-500/5 border-indigo-500/10";

                      return (
                        <div
                          key={idx}
                          className={`flex items-start gap-3 p-3 rounded-[18px] border ${bgColor} transition-all hover:scale-[1.005]`}
                        >
                          <div className={`mt-0.5 shrink-0 ${iconColor}`}>
                            <AlertTriangle size={14} />
                          </div>
                          <div className="space-y-1 text-left min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 bg-black/60 dark:bg-black/40 rounded-md text-white border border-white/5">
                                {insight.category}
                              </span>
                              {isDanger && (
                                <span className="text-[6px] font-black uppercase tracking-widest text-rose-500 bg-rose-500/10 px-1 rounded">
                                  Critical Waste Alert
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] font-black text-slate-800 dark:text-slate-100 leading-tight">
                              {insight.message}
                            </p>
                            <div className="text-[8px] font-bold text-slate-700 dark:text-slate-400 leading-normal bg-slate-100 dark:bg-black/10 p-1.5 rounded-lg mt-1 border border-slate-200/50 dark:border-white/5">
                              <span className="text-indigo-600 dark:text-indigo-400 font-extrabold uppercase text-[7px] tracking-wider block mb-0.5">
                                Tactical Tip:
                              </span>
                              {insight.actionableTip}
                            </div>
                          </div>
                        </div>
                      );
                    })
                ) : (
                  <div className="py-2 text-center">
                    <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest">
                      ★ Perfect Execution. No Budget Breaches Detected.
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-[9px] font-bold text-slate-500 uppercase">
                Protocol Standing by.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default Dashboard;
