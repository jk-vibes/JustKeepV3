import React, { useState, useRef, useEffect } from 'react';
import { UserSettings, UserProfile, AppTheme, WealthItem, DensityLevel, Category, AIAgent, DailyTokenUsage } from '../types';
import { 
  LogOut, Palette, Download, Upload, Zap, Sparkles,
  ShieldAlert, Trash2, History, Database, Eraser,
  Maximize2, Minimize2, Layout, TrendingUp,
  ChevronRight, Tag, Percent, Loader2, BrainCircuit,
  Key, Eye, EyeOff, Bot, Activity, BarChart2, CheckCircle2,
  Power, RefreshCw, Cpu, Flame, Lock, Coins, Cloud,
  CloudUpload, CloudDownload, HardDrive, Check, Copy, LogIn
} from 'lucide-react';
import { triggerHaptic } from '../utils/haptics';
import { getCurrencySymbol, SUPPORTED_CURRENCIES } from '../constants';
import { NarutoIcon, SpiderIcon, CaptainAmericaIcon, BatmanIcon, MoonIcon } from './ThemeSymbols';
import { getDailyTokenUsage, clearTokenUsageHistory } from '../services/geminiService';

interface SettingsProps {
  settings: UserSettings;
  user: UserProfile | null;
  onLogout: () => void;
  onReset: () => void;
  onToggleTheme: () => void;
  onUpdateAppTheme: (theme: AppTheme) => void;
  onUpdateCurrency: (code: string) => void;
  onUpdateSplit: (split: { Needs: number; Wants: number; Savings: number }) => void;
  onSync: () => void;
  onExport: () => void;
  onRestore: (file: File) => void;
  onGoogleDriveSync?: () => Promise<boolean>;
  onGoogleDriveRestore?: () => Promise<boolean>;
  onToggleGoogleDriveAutoSync?: (enabled: boolean) => void;
  onUpdateUser?: (user: UserProfile) => void;
  onAddBulk: (items: any[]) => void;
  isSyncing: boolean;
  onLoadMockData: () => void;
  onPurgeMockData: () => void;
  onPurgeAllData?: () => void;
  wealthItems?: WealthItem[];
  onUpdateDataFilter?: (filter: 'all' | 'user' | 'mock') => void;
  onUpdateBaseIncome?: (income: number) => void;
  onUpdateDensity?: (density: DensityLevel) => void;
  onClearExpenses?: () => void;
  onOpenCategoryManager: () => void;
  onUpdateAISettings?: (updated: {
    aiEnabled?: boolean;
    selectedAgent?: AIAgent;
    apiKeys?: { Gemini?: string; Claude?: string; Grok?: string };
  }) => void;
}

const Settings: React.FC<SettingsProps> = ({ 
  settings, user, onLogout, onReset, onUpdateAppTheme, onUpdateCurrency,
  onExport, onRestore, onLoadMockData, onPurgeMockData,
  onUpdateDensity, onUpdateBaseIncome, onUpdateSplit, onOpenCategoryManager,
  onUpdateAISettings, onGoogleDriveSync, onGoogleDriveRestore,
  onToggleGoogleDriveAutoSync, onUpdateUser
}) => {
  const [localIncome, setLocalIncome] = useState(settings.monthlyIncome.toString());
  const [localNeeds, setLocalNeeds] = useState(settings.split.Needs.toString());
  const [localWants, setLocalWants] = useState(settings.split.Wants.toString());
  const [localSavings, setLocalSavings] = useState(settings.split.Savings.toString());

  // AI settings local state
  const [aiEnabled, setAiEnabled] = useState<boolean>(settings.aiEnabled !== false);
  const [selectedAgent, setSelectedAgent] = useState<AIAgent>(settings.selectedAgent || 'Gemini');
  const [geminiKey, setGeminiKey] = useState<string>(settings.apiKeys?.Gemini || '');
  const [claudeKey, setClaudeKey] = useState<string>(settings.apiKeys?.Claude || '');
  const [grokKey, setGrokKey] = useState<string>(settings.apiKeys?.Grok || '');

  // Google Drive state
  const [isDriveSyncing, setIsDriveSyncing] = useState(false);
  const [isDriveRestoring, setIsDriveRestoring] = useState(false);
  const [isConnectingDrive, setIsConnectingDrive] = useState(false);
  const [driveMessage, setDriveMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const handleConnectGoogleDrive = () => {
    triggerHaptic(50);
    setIsConnectingDrive(true);
    setDriveMessage(null);

    const clientId = localStorage.getItem('jk_google_client_id_override') || import.meta.env.VITE_GOOGLE_CLIENT_ID || '620152015803-dq34k5jvlkh94af6hu49u8b8m1t6kpar.apps.googleusercontent.com';

    if (!(window as any).google?.accounts?.oauth2) {
      setDriveMessage({ text: 'Google OAuth client library loading... Please try again.', type: 'info' });
      setIsConnectingDrive(false);
      return;
    }

    try {
      const client = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/drive.file openid profile email',
        callback: async (response: any) => {
          setIsConnectingDrive(false);
          if (response.error) {
            setDriveMessage({ text: `Google Auth Error: ${response.error_description || response.error}`, type: 'error' });
            return;
          }

          if (response.access_token) {
            try {
              const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${response.access_token}` },
              });
              const userInfo = await userInfoRes.json();
              if (onUpdateUser) {
                onUpdateUser({
                  id: userInfo.sub || user?.id || 'google_user',
                  name: userInfo.name || user?.name || 'Google User',
                  email: userInfo.email || user?.email || '',
                  avatar: userInfo.picture || user?.avatar,
                  accessToken: response.access_token
                });
              }
              setDriveMessage({ text: 'Connected to Google Drive successfully!', type: 'success' });
            } catch (err) {
              if (onUpdateUser) {
                onUpdateUser({
                  id: user?.id || 'google_user',
                  name: user?.name || 'Google User',
                  email: user?.email || '',
                  avatar: user?.avatar,
                  accessToken: response.access_token
                });
              }
              setDriveMessage({ text: 'Google Drive connected with access token!', type: 'success' });
            }
          }
        },
      });
      client.requestAccessToken();
    } catch (err: any) {
      setIsConnectingDrive(false);
      setDriveMessage({ text: `Failed to open Google OAuth: ${err?.message || err}`, type: 'error' });
    }
  };

  const handleDriveSyncClick = async () => {
    if (!onGoogleDriveSync) return;
    triggerHaptic(50);
    setIsDriveSyncing(true);
    setDriveMessage(null);
    const success = await onGoogleDriveSync();
    setIsDriveSyncing(false);
    if (success) {
      setDriveMessage({ text: 'Vault snapshot successfully saved to Google Drive!', type: 'success' });
    } else {
      setDriveMessage({ text: 'Failed to backup to Google Drive. Check permissions.', type: 'error' });
    }
  };

  const handleDriveRestoreClick = async () => {
    if (!onGoogleDriveRestore) return;
    triggerHaptic(50);
    setIsDriveRestoring(true);
    setDriveMessage(null);
    const success = await onGoogleDriveRestore();
    setIsDriveRestoring(false);
    if (success) {
      setDriveMessage({ text: 'Data successfully restored from Google Drive!', type: 'success' });
    } else {
      setDriveMessage({ text: 'Restoration failed or no snapshot found.', type: 'error' });
    }
  };

  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showClaudeKey, setShowClaudeKey] = useState(false);
  const [showGrokKey, setShowGrokKey] = useState(false);

  // Active AI Tab inside bottom AI section ('agents' | 'tokens')
  const [activeAiTab, setActiveAiTab] = useState<'agents' | 'tokens'>('agents');

  const [tokenHistory, setTokenHistory] = useState<DailyTokenUsage[]>(getDailyTokenUsage());

  // Listen to token usage updates
  useEffect(() => {
    const handleUpdate = () => {
      setTokenHistory(getDailyTokenUsage());
    };
    window.addEventListener('tokenUsageUpdated', handleUpdate);
    return () => window.removeEventListener('tokenUsageUpdated', handleUpdate);
  }, []);

  // Sync props -> state
  useEffect(() => {
    setLocalIncome(settings.monthlyIncome.toString());
    setLocalNeeds(settings.split.Needs.toString());
    setLocalWants(settings.split.Wants.toString());
    setLocalSavings(settings.split.Savings.toString());
    
    if (settings.aiEnabled !== undefined) setAiEnabled(settings.aiEnabled);
    if (settings.selectedAgent) setSelectedAgent(settings.selectedAgent);
    if (settings.apiKeys) {
      setGeminiKey(settings.apiKeys.Gemini || '');
      setClaudeKey(settings.apiKeys.Claude || '');
      setGrokKey(settings.apiKeys.Grok || '');
    }
  }, [settings]);

  const jsonInputRef = useRef<HTMLInputElement>(null);

  const handleIncomeChange = (val: string) => {
    setLocalIncome(val);
    const num = parseInt(val) || 0;
    onUpdateBaseIncome?.(num);
  };

  const handleSplitChange = (key: 'Needs' | 'Wants' | 'Savings', val: string) => {
    const setters = { Needs: setLocalNeeds, Wants: setLocalWants, Savings: setLocalSavings };
    setters[key](val);

    const newSplit = {
      Needs: key === 'Needs' ? (parseInt(val) || 0) : (parseInt(localNeeds) || 0),
      Wants: key === 'Wants' ? (parseInt(val) || 0) : (parseInt(localWants) || 0),
      Savings: key === 'Savings' ? (parseInt(val) || 0) : (parseInt(localSavings) || 0),
    };
    onUpdateSplit(newSplit);
  };

  const handleToggleAi = () => {
    triggerHaptic(20);
    const nextVal = !aiEnabled;
    setAiEnabled(nextVal);
    onUpdateAISettings?.({ aiEnabled: nextVal, selectedAgent, apiKeys: { Gemini: geminiKey, Claude: claudeKey, Grok: grokKey } });
  };

  const handleSelectAgent = (agent: AIAgent) => {
    triggerHaptic(20);
    setSelectedAgent(agent);
    onUpdateAISettings?.({ aiEnabled, selectedAgent: agent, apiKeys: { Gemini: geminiKey, Claude: claudeKey, Grok: grokKey } });
  };

  const handleApiKeyChange = (agent: AIAgent, val: string) => {
    if (agent === 'Gemini') setGeminiKey(val);
    if (agent === 'Claude') setClaudeKey(val);
    if (agent === 'Grok') setGrokKey(val);

    const updatedKeys = {
      Gemini: agent === 'Gemini' ? val : geminiKey,
      Claude: agent === 'Claude' ? val : claudeKey,
      Grok: agent === 'Grok' ? val : grokKey
    };
    onUpdateAISettings?.({ aiEnabled, selectedAgent, apiKeys: updatedKeys });
  };

  const handleClearTokenHistory = () => {
    triggerHaptic(30);
    clearTokenUsageHistory();
    setTokenHistory([]);
  };

  const handleJSONChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { onRestore(file); triggerHaptic(30); }
    if (jsonInputRef.current) jsonInputRef.current.value = '';
  };

  // Token calculations
  const todayStr = new Date().toISOString().split('T')[0];
  const todayTokens = tokenHistory
    .filter(h => h.date === todayStr)
    .reduce((sum, h) => sum + h.tokens, 0);
  
  const todayCalls = tokenHistory
    .filter(h => h.date === todayStr)
    .reduce((sum, h) => sum + h.count, 0);

  const totalLifetimeTokens = tokenHistory.reduce((sum, h) => sum + h.tokens, 0);

  // Collapsible sections state - all collapsed by default
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    visual: false,
    theme: false,
    budget: false,
    storage: false,
    ai: false,
  });

  const toggleSection = (section: string) => {
    triggerHaptic(20);
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const allCollapsed = Object.values(openSections).every(v => !v);
  const toggleAllSections = () => {
    triggerHaptic(30);
    const targetState = allCollapsed;
    setOpenSections({
      visual: targetState,
      theme: targetState,
      budget: targetState,
      storage: targetState,
      ai: targetState,
    });
  };

  const renderSectionHeader = (
    key: string,
    title: React.ReactNode,
    subtitle: string,
    badge?: React.ReactNode
  ) => {
    const isOpen = !!openSections[key];
    return (
      <button
        type="button"
        onClick={() => toggleSection(key)}
        className="w-full p-3.5 flex items-center justify-between hover:bg-brand-accent/30 transition-colors text-left cursor-pointer select-none"
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="p-1.5 rounded-lg bg-brand-accent/80 text-slate-400 shrink-0 border border-brand-border/40">
            <ChevronRight
              size={14}
              className={`transition-transform duration-200 ${isOpen ? 'rotate-90 text-brand-primary' : ''}`}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2 pr-2">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                {title}
              </h3>
              {badge}
            </div>
            <p className="text-[8px] font-medium text-slate-500 mt-0.5 truncate">{subtitle}</p>
          </div>
        </div>
      </button>
    );
  };

  const sectionClass = "bg-brand-surface border border-brand-border rounded-xl mb-2 overflow-hidden shadow-sm transition-all";
  const labelClass = "text-[8px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2 mb-2 px-2";
  const vaultButtonClass = "flex flex-col items-center justify-center gap-1.5 p-4 rounded-xl bg-brand-accent border border-brand-border active:border-brand-primary active:scale-95 transition-all group shadow-sm disabled:opacity-50";

  const agents: { id: AIAgent; name: string; provider: string; color: string; badgeColor: string }[] = [
    { id: 'Gemini', name: 'Gemini 3.5', provider: 'Google AI', color: 'from-amber-500/20 to-yellow-600/20 border-yellow-500/40', badgeColor: 'bg-amber-500 text-black' },
    { id: 'Claude', name: 'Claude 3.5', provider: 'Anthropic', color: 'from-purple-500/20 to-indigo-600/20 border-purple-500/40', badgeColor: 'bg-purple-500 text-white' },
    { id: 'Grok', name: 'Grok Beta', provider: 'xAI', color: 'from-blue-500/20 to-cyan-600/20 border-blue-500/40', badgeColor: 'bg-blue-500 text-white' }
  ];

  return (
    <div className="animate-slide-up relative h-full flex flex-col no-scrollbar overflow-hidden">
      <div className="bg-gradient-to-r from-brand-primary to-brand-secondary px-3 py-2 rounded-xl mb-2 shadow-md h-[50px] flex items-center relative overflow-hidden mx-0.5 shrink-0 border border-white/5">
        <div className="flex items-center justify-between relative z-10 w-full px-1">
          <div className="flex-1 min-w-0">
            <h1 className="text-[14px] font-black text-brand-headerText tracking-tight leading-none truncate uppercase">Settings</h1>
            <p className="text-[7px] font-bold text-brand-headerText/50 uppercase tracking-[0.2em] mt-0.5 truncate">Maintenance & Protocol</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button 
              onClick={toggleAllSections}
              className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded-lg text-brand-headerText text-[8px] font-black uppercase tracking-wider transition-colors active:scale-95"
              title={allCollapsed ? "Expand All" : "Collapse All"}
            >
              {allCollapsed ? "Expand All" : "Collapse All"}
            </button>
            <button 
              onClick={() => { triggerHaptic(); onLogout(); }}
              className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-brand-headerText transition-colors active:scale-95"
              title="Sign Out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>

      <div className="px-0.5 flex-1 overflow-y-auto no-scrollbar space-y-2 pb-24">
        
        {/* Visual Protocol */}
        <section className={sectionClass}>
          {renderSectionHeader('visual', <><Layout size={12} /> Visual Protocol</>, `Density scale: ${settings.density || 'Compact'}`)}
          {openSections.visual && (
            <div className="px-4 pb-4 pt-1 border-t border-brand-border/40 animate-fade-in">
              <div className="bg-brand-accent p-1 rounded-2xl flex border border-brand-border shadow-inner mt-2">
                <button 
                  onClick={() => { triggerHaptic(); onUpdateDensity?.('Normal'); }}
                  className={`flex-1 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all ${settings.density === 'Normal' ? 'bg-brand-surface text-brand-text shadow-lg' : 'text-slate-500 opacity-60'}`}
                >
                  <Maximize2 size={14} />
                  <span className="text-[9px] font-black uppercase tracking-widest">Normal</span>
                </button>
                <button 
                  onClick={() => { triggerHaptic(); onUpdateDensity?.('Compact'); }}
                  className={`flex-1 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all ${settings.density === 'Compact' ? 'bg-brand-surface text-brand-text shadow-lg' : 'text-slate-500 opacity-60'}`}
                >
                  <Minimize2 size={14} />
                  <span className="text-[9px] font-black uppercase tracking-widest">Compact</span>
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Theme Identity */}
        <section className={sectionClass}>
          {renderSectionHeader('theme', <><Palette size={12} /> Theme Identity</>, `Current theme: ${settings.appTheme || 'Batman'}`)}
          {openSections.theme && (
            <div className="px-4 pb-4 pt-1 border-t border-brand-border/40 animate-fade-in">
              <div className="grid grid-cols-5 gap-2 mt-2">
                {themes.map(t => (
                  <button key={t.id} onClick={() => { triggerHaptic(); onUpdateAppTheme(t.id); }} className={`aspect-square transition-all active:scale-90 flex items-center justify-center relative rounded-xl border-2 ${settings.appTheme === t.id ? 'border-brand-accentUi bg-brand-accentUi/10 shadow-lg' : 'opacity-30 border-transparent'}`}>
                    <div className="w-10 h-10 flex items-center justify-center">{t.icon}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Budget Settings */}
        <section className={sectionClass}>
          {renderSectionHeader(
            'budget', 
            <><TrendingUp size={12} /> Budget Settings</>, 
            `Currency (${settings.currency}) • Income (${getCurrencySymbol(settings.currency)}${settings.monthlyIncome})`,
            <span className="text-[6px] font-black text-emerald-500 uppercase tracking-widest flex items-center gap-1 animate-pulse">
              <Sparkles size={8} /> Autosaved
            </span>
          )}
          {openSections.budget && (
            <div className="px-4 pb-4 pt-1 border-t border-brand-border/40 space-y-4 animate-fade-in mt-1">
              {/* Currency Dropdown */}
              <div className="space-y-1.5 pt-1">
                 <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Currency</p>
                 <div className="relative">
                   <select
                     value={settings.currency}
                     onChange={(e) => { triggerHaptic(); onUpdateCurrency(e.target.value); }}
                     className="w-full bg-brand-accent px-3.5 py-3 rounded-xl text-xs font-black outline-none border border-brand-border text-brand-text shadow-inner appearance-none cursor-pointer pr-10"
                   >
                     {SUPPORTED_CURRENCIES.map(curr => (
                       <option key={curr.code} value={curr.code} className="bg-brand-surface text-brand-text font-bold">
                         {curr.name} ({curr.symbol} {curr.code})
                       </option>
                     ))}
                   </select>
                   <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                     <ChevronRight size={14} className="rotate-90" />
                   </div>
                 </div>
              </div>

              <div className="space-y-2">
                 <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Baseline Income</p>
                 <div className="relative">
                   <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm">{getCurrencySymbol(settings.currency)}</span>
                   <input 
                     type="number" 
                     value={localIncome} 
                     onChange={(e) => handleIncomeChange(e.target.value)} 
                     className="w-full bg-brand-accent pl-8 pr-3 py-3 rounded-xl text-xs font-black outline-none border border-brand-border text-brand-text shadow-inner" 
                   />
                 </div>
              </div>

              <div className="space-y-2">
                 <div className="flex items-center justify-between ml-1">
                   <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Target Split (50/30/20)</p>
                   <div className="flex items-center gap-1">
                      <span className="text-[9px] font-black text-brand-primary uppercase">
                         {parseInt(localNeeds) + parseInt(localWants) + parseInt(localSavings)}%
                      </span>
                   </div>
                 </div>
                 <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest ml-1">Needs</span>
                      <div className="relative">
                         <input 
                           type="number" 
                           value={localNeeds} 
                           onChange={(e) => handleSplitChange('Needs', e.target.value)} 
                           className="w-full bg-brand-accent px-3 py-2.5 rounded-xl text-[10px] font-black outline-none border border-brand-border text-brand-text shadow-inner" 
                         />
                         <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] font-bold text-slate-500">%</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest ml-1">Wants</span>
                      <div className="relative">
                         <input 
                           type="number" 
                           value={localWants} 
                           onChange={(e) => handleSplitChange('Wants', e.target.value)} 
                           className="w-full bg-brand-accent px-3 py-2.5 rounded-xl text-[10px] font-black outline-none border border-brand-border text-brand-text shadow-inner" 
                         />
                         <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] font-bold text-slate-500">%</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest ml-1">Saves</span>
                      <div className="relative">
                         <input 
                           type="number" 
                           value={localSavings} 
                           onChange={(e) => handleSplitChange('Savings', e.target.value)} 
                           className="w-full bg-brand-accent px-3 py-2.5 rounded-xl text-[10px] font-black outline-none border border-brand-border text-brand-text shadow-inner" 
                         />
                         <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] font-bold text-slate-500">%</span>
                      </div>
                    </div>
                 </div>
              </div>
            </div>
          )}
        </section>

        {/* Storage Options */}
        <section className={sectionClass}>
          {renderSectionHeader(
            'storage', 
            <><Database size={12} /> Storage Options</>, 
            'Firebase sync, Google Drive backup, JSON import/export & reset options'
          )}
          {openSections.storage && (
            <div className="px-4 pb-4 pt-1 border-t border-brand-border/40 space-y-3 animate-fade-in mt-1">
              {/* Firebase Active Badge */}
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 flex items-center justify-between mt-1">
                <div className="flex items-center gap-2.5">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
                  <div>
                    <p className="text-[10px] font-black text-emerald-400 uppercase tracking-tight">Firebase Cloud Sync Active</p>
                    <p className="text-[8px] font-medium text-slate-400">Data automatically synced to cloud database. Safe from cache wipes.</p>
                  </div>
                </div>
                <Cloud size={16} className="text-emerald-400 shrink-0" />
              </div>

              {/* Google Drive Storage Card */}
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      <HardDrive size={16} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-[10px] font-black text-amber-400 uppercase tracking-tight">Google Drive Storage</p>
                        {user?.accessToken ? (
                          <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 text-[8px] font-black uppercase tracking-wider">
                            Connected
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded-md bg-slate-500/20 text-slate-400 text-[8px] font-black uppercase tracking-wider">
                            Not Connected
                          </span>
                        )}
                      </div>
                      <p className="text-[8px] font-medium text-slate-400">
                        {user?.accessToken 
                          ? `Linked as ${user.email || 'Google User'}. Files saved as jk_vault_snapshot.json`
                          : 'Connect Google Drive to store vault snapshots directly in your drive.'}
                      </p>
                    </div>
                  </div>

                  {user?.accessToken && onToggleGoogleDriveAutoSync && (
                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <span className="text-[8px] font-bold text-slate-400 uppercase">Auto-Sync</span>
                      <input 
                        type="checkbox" 
                        checked={!!settings.isGoogleDriveSyncEnabled} 
                        onChange={(e) => {
                          triggerHaptic(30);
                          onToggleGoogleDriveAutoSync(e.target.checked);
                        }} 
                        className="sr-only peer"
                      />
                      <div className="w-8 h-4 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-amber-500 relative"></div>
                    </label>
                  )}
                </div>

                {driveMessage && (
                  <div className={`p-2 rounded-lg text-[9px] font-semibold flex items-center gap-2 ${
                    driveMessage.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                    driveMessage.type === 'error' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                    'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                  }`}>
                    <Check size={12} className="shrink-0" />
                    <span>{driveMessage.text}</span>
                  </div>
                )}

                {user?.accessToken ? (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      onClick={handleDriveSyncClick}
                      disabled={isDriveSyncing || isDriveRestoring}
                      className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[9px] font-black uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer"
                    >
                      {isDriveSyncing ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <CloudUpload size={13} />
                      )}
                      <span>Backup to Drive</span>
                    </button>

                    <button
                      onClick={handleDriveRestoreClick}
                      disabled={isDriveSyncing || isDriveRestoring}
                      className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 text-[9px] font-black uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer"
                    >
                      {isDriveRestoring ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <CloudDownload size={13} />
                      )}
                      <span>Restore from Drive</span>
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleConnectGoogleDrive}
                    disabled={isConnectingDrive}
                    className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer"
                  >
                    {isConnectingDrive ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <LogIn size={13} />
                    )}
                    <span>Connect Google Drive</span>
                  </button>
                )}
              </div>

              <input type="file" ref={jsonInputRef} onChange={handleJSONChange} className="hidden" accept=".json,application/json" />

              {/* Main Data Management Actions */}
              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => { triggerHaptic(); onExport(); }} 
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-brand-surface border border-brand-border hover:bg-brand-accent/50 transition-all text-left group cursor-pointer"
                >
                  <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 shrink-0">
                    <Download size={16} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-brand-text uppercase tracking-tight">Export Backup</p>
                    <p className="text-[8px] font-medium text-slate-400">Save data to JSON file</p>
                  </div>
                </button>

                <button 
                  onClick={() => { triggerHaptic(); jsonInputRef.current?.click(); }} 
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-brand-surface border border-brand-border hover:bg-brand-accent/50 transition-all text-left group cursor-pointer"
                >
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 shrink-0">
                    <Upload size={16} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-brand-text uppercase tracking-tight">Restore Backup</p>
                    <p className="text-[8px] font-medium text-slate-400">Import saved JSON file</p>
                  </div>
                </button>

                <button 
                  onClick={() => { triggerHaptic(); onOpenCategoryManager(); }} 
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-brand-surface border border-brand-border hover:bg-brand-accent/50 transition-all text-left group cursor-pointer"
                >
                  <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 shrink-0">
                    <Tag size={16} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-brand-text uppercase tracking-tight">Category Tags</p>
                    <p className="text-[8px] font-medium text-slate-400">Manage categories & rules</p>
                  </div>
                </button>

                <button 
                  onClick={() => { triggerHaptic(); onLoadMockData(); }} 
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-brand-surface border border-brand-border hover:bg-brand-accent/50 transition-all text-left group cursor-pointer"
                >
                  <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 shrink-0">
                    <Sparkles size={16} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-brand-text uppercase tracking-tight">Load Sample Data</p>
                    <p className="text-[8px] font-medium text-slate-400">Add demo transactions</p>
                  </div>
                </button>
              </div>

              {/* Cleanup / Reset Actions */}
              <div className="pt-2 border-t border-brand-border/60 flex items-center justify-between gap-2">
                <button 
                  onClick={() => { triggerHaptic(); onPurgeMockData(); }}
                  className="flex-1 py-2 px-3 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-[9px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Trash2 size={12} />
                  Clear Sample Data
                </button>

                <button 
                  onClick={() => { triggerHaptic(); onReset(); }}
                  className="flex-1 py-2 px-3 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 border border-rose-500/30 text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ShieldAlert size={12} />
                  Reset App Data
                </button>
              </div>
            </div>
          )}
        </section>

        {/* AI Neural Engine & Agent Configuration */}
        <section className={sectionClass}>
          {renderSectionHeader(
            'ai', 
            <><BrainCircuit size={12} className="text-amber-400" /> AI Neural Engine</>, 
            `Agent: ${selectedAgent} • ${aiEnabled ? 'Enabled' : 'Disabled'}`,
            <span className={`text-[7px] font-black px-2 py-0.5 rounded-full border uppercase ${aiEnabled ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30'}`}>
              {aiEnabled ? 'ON' : 'OFF'}
            </span>
          )}
          {openSections.ai && (
            <div className="px-4 pb-4 pt-1 border-t border-brand-border/40 space-y-4 animate-fade-in mt-1">
              <div className="flex items-center justify-between pt-1">
                <div>
                  <p className="text-[10px] font-black text-brand-text uppercase tracking-tight">AI Engine Control</p>
                  <p className="text-[8px] text-slate-400 font-medium">Enable/disable automated insights & SMS parsing</p>
                </div>
                <button 
                  onClick={handleToggleAi}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all active:scale-95 cursor-pointer ${aiEnabled ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400' : 'bg-rose-500/10 border-rose-500/40 text-rose-400'}`}
                >
                  <Power size={12} />
                  <span className="text-[9px] font-black uppercase tracking-wider">{aiEnabled ? 'AI Enabled' : 'AI Off'}</span>
                </button>
              </div>

              {aiEnabled && (
                <div className="space-y-4 pt-1">
                  {/* AI Navigation Tabs */}
                  <div className="bg-brand-accent p-1 rounded-2xl flex border border-brand-border shadow-inner">
                    <button
                      onClick={() => { triggerHaptic(10); setActiveAiTab('agents'); }}
                      className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${activeAiTab === 'agents' ? 'bg-brand-surface text-brand-text shadow-md font-black' : 'text-slate-500 opacity-60 font-bold'}`}
                    >
                      <Bot size={13} className={activeAiTab === 'agents' ? 'text-amber-400' : ''} />
                      <span className="text-[9px] uppercase tracking-wider">Agents & Keys</span>
                    </button>
                    <button
                      onClick={() => { triggerHaptic(10); setActiveAiTab('tokens'); }}
                      className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${activeAiTab === 'tokens' ? 'bg-brand-surface text-brand-text shadow-md font-black' : 'text-slate-500 opacity-60 font-bold'}`}
                    >
                      <BarChart2 size={13} className={activeAiTab === 'tokens' ? 'text-emerald-400' : ''} />
                      <span className="text-[9px] uppercase tracking-wider">Token Analytics</span>
                    </button>
                  </div>

                  {/* Tab 1: Agents & API Keys */}
                  {activeAiTab === 'agents' && (
                    <div className="space-y-4">
                      {/* Agent Selection Cards */}
                      <div>
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">Select Active AI Agent</label>
                        <div className="grid grid-cols-3 gap-2">
                          {agents.map(ag => {
                            const isSelected = selectedAgent === ag.id;
                            return (
                              <button
                                key={ag.id}
                                onClick={() => handleSelectAgent(ag.id)}
                                className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all active:scale-95 relative overflow-hidden bg-gradient-to-br ${ag.color} ${isSelected ? 'ring-2 ring-brand-primary border-brand-primary shadow-lg' : 'opacity-60 border-brand-border'} cursor-pointer`}
                              >
                                {isSelected && (
                                  <div className="absolute top-1 right-1">
                                    <CheckCircle2 size={12} className="text-brand-primary" />
                                  </div>
                                )}
                                <div className="space-y-0.5">
                                  <span className="text-[10px] font-black uppercase text-brand-text block">{ag.name}</span>
                                  <span className="text-[7px] font-bold text-slate-400 uppercase block">{ag.provider}</span>
                                </div>
                                <span className={`text-[6px] font-black px-1.5 py-0.5 rounded uppercase mt-2 self-start ${ag.badgeColor}`}>
                                  {isSelected ? 'Active' : 'Select'}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Personal API Keys Accordion/Inputs */}
                      <div className="bg-brand-accent p-3.5 rounded-2xl border border-brand-border space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                            <Key size={10} className="text-brand-primary" /> Personalized Token API Keys
                          </span>
                          <span className="text-[7px] font-bold text-slate-500 uppercase">Optional Override</span>
                        </div>

                        <div className="space-y-2.5">
                          {/* Gemini Key */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[8px] font-bold text-slate-300">Google Gemini API Key</span>
                              <span className="text-[6px] font-bold text-slate-500">{geminiKey ? 'Custom Key Set' : 'Default System Key'}</span>
                            </div>
                            <div className="relative flex items-center">
                              <input
                                type={showGeminiKey ? 'text' : 'password'}
                                value={geminiKey}
                                onChange={(e) => handleApiKeyChange('Gemini', e.target.value)}
                                placeholder="Using system key (enter custom key if desired)"
                                className="w-full bg-brand-surface pl-3 pr-8 py-2 rounded-xl text-[10px] font-mono border border-brand-border text-brand-text outline-none shadow-inner"
                              />
                              <button
                                type="button"
                                onClick={() => setShowGeminiKey(!showGeminiKey)}
                                className="absolute right-2 text-slate-500 hover:text-white"
                              >
                                {showGeminiKey ? <EyeOff size={12} /> : <Eye size={12} />}
                              </button>
                            </div>
                          </div>

                          {/* Claude Key */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[8px] font-bold text-slate-300">Anthropic Claude API Key</span>
                              <span className="text-[6px] font-bold text-slate-500">{claudeKey ? 'Custom Key Set' : 'Required for Claude'}</span>
                            </div>
                            <div className="relative flex items-center">
                              <input
                                type={showClaudeKey ? 'text' : 'password'}
                                value={claudeKey}
                                onChange={(e) => handleApiKeyChange('Claude', e.target.value)}
                                placeholder="sk-ant-api..."
                                className="w-full bg-brand-surface pl-3 pr-8 py-2 rounded-xl text-[10px] font-mono border border-brand-border text-brand-text outline-none shadow-inner"
                              />
                              <button
                                type="button"
                                onClick={() => setShowClaudeKey(!showClaudeKey)}
                                className="absolute right-2 text-slate-500 hover:text-white"
                              >
                                {showClaudeKey ? <EyeOff size={12} /> : <Eye size={12} />}
                              </button>
                            </div>
                          </div>

                          {/* Grok Key */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[8px] font-bold text-slate-300">xAI Grok API Key</span>
                              <span className="text-[6px] font-bold text-slate-500">{grokKey ? 'Custom Key Set' : 'Required for Grok'}</span>
                            </div>
                            <div className="relative flex items-center">
                              <input
                                type={showGrokKey ? 'text' : 'password'}
                                value={grokKey}
                                onChange={(e) => handleApiKeyChange('Grok', e.target.value)}
                                placeholder="xai-api..."
                                className="w-full bg-brand-surface pl-3 pr-8 py-2 rounded-xl text-[10px] font-mono border border-brand-border text-brand-text outline-none shadow-inner"
                              />
                              <button
                                type="button"
                                onClick={() => setShowGrokKey(!showGrokKey)}
                                className="absolute right-2 text-slate-500 hover:text-white"
                              >
                                {showGrokKey ? <EyeOff size={12} /> : <Eye size={12} />}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Tab 2: Token Analytics */}
                  {activeAiTab === 'tokens' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                          <BarChart2 size={10} className="text-emerald-400" /> Token Consumption Stats
                        </span>
                        {tokenHistory.length > 0 && (
                          <button
                            onClick={handleClearTokenHistory}
                            className="text-[7px] font-black text-rose-400 hover:text-rose-300 uppercase tracking-widest flex items-center gap-1 active:scale-95 cursor-pointer"
                          >
                            <Trash2 size={9} /> Reset History
                          </button>
                        )}
                      </div>

                      {/* Metrics cards */}
                      <div className="grid grid-cols-3 gap-2">
                        <div className="p-3 bg-brand-accent rounded-2xl border border-brand-border flex flex-col justify-between">
                          <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest">Today's Tokens</span>
                          <span className="text-sm font-black text-emerald-400 mt-1">{todayTokens.toLocaleString()}</span>
                        </div>
                        <div className="p-3 bg-brand-accent rounded-2xl border border-brand-border flex flex-col justify-between">
                          <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest">Today's Calls</span>
                          <span className="text-sm font-black text-indigo-400 mt-1">{todayCalls} reqs</span>
                        </div>
                        <div className="p-3 bg-brand-accent rounded-2xl border border-brand-border flex flex-col justify-between">
                          <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest">Lifetime Tokens</span>
                          <span className="text-sm font-black text-amber-400 mt-1">{totalLifetimeTokens.toLocaleString()}</span>
                        </div>
                      </div>

                      {/* Daily History Interval List */}
                      <div className="space-y-1.5">
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block px-1">Daily Token Log</span>
                        {tokenHistory.length === 0 ? (
                          <div className="p-4 text-center rounded-2xl bg-brand-accent/50 border border-brand-border/50">
                            <Activity size={18} className="mx-auto text-slate-600 mb-1" />
                            <p className="text-[9px] font-bold text-slate-500 uppercase">No token usage logged yet</p>
                            <p className="text-[7px] text-slate-600">Tokens used for SMS parsing & AI advice will appear here daily.</p>
                          </div>
                        ) : (
                          <div className="space-y-1.5 max-h-48 overflow-y-auto no-scrollbar pr-1">
                            {tokenHistory.slice().reverse().map((entry, idx) => {
                              const agentColors: Record<AIAgent, string> = {
                                Gemini: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
                                Claude: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
                                Grok: 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                              };
                              return (
                                <div key={idx} className="p-2.5 bg-brand-accent/80 rounded-xl border border-brand-border flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className={`text-[7px] font-black px-2 py-0.5 rounded border uppercase ${agentColors[entry.agent] || 'bg-slate-700 text-slate-300'}`}>
                                      {entry.agent}
                                    </span>
                                    <span className="text-[9px] font-mono text-slate-300">{entry.date}</span>
                                  </div>
                                  <div className="text-right">
                                    <span className="text-[10px] font-black text-brand-primary block">{entry.tokens.toLocaleString()} tokens</span>
                                    <span className="text-[7px] font-bold text-slate-500 uppercase block">{entry.count} calls</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

      </div>
    </div>
  );
};

const themes: { id: AppTheme, icon: React.ReactNode }[] = [
  { id: 'Batman', icon: <BatmanIcon /> },
  { id: 'Moon', icon: <MoonIcon /> },
  { id: 'Spiderman', icon: <SpiderIcon /> },
  { id: 'CaptainAmerica', icon: <CaptainAmericaIcon /> },
  { id: 'Naruto', icon: <NarutoIcon /> }
];

export default Settings;
