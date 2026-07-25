import React, { useState, useRef, useEffect } from 'react';
import { UserSettings, UserProfile, AppTheme, WealthItem, DensityLevel, Category, AIAgent, DailyTokenUsage } from '../types';
import { 
  LogOut, Palette, Download, Upload, Zap, Sparkles,
  ShieldAlert, Shield, Trash2, History, Database, Eraser,
  Maximize2, Minimize2, Layout, TrendingUp,
  ChevronRight, Tag, Percent, Loader2, BrainCircuit,
  Key, Eye, EyeOff, Bot, Activity, BarChart2, CheckCircle2,
  Power, RefreshCw, Cpu, Flame, Lock
} from 'lucide-react';
import { triggerHaptic } from '../utils/haptics';
import { getCurrencySymbol } from '../constants';
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
  settings, onLogout, onReset, onUpdateAppTheme, 
  onExport, onRestore, onLoadMockData, onPurgeMockData,
  onUpdateDensity, onUpdateBaseIncome, onUpdateSplit, onOpenCategoryManager,
  onUpdateAISettings
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

  const sectionClass = "bg-brand-surface border border-brand-border rounded-xl mb-2 overflow-hidden shadow-sm";
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
        <div className="absolute top-0 right-0 p-2 opacity-10 text-brand-headerText"><Shield size={40} /></div>
        <div className="flex items-center justify-between relative z-10 w-full px-1">
          <div className="flex-1 min-w-0">
            <h1 className="text-[14px] font-black text-brand-headerText tracking-tight leading-none truncate uppercase">Settings</h1>
            <p className="text-[7px] font-bold text-brand-headerText/50 uppercase tracking-[0.2em] mt-0.5 truncate">Maintenance & Protocol</p>
          </div>
          <button 
            onClick={() => { triggerHaptic(); onLogout(); }}
            className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-brand-headerText transition-colors active:scale-95"
            title="Sign Out"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>

      <div className="px-0.5 flex-1 overflow-y-auto no-scrollbar space-y-2 pb-24">
        
        {/* Visual Protocol */}
        <section className={sectionClass}>
          <div className="p-4">
            <h3 className={labelClass}><Layout size={12} /> Visual Protocol</h3>
            <div className="bg-brand-accent p-1 rounded-2xl flex border border-brand-border shadow-inner">
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
        </section>

        {/* Theme Identity */}
        <section className={sectionClass}>
          <div className="p-4">
            <h3 className={labelClass}><Palette size={12} /> Theme Identity</h3>
            <div className="grid grid-cols-5 gap-2">
              {themes.map(t => (
                <button key={t.id} onClick={() => { triggerHaptic(); onUpdateAppTheme(t.id); }} className={`aspect-square transition-all active:scale-90 flex items-center justify-center relative rounded-xl border-2 ${settings.appTheme === t.id ? 'border-brand-accentUi bg-brand-accentUi/10 shadow-lg' : 'opacity-30 border-transparent'}`}>
                  <div className="w-10 h-10 flex items-center justify-center">{t.icon}</div>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Budget Settings */}
        <section className={sectionClass}>
          <div className="p-4 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className={labelClass}><TrendingUp size={12} /> Budget Settings</h3>
              <span className="text-[6px] font-black text-emerald-500 uppercase tracking-widest flex items-center gap-1 animate-pulse">
                <Sparkles size={8} /> Autosaved
              </span>
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
        </section>

        {/* Data Vault */}
        <section className={sectionClass}>
          <div className="p-4">
            <h3 className={labelClass}><Database size={12} /> Data Vault</h3>
            <div className="grid grid-cols-3 gap-2">
                <button onClick={() => { triggerHaptic(); onLoadMockData(); }} className={vaultButtonClass}>
                  <Sparkles size={16} className="text-brand-accentUi group-hover:animate-pulse" />
                  <span className="text-[8px] font-black uppercase text-brand-text">Mock Data</span>
                </button>
                <button onClick={() => { triggerHaptic(); onExport(); }} className={vaultButtonClass}>
                  <Download size={16} className="text-brand-primary" />
                  <span className="text-[8px] font-black uppercase text-brand-text">Backup</span>
                </button>
                <button onClick={() => { triggerHaptic(); jsonInputRef.current?.click(); }} className={vaultButtonClass}>
                  <History size={16} className="text-brand-primary" />
                  <span className="text-[8px] font-black uppercase text-brand-text">Restore</span>
                </button>
                <input type="file" ref={jsonInputRef} onChange={handleJSONChange} className="hidden" accept=".json,application/json" />
                
                <button onClick={() => { triggerHaptic(); onOpenCategoryManager(); }} className={vaultButtonClass}>
                  <Tag size={16} className="text-brand-primary" />
                  <span className="text-[8px] font-black uppercase text-brand-text">Tags</span>
                </button>
                <button onClick={() => { triggerHaptic(); onPurgeMockData(); }} className={vaultButtonClass}>
                  <Trash2 size={16} className="text-rose-500" />
                  <span className="text-[8px] font-black uppercase text-brand-text">Scrub</span>
                </button>
                <button onClick={() => { triggerHaptic(); onReset(); }} className={`${vaultButtonClass} border-rose-500/30 text-rose-500`}>
                  <ShieldAlert size={16} />
                  <span className="text-[8px] font-black uppercase">Reset</span>
                </button>
            </div>
          </div>
        </section>

        {/* AI Neural Engine & Agent Configuration (Tabbed Section at Bottom) */}
        <section className={sectionClass}>
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className={labelClass}><BrainCircuit size={12} className="text-amber-400" /> AI Neural Engine</h3>
                <p className="text-[8px] text-slate-400 font-medium px-2">Agents, personal tokens & usage analytics</p>
              </div>
              <button 
                onClick={handleToggleAi}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all active:scale-95 ${aiEnabled ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400' : 'bg-rose-500/10 border-rose-500/40 text-rose-400'}`}
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
                    className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all ${activeAiTab === 'agents' ? 'bg-brand-surface text-brand-text shadow-md font-black' : 'text-slate-500 opacity-60 font-bold'}`}
                  >
                    <Bot size={13} className={activeAiTab === 'agents' ? 'text-amber-400' : ''} />
                    <span className="text-[9px] uppercase tracking-wider">Agents & Keys</span>
                  </button>
                  <button
                    onClick={() => { triggerHaptic(10); setActiveAiTab('tokens'); }}
                    className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all ${activeAiTab === 'tokens' ? 'bg-brand-surface text-brand-text shadow-md font-black' : 'text-slate-500 opacity-60 font-bold'}`}
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
                              className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all active:scale-95 relative overflow-hidden bg-gradient-to-br ${ag.color} ${isSelected ? 'ring-2 ring-brand-primary border-brand-primary shadow-lg' : 'opacity-60 border-brand-border'}`}
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
                          className="text-[7px] font-black text-rose-400 hover:text-rose-300 uppercase tracking-widest flex items-center gap-1 active:scale-95"
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
