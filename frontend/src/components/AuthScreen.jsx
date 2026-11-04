import React, { useState } from 'react';
import { 
  Activity, 
  User, 
  Lock, 
  Mail, 
  Phone, 
  ShieldCheck, 
  ArrowRight, 
  AlertCircle, 
  CheckCircle2,
  KeyRound,
  UserPlus,
  LogIn,
  Sparkles
} from 'lucide-react';
import { login, register } from '../api';

export default function AuthScreen({ onLoginSuccess }) {
  const [mode, setMode] = useState('login'); // 'login' or 'register'
  
  // Login State
  const [loginId, setLoginId] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  
  // Register State
  const [regName, setRegName] = useState('');
  const [regMobile, setRegMobile] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');

  // Status & Feedback
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Quick fill demo admin
  const fillAdmin = () => {
    setMode('login');
    setLoginId('admin');
    setLoginPassword('admin123');
    setError('');
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    if (!loginId.trim() || !loginPassword) {
      setError('Please enter your User ID / Email and password.');
      return;
    }

    setIsLoading(true);
    try {
      const data = await login(loginId.trim(), loginPassword);
      if (onLoginSuccess) {
        onLoginSuccess(data.user);
      }
    } catch (err) {
      setError(err.message || 'Invalid user credentials. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!regName.trim()) {
      setError('Please enter your full name.');
      return;
    }
    if (!regMobile.trim() || regMobile.trim().length < 7) {
      setError('Please enter a valid mobile number.');
      return;
    }
    if (!regEmail.trim() || !regEmail.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!regUsername.trim() || regUsername.trim().length < 3) {
      setError('User ID / Username must be at least 3 characters.');
      return;
    }
    if (regPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setError('Passwords do not match. Please re-enter.');
      return;
    }

    setIsLoading(true);
    try {
      const data = await register({
        name: regName.trim(),
        mobile: regMobile.trim(),
        email: regEmail.trim(),
        username: regUsername.trim(),
        password: regPassword,
      });

      setSuccessMsg('Account registered successfully! Launching your workspace...');
      setTimeout(() => {
        if (onLoginSuccess) {
          onLoginSuccess(data.user);
        }
      }, 700);
    } catch (err) {
      setError(err.message || 'Registration failed. Username or email might already be taken.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 text-slate-900 antialiased selection:bg-emerald-500/30 selection:text-emerald-700">
      
      {/* Platform Branding Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 shadow-lg shadow-emerald-500/25 mb-4 text-slate-950">
          <Activity className="w-8 h-8 text-slate-950" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
          IoT Telemetry Platform
        </h2>
        <p className="mt-1.5 text-xs sm:text-sm text-slate-500 max-w-sm mx-auto">
          Multi-Tenant Time-Series Monitoring & Distributed Edge Gateway
        </p>
      </div>

      {/* Main Card Container */}
      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-white py-8 px-6 sm:px-8 shadow-xl shadow-slate-200/50 rounded-3xl border border-slate-200/80 transition-all">
          
          {/* Tab Navigation: Sign In vs Register */}
          <div className="grid grid-cols-2 p-1 mb-6 bg-slate-100 rounded-2xl text-xs font-bold text-slate-600">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError('');
                setSuccessMsg('');
              }}
              className={`py-2.5 rounded-xl transition flex items-center justify-center gap-1.5 ${
                mode === 'login'
                  ? 'bg-white text-slate-900 shadow-sm font-extrabold'
                  : 'hover:text-slate-900'
              }`}
            >
              <LogIn className="w-3.5 h-3.5 text-emerald-600" />
              <span>Sign In</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError('');
                setSuccessMsg('');
              }}
              className={`py-2.5 rounded-xl transition flex items-center justify-center gap-1.5 ${
                mode === 'register'
                  ? 'bg-white text-slate-900 shadow-sm font-extrabold'
                  : 'hover:text-slate-900'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5 text-emerald-600" />
              <span>Register New User</span>
            </button>
          </div>

          {/* Feedback Alert Banners */}
          {error && (
            <div className="mb-5 rounded-2xl bg-rose-50 border border-rose-200 p-3.5 flex items-start gap-2.5 text-xs text-rose-800 animate-fadeIn">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600 mt-0.5" />
              <div className="font-medium">{error}</div>
            </div>
          )}

          {successMsg && (
            <div className="mb-5 rounded-2xl bg-emerald-50 border border-emerald-200 p-3.5 flex items-start gap-2.5 text-xs text-emerald-800 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600 mt-0.5" />
              <div className="font-semibold">{successMsg}</div>
            </div>
          )}

          {/* ==================================================================== */}
          {/* TAB 1: SIGN IN FORM */}
          {/* ==================================================================== */}
          {mode === 'login' && (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                  User ID or Email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                    placeholder="e.g. admin or your username"
                    className="w-full pl-10 pr-3.5 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-3.5 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition font-medium"
                  />
                </div>
              </div>

              {/* Demo Admin Quick Login Helper */}
              <div className="pt-1 flex items-center justify-between text-[11px] text-slate-500">
                <span>Default Admin credentials:</span>
                <button
                  type="button"
                  onClick={fillAdmin}
                  className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold border border-emerald-200/60 transition"
                >
                  Fill Admin (admin / admin123)
                </button>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] text-slate-950 font-bold text-xs shadow-md shadow-emerald-500/20 transition flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {isLoading ? (
                    <span>Signing In...</span>
                  ) : (
                    <>
                      <span>Sign In to Workspaces</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>

              <div className="pt-3 text-center">
                <p className="text-xs text-slate-500">
                  New to IoT Platform?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setMode('register');
                      setError('');
                    }}
                    className="text-emerald-600 font-bold hover:underline ml-1"
                  >
                    Create an account
                  </button>
                </p>
              </div>
            </form>
          )}

          {/* ==================================================================== */}
          {/* TAB 2: REGISTER NEW USER FORM */}
          {/* ==================================================================== */}
          {mode === 'register' && (
            <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
              
              {/* Full Name */}
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  Full Name
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <User className="w-3.5 h-3.5" />
                  </div>
                  <input
                    type="text"
                    required
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="e.g. Alexander Wright"
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500 font-medium"
                  />
                </div>
              </div>

              {/* Mobile Number & Email (2 columns) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                    Mobile Number
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Phone className="w-3.5 h-3.5" />
                    </div>
                    <input
                      type="tel"
                      required
                      value={regMobile}
                      onChange={(e) => setRegMobile(e.target.value)}
                      placeholder="+1-555-0199"
                      className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500 font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                    Email Address
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Mail className="w-3.5 h-3.5" />
                    </div>
                    <input
                      type="email"
                      required
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="alex@plant.com"
                      className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500 font-medium"
                    />
                  </div>
                </div>
              </div>

              {/* User ID / Username */}
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  User ID (Unique Username)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <KeyRound className="w-3.5 h-3.5" />
                  </div>
                  <input
                    type="text"
                    required
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                    placeholder="e.g. alex_wright"
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500 font-mono font-medium"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Used as your unique sign-in ID and workspace namespace.
                </p>
              </div>

              {/* Password & Confirm Password (2 columns) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                    Password (min 6 chars)
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Lock className="w-3.5 h-3.5" />
                    </div>
                    <input
                      type="password"
                      required
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500 font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <ShieldCheck className="w-3.5 h-3.5" />
                    </div>
                    <input
                      type="password"
                      required
                      value={regConfirmPassword}
                      onChange={(e) => setRegConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500 font-medium"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-3">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] text-slate-950 font-bold text-xs shadow-md shadow-emerald-500/20 transition flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {isLoading ? (
                    <span>Registering Account...</span>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-slate-950" />
                      <span>Register & Launch My Workspace</span>
                    </>
                  )}
                </button>
              </div>

              <div className="pt-2 text-center">
                <p className="text-xs text-slate-500">
                  Already registered?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login');
                      setError('');
                    }}
                    className="text-emerald-600 font-bold hover:underline ml-1"
                  >
                    Sign In
                  </button>
                </p>
              </div>
            </form>
          )}

        </div>

        {/* Security Footer */}
        <div className="mt-6 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>Protected by TimescaleDB isolation & HS256 JWT security</span>
        </div>

      </div>

    </div>
  );
}