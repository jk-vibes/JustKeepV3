import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { Expense, UserSettings, Category, WealthItem, BudgetItem, Bill, AIAgent, DailyTokenUsage } from "../types";
import { getCurrencySymbol } from "../constants";

const TOKEN_USAGE_KEY = 'jk_ai_token_history_v1';

export function getDailyTokenUsage(): DailyTokenUsage[] {
  try {
    const raw = localStorage.getItem(TOKEN_USAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function recordTokenUsage(tokens: number, agent: AIAgent = 'Gemini'): DailyTokenUsage[] {
  if (!tokens || tokens <= 0) return getDailyTokenUsage();
  try {
    const history = getDailyTokenUsage();
    const today = new Date().toISOString().split('T')[0];
    const existingIndex = history.findIndex(h => h.date === today && h.agent === agent);
    
    if (existingIndex >= 0) {
      history[existingIndex].tokens += tokens;
      history[existingIndex].count += 1;
    } else {
      history.push({ date: today, tokens, count: 1, agent });
    }
    
    // Maintain up to 90 days of history
    const trimmed = history.slice(-90);
    localStorage.setItem(TOKEN_USAGE_KEY, JSON.stringify(trimmed));
    window.dispatchEvent(new CustomEvent('tokenUsageUpdated', { detail: trimmed }));
    return trimmed;
  } catch (e) {
    console.warn("Failed to record token usage", e);
    return [];
  }
}

export function clearTokenUsageHistory() {
  localStorage.removeItem(TOKEN_USAGE_KEY);
  window.dispatchEvent(new CustomEvent('tokenUsageUpdated', { detail: [] }));
}

let isProcessing = false;
const queue: (() => Promise<void>)[] = [];

async function processQueue() {
  if (isProcessing || queue.length === 0) return;
  isProcessing = true;
  const task = queue.shift();
  if (task) await task();
  isProcessing = false;
  processQueue();
}

async function withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 15000): Promise<T> {
  return new Promise((resolve, reject) => {
    const execute = async () => {
      try {
        const result = await fn();
        resolve(result);
      } catch (error: any) {
        const errorStr = (error?.message || "").toUpperCase();
        const isRateLimit = errorStr.includes('429') || errorStr.includes('RESOURCE_EXHAUSTED') || errorStr.includes('QUOTA');
        
        if (isRateLimit && retries > 0) {
          const jitter = Math.random() * 3000;
          const waitTime = delay + jitter;
          await new Promise(r => setTimeout(r, waitTime));
          queue.push(() => withRetry(fn, retries - 1, delay * 2).then(resolve).catch(reject));
          processQueue();
        } else {
          reject(error);
        }
      }
    };

    queue.push(execute);
    processQueue();
  });
}

const INSIGHT_CACHE_KEY = 'jk_ai_insights_cache';

export function getExpensesHash(expenses: Expense[], settings: UserSettings): string {
  const confirmed = expenses
    .filter(e => e.isConfirmed)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(e => `${e.id}-${Math.round(e.amount)}`);
  return `v7-tactical-${settings.currency}-${Math.round(settings.monthlyIncome)}-${confirmed.length}-${confirmed.slice(-5).join('|')}`;
}

export function getAIClient(settings?: UserSettings) {
  let aiEnabled = settings?.aiEnabled;
  let selectedAgent: AIAgent = settings?.selectedAgent || 'Gemini';
  let apiKeys = settings?.apiKeys || {};

  if (aiEnabled === undefined) {
    try {
      const storedSettings = localStorage.getItem('jk_budget_data_whole_num_v12');
      if (storedSettings) {
        const parsed = JSON.parse(storedSettings);
        if (parsed.settings) {
          aiEnabled = parsed.settings.aiEnabled !== undefined ? parsed.settings.aiEnabled : true;
          selectedAgent = parsed.settings.selectedAgent || 'Gemini';
          apiKeys = parsed.settings.apiKeys || {};
        }
      }
    } catch (e) {
      // fallback
    }
  }

  if (aiEnabled === false) {
    return { client: null, agent: selectedAgent, enabled: false };
  }

  const customKey = apiKeys[selectedAgent]?.trim();
  let clientKey = customKey;

  if (!clientKey && selectedAgent === 'Gemini') {
    clientKey = process.env.API_KEY || process.env.GEMINI_API_KEY || '';
  }

  if (!clientKey) {
    return { client: null, agent: selectedAgent, enabled: true, missingKey: true };
  }

  const client = new GoogleGenAI({ apiKey: clientKey });
  return { client, agent: selectedAgent, enabled: true, customKey: !!customKey, key: clientKey };
}

export async function generateContentWithActiveAgent(
  prompt: string,
  options?: {
    responseMimeType?: string;
    responseSchema?: any;
    inlineData?: { data: string; mimeType: string };
    settings?: UserSettings;
    modelOverride?: string;
  }
): Promise<{ text: string; tokensUsed: number; agentUsed: AIAgent }> {
  const { client, agent, enabled, missingKey, key } = getAIClient(options?.settings);

  if (!enabled) {
    throw new Error("AI features are disabled in Settings.");
  }

  if (agent === 'Claude' && key) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 2000,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      if (!res.ok) throw new Error(`Claude API error: ${res.statusText}`);
      const data = await res.json();
      const text = data.content?.[0]?.text || '';
      const tokens = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0) || Math.ceil((prompt.length + text.length) / 4);
      recordTokenUsage(tokens, 'Claude');
      return { text, tokensUsed: tokens, agentUsed: 'Claude' };
    } catch (err) {
      console.warn("Claude API call failed, attempting Gemini fallback", err);
    }
  }

  if (agent === 'Grok' && key) {
    try {
      const res = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'grok-beta',
          messages: [{ role: 'user', content: prompt }]
        })
      });
      if (!res.ok) throw new Error(`Grok API error: ${res.statusText}`);
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || '';
      const tokens = data.usage?.total_tokens || Math.ceil((prompt.length + text.length) / 4);
      recordTokenUsage(tokens, 'Grok');
      return { text, tokensUsed: tokens, agentUsed: 'Grok' };
    } catch (err) {
      console.warn("Grok API call failed, attempting Gemini fallback", err);
    }
  }

  if (!client) {
    if (missingKey) {
      throw new Error(`Personal API Key required for ${agent}. Please enter it in Settings.`);
    }
    throw new Error("AI client unavailable.");
  }

  const model = options?.modelOverride || 'gemini-3-flash-preview';
  const contentsParts: any[] = [{ text: prompt }];
  if (options?.inlineData) {
    contentsParts.push({ inlineData: options.inlineData });
  }

  const config: any = {};
  if (options?.responseMimeType) config.responseMimeType = options.responseMimeType;
  if (options?.responseSchema) config.responseSchema = options.responseSchema;

  const response = await withRetry<GenerateContentResponse>(() =>
    client.models.generateContent({
      model,
      contents: [{ parts: contentsParts }],
      config: Object.keys(config).length > 0 ? config : undefined
    })
  );

  const responseText = response.text || '';
  const tokens = response.usageMetadata?.totalTokenCount || Math.ceil((prompt.length + responseText.length) / 4);
  recordTokenUsage(tokens, agent);

  return { text: responseText, tokensUsed: tokens, agentUsed: agent };
}

export async function refineBatchTransactions(
  transactions: Array<{ id: string, amount: number, merchant: string, note: string, date: string }>, 
  budgetContext?: string,
  settings?: UserSettings
): Promise<Array<{ id: string, merchant: string, category: Category, mainCategory: string, subCategory: string, note: string, isAvoidSuggestion: boolean, isDuplicateOf?: string }>> {
  if (!transactions.length) return [];
  const prompt = `
    Role: Strict "Daddy Mind" financial auditor.
    Analyze and categorize these ${transactions.length} transactions.
    ${budgetContext ? `BUDGET CONTEXT: ${budgetContext}` : ''}
    
    TAXONOMY RULES:
    1. 'category' MUST be one of: [Needs, Wants, Savings].
    2. Set 'isAvoidSuggestion' to true if wasteful or impulsive.
    3. Clean merchant name. Concisely generate 'note'.
    
    Data: ${JSON.stringify(transactions)}
    Return JSON array.
  `;

  try {
    const res = await generateContentWithActiveAgent(prompt, {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            merchant: { type: Type.STRING },
            category: { type: Type.STRING },
            mainCategory: { type: Type.STRING },
            subCategory: { type: Type.STRING },
            note: { type: Type.STRING },
            isAvoidSuggestion: { type: Type.BOOLEAN },
            isDuplicateOf: { type: Type.STRING }
          },
          required: ["id", "merchant", "category", "mainCategory", "subCategory", "note", "isAvoidSuggestion"]
        }
      },
      settings
    });

    const results = JSON.parse(res.text || '[]');
    return results.map((r: any) => {
      let bucket = r.category as Category;
      if (r.category === 'Saves') bucket = 'Savings';
      if (!['Needs', 'Wants', 'Savings', 'Avoids', 'Uncategorized'].includes(bucket)) {
        bucket = 'Uncategorized';
      }
      return { ...r, category: bucket };
    });
  } catch (error) {
    console.error("Refinement failure:", error);
    return [];
  }
}

export async function auditTransaction(expense: Expense, currency: string, budgetContext?: string, settings?: UserSettings) {
  const symbol = getCurrencySymbol(currency);
  const prompt = `
    Role: Strict "Daddy Mind" financial auditor.
    Audit transaction:
    Merchant: ${expense.merchant || 'Unknown'}, Amount: ${symbol}${Math.round(expense.amount)} (${currency}), Category: ${expense.category}.
    ${budgetContext ? `BUDGET CONTEXT: ${budgetContext}` : ''}
    
    CRITICAL CURRENCY MANDATE:
    If your insight text references any monetary amounts or costs, ALWAYS use the symbol '${symbol}' (${currency}). DO NOT output dollar signs ('$') or refer to dollars unless currency is explicitly USD.
    Return JSON.
  `;

  try {
    const res = await generateContentWithActiveAgent(prompt, {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          isCorrect: { type: Type.BOOLEAN },
          suggestedCategory: { type: Type.STRING },
          suggestedMainCategory: { type: Type.STRING },
          suggestedSubCategory: { type: Type.STRING },
          merchant: { type: Type.STRING },
          insight: { type: Type.STRING },
          isAnomaly: { type: Type.BOOLEAN },
          potentialAvoid: { type: Type.BOOLEAN }
        },
        required: ["isCorrect", "suggestedCategory", "suggestedMainCategory", "suggestedSubCategory", "merchant", "insight", "isAnomaly", "potentialAvoid"]
      },
      settings
    });
    const result = JSON.parse(res.text || '{}');
    if (result.suggestedCategory === 'Saves') result.suggestedCategory = 'Savings';
    return result;
  } catch (error) {
    return null;
  }
}

export async function getFatherlyAdvice(
  expenses: Expense[],
  wealthItems: WealthItem[],
  settings: UserSettings
): Promise<string> {
  const assets = wealthItems.filter(i => i.type === 'Investment').reduce((sum, i) => sum + i.value, 0);
  const liabilities = wealthItems.filter(i => i.type === 'Liability').reduce((sum, i) => sum + i.value, 0);
  const m = new Date().getMonth();
  const y = new Date().getFullYear();
  const recentSpend = expenses
    .filter(e => new Date(e.date).getMonth() === m && new Date(e.date).getFullYear() === y)
    .reduce((sum, e) => sum + e.amount, 0);

  const symbol = getCurrencySymbol(settings.currency);

  const prompt = `
    Role: Wise father advisor ("Daddy Mind").
    User's Primary Currency: ${settings.currency} (Symbol: '${symbol}').

    Financial Snapshot:
    - Total Assets: ${symbol}${Math.round(assets)} ${settings.currency}
    - Total Debt: ${symbol}${Math.round(liabilities)} ${settings.currency}
    - Spent This Month: ${symbol}${Math.round(recentSpend)} ${settings.currency}
    - Monthly Income: ${symbol}${Math.round(settings.monthlyIncome)} ${settings.currency}

    Instructions:
    1. Give actionable, firm, wise fatherly advice in under 30 words.
    2. ABSOLUTE CURRENCY MANDATE: Whenever you mention monetary figures or costs in your advice text, you MUST use the currency symbol '${symbol}' (or code ${settings.currency}). NEVER use '$' or refer to 'dollars' unless the user's currency is explicitly USD.
  `;

  try {
    const res = await generateContentWithActiveAgent(prompt, { settings });
    return res.text?.trim() || "Watch your step with those expenses, son.";
  } catch (error) {
    return "Wealth isn't about what you spend, it's about what you keep.";
  }
}

export async function parseTransactionText(text: string, currency: string, settings?: UserSettings): Promise<{ entryType: 'Expense' | 'Income', amount: number, merchant: string, category: Category, mainCategory: string, subCategory: string, date: string, incomeType?: string, accountName?: string } | null> {
  const prompt = `
    Role: Strict "Daddy Mind" financial auditor.
    Extract from: "${text}". Currency: ${currency}.
    Required: Bucket (Needs/Wants/Savings/Avoids), Primary Category, Sub Node. Clean merchant.
    Return JSON.
  `;

  try {
    const res = await generateContentWithActiveAgent(prompt, {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          entryType: { type: Type.STRING },
          amount: { type: Type.NUMBER },
          merchant: { type: Type.STRING },
          category: { type: Type.STRING },
          mainCategory: { type: Type.STRING },
          subCategory: { type: Type.STRING },
          date: { type: Type.STRING },
          incomeType: { type: Type.STRING },
          accountName: { type: Type.STRING }
        },
        required: ["entryType", "amount", "merchant", "category", "mainCategory", "subCategory", "date"]
      },
      settings
    });

    const result = JSON.parse(res.text || '{}');
    if (result.category === 'Saves') result.category = 'Savings';
    const validCategories: Category[] = ['Needs', 'Wants', 'Savings', 'Avoids', 'Uncategorized'];
    return {
      entryType: (result.entryType === 'Income' ? 'Income' : 'Expense'),
      amount: Math.round(Math.abs(result.amount || 0)),
      merchant: result.merchant || result.accountName || 'Merchant',
      category: validCategories.includes(result.category) ? result.category : 'Uncategorized',
      mainCategory: result.mainCategory || 'Miscellaneous',
      subCategory: result.subCategory || 'Other',
      date: result.date || new Date().toISOString().split('T')[0],
      incomeType: result.incomeType,
      accountName: result.accountName
    };
  } catch (error) {
    return null;
  }
}

export async function generateQuickNote(merchant: string, mainCategory: string, subCategory: string, settings?: UserSettings): Promise<string> {
  const prompt = `Short professional description for ${merchant}: ${mainCategory} (${subCategory}). Max 8 words. String only.`;
  try {
    const res = await generateContentWithActiveAgent(prompt, { settings });
    return res.text?.trim().replace(/^["']|["']$/g, '') || `${merchant}: ${subCategory}`;
  } catch (error) {
    return `${merchant}: ${subCategory}`;
  }
}

export async function parseBulkTransactions(text: string, currency: string, settings?: UserSettings): Promise<any[]> {
  const prompt = `
    Role: Strict "Daddy Mind" financial auditor.
    Analyze logs, extract transactions. Currency ${currency}.
    Provide Bucket (Needs/Wants/Savings/Avoids), Primary Category, Sub Node. JSON array.
  `;
  try {
    const res = await generateContentWithActiveAgent(prompt, {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            entryType: { type: Type.STRING },
            amount: { type: Type.NUMBER },
            merchant: { type: Type.STRING },
            category: { type: Type.STRING },
            mainCategory: { type: Type.STRING },
            subCategory: { type: Type.STRING },
            date: { type: Type.STRING },
            incomeType: { type: Type.STRING },
            accountName: { type: Type.STRING },
            rawContent: { type: Type.STRING },
            isAvoidSuggestion: { type: Type.BOOLEAN }
          },
          required: ["entryType", "date"]
        }
      },
      settings
    });
    const rawResults = JSON.parse(res.text || '[]');
    return rawResults.map((r: any) => {
      if (r.category === 'Saves') r.category = 'Savings';
      return r;
    });
  } catch (error) {
    return [];
  }
}

export async function batchProcessNewTransactions(
  items: Array<{ merchant: string, amount: number, date: string, note?: string }>,
  budgetContext?: string,
  settings?: UserSettings
): Promise<Array<{ merchant: string, category: Category, mainCategory: string, subCategory: string, intelligentNote: string, isAvoidSuggestion?: boolean }>> {
  if (!items.length) return [];
  const prompt = `
    Role: Strict "Daddy Mind" financial auditor.
    Process ${items.length} transactions: ${JSON.stringify(items)}. 
    Assign Bucket (Needs/Wants/Savings/Avoids), Primary Category, Sub Node.
    ${budgetContext ? `BUDGET CONTEXT: ${budgetContext}` : ''}
  `;
  try {
    const res = await generateContentWithActiveAgent(prompt, {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            merchant: { type: Type.STRING },
            category: { type: Type.STRING },
            mainCategory: { type: Type.STRING },
            subCategory: { type: Type.STRING },
            intelligentNote: { type: Type.STRING }
          },
          required: ["merchant", "category", "mainCategory", "subCategory", "intelligentNote"]
        }
      },
      settings
    });
    const rawResults = JSON.parse(res.text || '[]');
    return rawResults.map((r: any) => {
      if (r.category === 'Saves') r.category = 'Savings';
      return r;
    });
  } catch (error) {
    return [];
  }
}

export async function getDecisionAdvice(
  expenses: Expense[],
  wealthItems: WealthItem[],
  settings: UserSettings,
  query: string
): Promise<{ status: 'Safe' | 'Caution' | 'Danger', score: number, reasoning: string, actionPlan: string[], waitTime: string, impactPercentage: number }> {
  const assets = wealthItems.filter(i => i.type === 'Investment').reduce((sum, i) => sum + i.value, 0);
  const liabilities = wealthItems.filter(i => i.type === 'Liability').reduce((sum, i) => sum + i.value, 0);
  const netWorth = assets - liabilities;
  const m = new Date().getMonth();
  const y = new Date().getFullYear();
  const currentMonthSpent = expenses.filter(e => new Date(e.date).getMonth() === m && new Date(e.date).getFullYear() === y).reduce((sum, e) => sum + e.amount, 0);

  const symbol = getCurrencySymbol(settings.currency);

  const prompt = `
    Role: Strict "Daddy Mind" financial auditor and decision advisor.
    User's Currency: ${settings.currency} (Symbol: '${symbol}')
    Financial Snapshot:
    - Net Worth: ${symbol}${Math.round(netWorth)} ${settings.currency}
    - Assets: ${symbol}${Math.round(assets)} ${settings.currency}
    - Debt: ${symbol}${Math.round(liabilities)} ${settings.currency}
    - Monthly Spent: ${symbol}${Math.round(currentMonthSpent)} ${settings.currency}

    Evaluate purchase/decision query: "${query}".

    ABSOLUTE CURRENCY MANDATE:
    If your reasoning or action plan mentions any dollar/currency amounts, you MUST use the symbol '${symbol}' (${settings.currency}). DO NOT output '$' or refer to 'dollars' unless user currency is explicitly USD.

    Return JSON matching schema.
  `;

  try {
    const res = await generateContentWithActiveAgent(prompt, {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          status: { type: Type.STRING, enum: ['Safe', 'Caution', 'Danger'] },
          score: { type: Type.NUMBER },
          reasoning: { type: Type.STRING },
          actionPlan: { type: Type.ARRAY, items: { type: Type.STRING } },
          waitTime: { type: Type.STRING },
          impactPercentage: { type: Type.NUMBER }
        },
        required: ["status", "score", "reasoning", "actionPlan", "waitTime", "impactPercentage"]
      },
      settings
    });
    return JSON.parse(res.text || '{}');
  } catch (error: any) {
    return {
      status: 'Caution',
      score: 50,
      reasoning: error?.message || "AI service not available or disabled.",
      actionPlan: ["Check manual liquidity"],
      waitTime: "N/A",
      impactPercentage: 0
    };
  }
}

export async function analyzeBankStatement(fileData: string, mimeType: string, currency: string, settings?: UserSettings): Promise<{ transactions: any[], hiddenCharges: any[], summary: string }> {
  const prompt = `
    Role: Senior Financial Forensic Auditor.
    Currency: ${currency}.
    Analyze the attached bank statement.
  `;

  try {
    const res = await generateContentWithActiveAgent(prompt, {
      inlineData: { data: fileData, mimeType },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          transactions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                date: { type: Type.STRING },
                merchant: { type: Type.STRING },
                amount: { type: Type.NUMBER },
                category: { type: Type.STRING },
                mainCategory: { type: Type.STRING },
                subCategory: { type: Type.STRING },
                note: { type: Type.STRING },
                isHiddenCharge: { type: Type.BOOLEAN }
              },
              required: ["date", "merchant", "amount", "category", "mainCategory", "subCategory", "note"]
            }
          },
          hiddenCharges: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                merchant: { type: Type.STRING },
                amount: { type: Type.NUMBER },
                reasoning: { type: Type.STRING }
              },
              required: ["merchant", "amount", "reasoning"]
            }
          },
          summary: { type: Type.STRING }
        },
        required: ["transactions", "hiddenCharges", "summary"]
      },
      settings
    });

    const result = JSON.parse(res.text || '{}');
    if (result.transactions) {
      result.transactions = result.transactions.map((t: any) => {
        if (t.category === 'Saves') t.category = 'Savings';
        if (!['Needs', 'Wants', 'Savings', 'Avoids', 'Uncategorized'].includes(t.category)) {
          t.category = 'Uncategorized';
        }
        return t;
      });
    }
    return result;
  } catch (error) {
    console.error("Statement analysis failure:", error);
    throw error;
  }
}

export async function analyzeBudgetSpending(
  expenses: Expense[],
  budgetItems: BudgetItem[],
  monthlyIncome: number,
  currency: string,
  settings?: UserSettings
): Promise<{
  insights: Array<{
    category: string;
    type: 'warning' | 'info' | 'danger';
    message: string;
    actionableTip: string;
  }>;
  summary: string;
}> {
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const currentMonthExps = expenses.filter(e => {
    const d = new Date(e.date);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });

  const totals = { Needs: 0, Wants: 0, Savings: 0, Avoids: 0 };
  currentMonthExps.forEach(e => {
    if (e.isAvoid) totals.Avoids += e.amount;
    if (e.category === 'Needs') totals.Needs += e.amount;
    else if (e.category === 'Wants') totals.Wants += e.amount;
    else if (e.category === 'Savings') totals.Savings += e.amount;
  });

  const symbol = getCurrencySymbol(currency);
  const prompt = `
    Role: Strict "Daddy Mind" financial auditor.
    User's Primary Currency: ${currency} (Symbol: '${symbol}')
    Income: ${symbol}${Math.round(monthlyIncome)} ${currency}, Spent Needs: ${symbol}${Math.round(totals.Needs)}, Wants: ${symbol}${Math.round(totals.Wants)}, Savings: ${symbol}${Math.round(totals.Savings)}, Wasted: ${symbol}${Math.round(totals.Avoids)}.
    
    STRICT CURRENCY MANDATE:
    All insights, messages, and actionable tips MUST use the symbol '${symbol}' (${currency}) when referencing amounts. DO NOT output '$' or refer to 'dollars' unless currency is explicitly USD.
    Return JSON.
  `;

  try {
    const res = await generateContentWithActiveAgent(prompt, {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          insights: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                category: { type: Type.STRING },
                type: { type: Type.STRING },
                message: { type: Type.STRING },
                actionableTip: { type: Type.STRING }
              },
              required: ["category", "type", "message", "actionableTip"]
            }
          },
          summary: { type: Type.STRING }
        },
        required: ["insights", "summary"]
      },
      settings,
      modelOverride: 'gemini-2.5-flash'
    });

    return JSON.parse(res.text || '{}');
  } catch (error) {
    return {
      insights: [
        {
          category: "General",
          type: "warning",
          message: "Could not fetch AI advice. Please check AI settings.",
          actionableTip: "Verify your API Key in Settings."
        }
      ],
      summary: "Local fallback active."
    };
  }
}
