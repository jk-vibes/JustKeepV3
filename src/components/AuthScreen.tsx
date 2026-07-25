import React, { useState, useEffect } from 'react';
import { UserProfile } from '../types';
import { LogIn, UserCircle, Sparkles, Fingerprint, Loader2, Copy, Check, Key, ShieldAlert, ChevronDown, ChevronUp } from 'lucide-react';
import { triggerHaptic } from '../utils/haptics';
import BrandedLogo from './BrandedLogo';

interface AuthScreenProps {
  onLogin: (user: UserProfile) => void;
}

const DEFAULT_CLIENT_ID = '620152015803-dq34k5jvlkh94af6hu49u8b8m1t6kpar.apps.googleusercontent.com';

const AuthScreen: React.FC<AuthScreenProps> = ({ onLogin }) => {
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [authStatus, setAuthStatus] = useState('');
  const [tokenClient, setTokenClient] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedOrigin, setCopiedOrigin] = useState(false);
  const [showClientIdConfig, setShowClientIdConfig] = useState(false);
  
  const [customClientId, setCustomClientId] = useState(() => {
    return localStorage.getItem('jk_google_client_id_override') || import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
  });

  const activeClientId = customClientId.trim() || DEFAULT_CLIENT_ID;
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';

  useEffect(() => {
    const initGsi = () => {
      try {
        if (!(window as any).google) return;
        
        const client = (window as any).google.accounts.oauth2.initTokenClient({
          client_id: activeClientId,
          scope: 'https://www.googleapis.com/auth/drive.file openid profile email',
          callback: async (response: any) => {
            if (response.error) {
              setLoading(false);
              setAuthStatus('Handshake Interrupted');
              if (response.error === 'origin_mismatch' || response.error_description?.includes('origin')) {
                setError('Origin Mismatch Error (Error 400): This app URL is not registered in Google Cloud Console JavaScript origins.');
              } else {
                setError(`Auth Error: ${response.error_description || response.error}`);
              }
              return;
            }

            setAuthStatus('Synchronizing Neural Identity...');
            try {
              const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${response.access_token}` },
              });
              const userInfo = await userInfoResponse.json();

              onLogin({
                id: userInfo.sub,
                name: userInfo.name,
                email: userInfo.email,
                avatar: userInfo.picture,
                accessToken: response.access_token
              });
            } catch (err) {
              setAuthStatus('Handshake Failure');
              setError('Failed to fetch user profile from Google.');
              setLoading(false);
            }
          },
        });
        setTokenClient(client);
      } catch (err) {
        console.error("GSI Init Error:", err);
      }
    };

    const scriptCheck = setInterval(() => {
      if ((window as any).google?.accounts?.oauth2) {
        initGsi();
        clearInterval(scriptCheck);
      }
    }, 100);

    return () => clearInterval(scriptCheck);
  }, [onLogin, activeClientId]);

  const handleGoogleSignIn = () => {
    setError(null);
    if (!tokenClient) {
      setAuthStatus('Identity Engine Offline. Retrying...');
      return;
    }
    triggerHaptic(20);
    setLoading(true);
    setAuthStatus('Opening Secure Gateway...');
    try {
      tokenClient.requestAccessToken();
    } catch (err: any) {
      setLoading(false);
      setError('OAuth Popup error. Ensure popups are allowed and origins are registered in Google Cloud.');
    }
  };

  const handleGuestSignIn = () => {
    setError(null);
    triggerHaptic();
    setGuestLoading(true);
    setAuthStatus('Initializing Local Sandbox...');
    
    setTimeout(() => {
      onLogin({
        id: 'guest-' + Math.random().toString(36).substring(7),
        name: 'Guest User',
        email: 'guest@local.host',
        avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Guest',
      });
      setGuestLoading(false);
    }, 800);
  };

  const copyOriginToClipboard = () => {
    triggerHaptic();
    navigator.clipboard.writeText(currentOrigin);
    setCopiedOrigin(true);
    setTimeout(() => setCopiedOrigin(false), 2500);
  };

  const saveCustomClientId = (val: string) => {
    setCustomClientId(val);
    if (val.trim()) {
      localStorage.setItem('jk_google_client_id_override', val.trim());
    } else {
      localStorage.removeItem('jk_google_client_id_override');
    }
  };

  const buttonBaseClass = "group w-full bg-white text-slate-950 font-black py-4 rounded-[24px] flex items-center justify-center gap-2.5 shadow-[0_15px_40px_-10px_rgba(255,255,255,0.1)] hover:scale-[1.02] active:scale-95 transition-all duration-300 uppercase tracking-[0.2em] text-[11px] cursor-pointer";

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-4 relative overflow-y-auto transition-all duration-700">
      {/* Background Ambience */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-brand-primary/5 rounded-full blur-[140px] pointer-events-none"></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-yellow-500/5 rounded-full blur-[120px] animate-pulse-slow pointer-events-none"></div>

      {/* Main Container */}
      <div className="w-full max-w-sm flex flex-col items-center justify-center space-y-6 z-10 py-6 my-auto">
        
        {/* GROUPED LOGO AND TITLE */}
        <div className="flex flex-col items-center w-full -space-y-4">
          <div className="relative group h-36 flex items-center justify-center w-full">
            <div className="absolute inset-0 bg-yellow-400/5 blur-[80px] rounded-full scale-75 opacity-40"></div>
            <BrandedLogo size="lg" variant="gold" />
            <div className="absolute top-2 right-14 bg-yellow-500 p-1.5 rounded-xl shadow-xl animate-bounce-slow z-30 border border-yellow-400/50">
              <Sparkles size={14} className="text-white" />
            </div>
          </div>
          
          <div className="text-center w-full space-y-3 px-4 pt-2">
            <div className="space-y-1">
              <h1 className="text-4xl font-black italic tracking-tighter text-white leading-none">
                Just<span className="text-yellow-500">Keep</span>
              </h1>
              <p className="text-[10px] font-black text-yellow-500 uppercase tracking-[0.4em] opacity-80">The Wealth Protocol</p>
            </div>

            <p className="text-slate-400 text-xs font-bold leading-relaxed italic max-w-[260px] mx-auto">
              "Small, consistent choices to <span className="text-white not-italic">"just keep it"</span> compound into lasting wealth."
            </p>
          </div>
        </div>

        {/* Buttons */}
        <div className="w-full space-y-3 px-2">
          {loading || guestLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 h-[130px] bg-white/5 rounded-[28px] border border-white/10 backdrop-blur-xl">
               <Loader2 className="text-yellow-500 animate-spin" size={28} />
               <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em]">{authStatus}</p>
            </div>
          ) : (
            <>
              <button
                onClick={handleGoogleSignIn}
                className={buttonBaseClass}
              >
                <LogIn size={18} strokeWidth={3} className="text-yellow-600" />
                Google Sign In
              </button>

              <button
                onClick={handleGuestSignIn}
                className="w-full bg-white/10 hover:bg-white/15 text-white font-bold py-3.5 rounded-[22px] flex items-center justify-center gap-2 border border-white/10 transition-all text-xs uppercase tracking-wider cursor-pointer"
              >
                <UserCircle size={16} />
                Continue in Guest Sandbox
              </button>
            </>
          )}

          {/* Error & Origin Mismatch Help Box */}
          {error && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/25 rounded-[22px] space-y-3 text-left">
              <div className="flex items-start gap-2.5">
                <ShieldAlert size={18} className="text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-[11px] font-black text-rose-300 uppercase tracking-wider">OAuth Origin Mismatch (Error 400)</p>
                  <p className="text-[10px] font-medium text-slate-300 leading-relaxed">
                    Google OAuth requires registering this app's current domain in your Google Cloud Console.
                  </p>
                </div>
              </div>

              {/* Copy Origin Tool */}
              <div className="bg-black/40 p-2.5 rounded-xl border border-white/10 space-y-2">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Current App JavaScript Origin:</p>
                <div className="flex items-center justify-between bg-black/60 px-2.5 py-1.5 rounded-lg border border-white/5">
                  <span className="text-[9px] font-mono text-yellow-400 truncate max-w-[200px]">{currentOrigin}</span>
                  <button
                    onClick={copyOriginToClipboard}
                    className="flex items-center gap-1 text-[8px] font-black uppercase tracking-wider bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 px-2 py-1 rounded transition-all cursor-pointer shrink-0"
                  >
                    {copiedOrigin ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                    {copiedOrigin ? 'Copied!' : 'Copy URL'}
                  </button>
                </div>
                <div className="text-[8px] text-slate-400 space-y-1 pt-1">
                  <p><strong>Fix in 3 steps:</strong></p>
                  <ol className="list-decimal list-inside space-y-0.5">
                    <li>Open Google Cloud Console -&gt; APIs &amp; Services -&gt; Credentials</li>
                    <li>Edit your Web OAuth 2.0 Client ID</li>
                    <li>Add <code className="text-yellow-300 font-mono">{currentOrigin}</code> to <strong>Authorized JavaScript origins</strong></li>
                  </ol>
                </div>
              </div>

              {/* Guest recommendation */}
              <button
                onClick={handleGuestSignIn}
                className="w-full bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 font-bold py-2 rounded-xl text-[10px] uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <UserCircle size={14} />
                Bypass &amp; Use Guest Sandbox Now
              </button>
            </div>
          )}

          {/* Custom Client ID Toggle */}
          <div className="pt-2">
            <button
              onClick={() => setShowClientIdConfig(!showClientIdConfig)}
              className="text-[9px] font-bold text-slate-500 hover:text-slate-300 uppercase tracking-widest flex items-center justify-center gap-1 mx-auto transition-colors cursor-pointer"
            >
              <Key size={10} />
              {showClientIdConfig ? 'Hide OAuth Settings' : 'Custom OAuth Client ID'}
              {showClientIdConfig ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            </button>

            {showClientIdConfig && (
              <div className="mt-2 p-3 bg-white/5 rounded-xl border border-white/10 space-y-2 text-left">
                <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">
                  Google Client ID Override
                </label>
                <input
                  type="text"
                  value={customClientId}
                  onChange={(e) => saveCustomClientId(e.target.value)}
                  placeholder="e.g. 123456789-abc...apps.googleusercontent.com"
                  className="w-full bg-black/60 border border-white/10 rounded-lg px-2.5 py-2 text-[10px] font-mono text-white placeholder:text-slate-600 outline-none focus:border-yellow-500/50"
                />
                <p className="text-[8px] text-slate-500">
                  {customClientId ? 'Using custom Client ID.' : 'Using default demo Client ID.'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer build info */}
        <div className="flex items-center gap-2 opacity-40 pt-2">
          <Fingerprint size={12} className="text-yellow-500" />
          <span className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em]">Build 3.1.0 • Multi-Currency Vault</span>
        </div>
      </div>
    </div>
  );
};

export default AuthScreen;