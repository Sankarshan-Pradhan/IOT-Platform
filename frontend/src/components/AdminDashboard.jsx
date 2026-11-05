import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Users, 
  ShieldCheck, 
  Server, 
  Database, 
  RefreshCw, 
  Menu, 
  LogOut, 
  Check, 
  Copy, 
  Calendar,
  Layers,
  Trash2,
  Search,
  AlertTriangle,
  X,
  Shield,
  Lock,
  UserX,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  Mail,
  Phone,
  ExternalLink
} from 'lucide-react';
import { 
  fetchHealth, 
  fetchUsers, 
  deleteUser
} from '../api';

export default function AdminDashboard({ currentUser, onLogout, onForwardToUser }) {
  const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState(false);

  // User management states
  const [userList, setUserList] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL'); // 'ALL' | 'user' | 'admin'
  const [userToDeleteModal, setUserToDeleteModal] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  // System Health
  const [health, setHealth] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Load Admin System Data (Manual or on Mount — NO 5-second auto-polling)
  const loadAdminData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // Fetch system health and users concurrently in a single batch
      const [h, users] = await Promise.all([
        fetchHealth(),
        fetchUsers(),
      ]);

      if (h) setHealth(h);
      if (Array.isArray(users)) setUserList(users);
    } catch (err) {
      console.warn('[AdminDashboard] Error loading admin data:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // Initial load once on mount
  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  // Handle User Deletion
  const handleDeleteUser = async () => {
    if (!userToDeleteModal) return;
    const targetUser = userToDeleteModal;

    // Safety guard: Cannot delete primary admin or current logged in session
    if (targetUser.role === 'admin' || targetUser.username === 'admin' || targetUser.id === currentUser?.id) {
      setToastMessage({
        type: 'error',
        text: 'Cannot delete primary administrator accounts or active session.',
      });
      setUserToDeleteModal(null);
      setTimeout(() => setToastMessage(null), 4000);
      return;
    }

    setIsDeleting(true);
    try {
      await deleteUser(targetUser.id);
      setUserList((prev) => prev.filter((u) => u.id !== targetUser.id));
      setToastMessage({
        type: 'success',
        text: `User "${targetUser.name}" (@${targetUser.username}) and all associated workspaces were permanently removed.`,
      });
      setUserToDeleteModal(null);
      setTimeout(() => setToastMessage(null), 5000);
    } catch (err) {
      setToastMessage({
        type: 'error',
        text: `Could not remove user: ${err.message}`,
      });
      setTimeout(() => setToastMessage(null), 5000);
    } finally {
      setIsDeleting(false);
    }
  };

  // Filtered Users List
  const filteredUsers = useMemo(() => {
    return userList.filter((user) => {
      if (roleFilter !== 'ALL' && user.role !== roleFilter) {
        return false;
      }
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase().trim();
        return (
          user.name?.toLowerCase().includes(q) ||
          user.username?.toLowerCase().includes(q) ||
          user.email?.toLowerCase().includes(q) ||
          user.mobile?.toLowerCase().includes(q) ||
          user.id?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [userList, searchQuery, roleFilter]);

  // User Counts
  const regularUsersCount = useMemo(() => {
    return userList.filter((u) => u.role !== 'admin').length;
  }, [userList]);

  const adminUsersCount = useMemo(() => {
    return userList.filter((u) => u.role === 'admin').length;
  }, [userList]);

  const isBackendOk = health && health.status === 'ok';
  const isDbOk = health && health.database === 'connected';

  return (
    <div className="min-h-screen bg-slate-50 flex text-slate-900 antialiased selection:bg-amber-500/20 selection:text-amber-800">
      
      {/* 1. Left Sidebar Navigation for Admin */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 sm:w-72 bg-white border-r border-slate-200 flex flex-col h-screen select-none transform md:relative md:translate-x-0 ${
        isSidebarOpenMobile ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      }`}>
        
        {/* Admin Header Branding */}
        <div className="p-4 border-b border-slate-200 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-400 flex items-center justify-center text-slate-950 font-bold shadow-md shadow-amber-500/20">
              <ShieldCheck className="w-5 h-5 text-slate-950" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-sm font-bold tracking-tight text-slate-900">Admin Console</h1>
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-300">
                  SUPERUSER
                </span>
              </div>
              <p className="text-[11px] text-slate-500">User Governance & Security</p>
            </div>
          </div>
        </div>

        {/* Navigation Menu */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          
          {/* Card 1: User Directory & Management (Primary) */}
          <div className="w-full rounded-xl p-3 border bg-amber-50/80 border-amber-400/80 shadow-xs ring-1 ring-amber-400/40 text-slate-900 font-bold flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-amber-500 text-slate-950 font-bold">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold">User Management</h4>
                <p className="text-[11px] text-slate-500 font-normal">All registered accounts</p>
              </div>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white text-slate-700 font-bold border border-slate-200">
              {userList.length}
            </span>
          </div>

        </div>

        {/* Sidebar Footer: Mode Badge */}
        <div className="p-3 border-t border-slate-200 bg-slate-50/50 space-y-2">
          <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[11px] flex items-center gap-2 font-semibold shadow-xs">
            <ShieldCheck className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span>Administrator Control Mode</span>
          </div>
          <div className="px-2 flex items-center justify-between text-[10px] font-mono text-slate-400">
            <span>HTTP :8080</span>
            <span>TimescaleDB :5433</span>
          </div>
        </div>

      </aside>

      {/* Backdrop for mobile */}
      {isSidebarOpenMobile && (
        <div
          onClick={() => setIsSidebarOpenMobile(false)}
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-xs md:hidden"
        />
      )}

      {/* 2. Main Admin Layout */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        
        {/* Top Header Bar — Static, Stable Height (No 5-sec Polling, No Degree Celsius) */}
        <header className="border-b border-slate-200 bg-white sticky top-0 z-30 px-4 sm:px-6 h-16 flex items-center">
          <div className="max-w-7xl mx-auto w-full flex items-center justify-between gap-3">
            
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsSidebarOpenMobile(!isSidebarOpenMobile)}
                className="p-2 text-slate-500 hover:text-slate-900 md:hidden border border-slate-200 rounded-lg bg-white"
              >
                <Menu className="w-5 h-5" />
              </button>
              
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-900">
                    Administrator Mission Control
                  </h1>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                    Admin
                  </span>
                </div>
                <p className="text-xs text-slate-500 hidden sm:block">
                  Global user governance and platform access administration
                </p>
              </div>
            </div>

            {/* Status indicators & Sign out (Fixed-height controls, zero layout shifting) */}
            <div className="flex items-center gap-2 sm:gap-2.5 flex-shrink-0">
              
              {/* Backend status indicator */}
              <div className="h-8 px-2.5 rounded-lg bg-slate-100 border border-slate-200 text-xs font-medium inline-flex items-center gap-1.5 flex-shrink-0">
                <Server className="w-3.5 h-3.5 text-slate-500" />
                <span className="hidden sm:inline text-slate-500">API:</span>
                <span className={`flex items-center gap-1 font-semibold ${isBackendOk ? 'text-emerald-600' : 'text-rose-600'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isBackendOk ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                  {isBackendOk ? 'Online' : 'Offline'}
                </span>
              </div>

              {/* Database status indicator */}
              <div className="h-8 px-2.5 rounded-lg bg-slate-100 border border-slate-200 text-xs font-medium inline-flex items-center gap-1.5 flex-shrink-0">
                <Database className="w-3.5 h-3.5 text-slate-500" />
                <span className="hidden sm:inline text-slate-500">DB:</span>
                <span className={`flex items-center gap-1 font-semibold ${isDbOk ? 'text-emerald-600' : 'text-amber-600'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isDbOk ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  {isDbOk ? 'Ready' : 'Waiting'}
                </span>
              </div>

              {/* Manual Refresh Button (Clipped icon, zero layout movement on click) */}
              <button
                type="button"
                onClick={loadAdminData}
                disabled={isRefreshing}
                className="h-8 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 transition-colors disabled:opacity-60 flex-shrink-0 cursor-pointer"
                title="Refresh user accounts"
              >
                <span className="w-3.5 h-3.5 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  <RefreshCw className={`w-3.5 h-3.5 text-slate-600 flex-shrink-0 ${isRefreshing ? 'animate-spin text-amber-600' : ''}`} />
                </span>
                <span className="hidden sm:inline font-semibold">Refresh</span>
              </button>

              {/* Admin profile & Sign Out */}
              <div className="h-8 flex items-center gap-2 pl-2 border-l border-slate-200 flex-shrink-0">
                <div className="hidden sm:block text-right">
                  <div className="text-xs font-bold text-slate-900 leading-tight">{currentUser?.name || 'Administrator'}</div>
                  <div className="text-[10px] font-mono text-slate-400 leading-tight">@{currentUser?.username || 'admin'}</div>
                </div>

                <button
                  type="button"
                  onClick={onLogout}
                  className="h-8 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold inline-flex items-center gap-1.5 transition-colors shadow-xs flex-shrink-0 cursor-pointer"
                  title="Sign Out of Admin Console"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>

            </div>

          </div>
        </header>

        {/* Dynamic Admin Body */}
        <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6 flex-1">
          
          {/* Toast Notification Banner (Absolute or Stable) */}
          {toastMessage && (
            <div className={`p-4 rounded-2xl border flex items-center justify-between gap-3 shadow-xs ${
              toastMessage.type === 'success'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : 'bg-rose-50 border-rose-300 text-rose-900'
            }`}>
              <div className="flex items-center gap-2.5">
                {toastMessage.type === 'success' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
                )}
                <span className="text-xs font-medium">{toastMessage.text}</span>
              </div>
              <button
                onClick={() => setToastMessage(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Top Supervisory Stats Ribbon (Solid, Fixed Height Grid) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="p-4 h-20 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center gap-3">
              <div className="p-3 rounded-xl bg-amber-50 text-amber-600 border border-amber-200 flex-shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider truncate">Total Registered Accounts</span>
                <p className="text-xl font-extrabold text-slate-900 truncate">{userList.length} Users</p>
              </div>
            </div>

            <div className="p-4 h-20 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center gap-3">
              <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex-shrink-0">
                <UserCheck className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider truncate">Standard Operators</span>
                <p className="text-xl font-extrabold text-slate-900 truncate">{regularUsersCount} Active</p>
              </div>
            </div>

            <div className="p-4 h-20 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center gap-3">
              <div className="p-3 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200 flex-shrink-0">
                <Shield className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider truncate">Platform Administrators</span>
                <p className="text-xl font-extrabold text-slate-900 truncate">{adminUsersCount} Superusers</p>
              </div>
            </div>
          </div>

          {/* USER MANAGEMENT DIRECTORY (Rock Solid, Non-Moving Card) */}
          <div className="space-y-4">
            
            {/* Toolbar & Filter Bar (Fixed Stable Height) */}
            <div className="bg-white px-4 py-3 sm:py-0 sm:h-16 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 flex-shrink-0">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, @username, email, or mobile..."
                  className="w-full pl-9 pr-8 h-9 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-amber-500 focus:bg-white transition-colors"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Filter Pills */}
              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl self-start sm:self-auto h-9 flex-shrink-0">
                <button
                  onClick={() => setRoleFilter('ALL')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    roleFilter === 'ALL'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All ({userList.length})
                </button>
                <button
                  onClick={() => setRoleFilter('user')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    roleFilter === 'user'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Users ({regularUsersCount})
                </button>
                <button
                  onClick={() => setRoleFilter('admin')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    roleFilter === 'admin'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Admins ({adminUsersCount})
                </button>
              </div>
            </div>

            {/* Users Table / Directory Card (Stable, No Movement) */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Users className="w-4 h-4 text-amber-600" />
                    <span>Registered User Accounts</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Superuser Directory: Showing {filteredUsers.length} of {userList.length} accounts with user removal authorization
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                  {filteredUsers.length} Listed
                </span>
              </div>

              {filteredUsers.length === 0 ? (
                <div className="p-12 text-center space-y-2">
                  <UserX className="w-10 h-10 text-slate-300 mx-auto" />
                  <h4 className="text-sm font-bold text-slate-700">No accounts match search criteria</h4>
                  <p className="text-xs text-slate-400">Try adjusting your search terms or role filters.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="px-6 py-3.5">User & Account</th>
                        <th className="px-6 py-3.5">Contact Details</th>
                        <th className="px-6 py-3.5">Privileges</th>
                        <th className="px-6 py-3.5">Workspaces</th>
                        <th className="px-6 py-3.5">Registered Date</th>
                        <th className="px-6 py-3.5 text-right">Administrative Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {filteredUsers.map((user) => {
                        const isUserAdmin = user.role === 'admin';
                        const isSelf = user.id === currentUser?.id || user.username === currentUser?.username;
                        const isSystemRoot = user.username === 'admin' || user.id === 'usr-admin-system-001';

                        const initials = (user.name || user.username || 'U')
                          .split(' ')
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join('')
                          .toUpperCase();

                        return (
                          <tr 
                            key={user.id} 
                            onClick={() => onForwardToUser && onForwardToUser(user)}
                            className="hover:bg-amber-50/50 transition-colors cursor-pointer group"
                            title={`Click anywhere to open ${user.name}'s Dashboard`}
                          >
                            
                            {/* 1. User & Account info */}
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shadow-xs transition-transform group-hover:scale-105 ${
                                  isUserAdmin
                                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                    : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                }`}>
                                  {initials}
                                </div>
                                <div>
                                  <div className="font-bold text-slate-900 group-hover:text-amber-800 text-sm flex items-center gap-1.5 transition-colors">
                                    <span>{user.name}</span>
                                    {isSelf && (
                                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-200 text-slate-700 font-semibold">
                                        You
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1 text-[11px] font-mono text-slate-400 mt-0.5">
                                    <span>@{user.username}</span>
                                    <span>•</span>
                                    <span className="text-[10px] text-slate-400 truncate max-w-[120px]" title={user.id}>
                                      {user.id}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleCopy(user.id);
                                      }}
                                      className="text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                                      title="Copy User ID"
                                    >
                                      {copiedId === user.id ? (
                                        <Check className="w-3 h-3 text-emerald-600" />
                                      ) : (
                                        <Copy className="w-3 h-3" />
                                      )}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* 2. Contact details */}
                            <td className="px-6 py-4">
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5 text-slate-700">
                                  <Mail className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                                  <span className="truncate max-w-[180px]">{user.email}</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
                                  <Phone className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                                  <span>{user.mobile || '—'}</span>
                                </div>
                              </div>
                            </td>

                            {/* 3. Role pill */}
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                isUserAdmin
                                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              }`}>
                                {isUserAdmin ? (
                                  <Shield className="w-3 h-3 text-amber-600" />
                                ) : (
                                  <UserCheck className="w-3 h-3 text-emerald-600" />
                                )}
                                <span>{user.role}</span>
                              </span>
                            </td>

                            {/* 4. Workspaces */}
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-1.5">
                                <Layers className="w-3.5 h-3.5 text-slate-400" />
                                <span className="font-bold text-slate-900">
                                  {user.workspaces_count ?? 1}
                                </span>
                                <span className="text-slate-400 text-[11px]">workspace(s)</span>
                              </div>
                            </td>

                            {/* 5. Registered Date */}
                            <td className="px-6 py-4 text-slate-500">
                              <div className="flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                <span>{user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}</span>
                              </div>
                            </td>

                            {/* 6. Admin Actions: Forward to Dashboard & Remove User */}
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onForwardToUser && onForwardToUser(user);
                                  }}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold transition-colors shadow-xs cursor-pointer"
                                  title={`Forward directly to ${user.name}'s Dashboard`}
                                >
                                  <ExternalLink className="w-3.5 h-3.5 text-amber-700" />
                                  <span>Open Dashboard</span>
                                </button>

                                {isSystemRoot || isUserAdmin || isSelf ? (
                                  <span 
                                    className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 px-2.5 py-1.5 rounded-lg bg-slate-100 cursor-not-allowed"
                                    title="Administrator and current session accounts are protected"
                                  >
                                    <Lock className="w-3 h-3" />
                                    <span>Protected</span>
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setUserToDeleteModal(user);
                                    }}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-800 border border-rose-200 text-xs font-bold transition-colors shadow-xs cursor-pointer"
                                    title={`Remove user ${user.name}`}
                                  >
                                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                                    <span>Remove</span>
                                  </button>
                                )}
                              </div>
                            </td>

                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>

        </main>

        {/* Footer */}
        <footer className="border-t border-slate-200 py-4 px-6 text-center text-xs text-slate-500 bg-white">
          <p>IoT Platform • Administrator Mission Control • User Governance Center</p>
        </footer>

      </div>

      {/* 3. Confirmation Modal for Deleting User */}
      {userToDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-rose-50/50">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Confirm User Removal</h3>
                  <p className="text-[11px] text-slate-500">Irreversible administrative action</p>
                </div>
              </div>
              <button
                onClick={() => setUserToDeleteModal(null)}
                disabled={isDeleting}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 space-y-3.5">
              <p className="text-xs text-slate-600 leading-relaxed">
                Are you sure you want to permanently delete the account for{' '}
                <strong className="text-slate-900 font-bold">{userToDeleteModal.name}</strong> (
                <span className="font-mono text-amber-800">@{userToDeleteModal.username}</span>)?
              </p>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
                <div className="flex items-center justify-between text-slate-600">
                  <span className="text-slate-400">Email:</span>
                  <span className="font-medium text-slate-800">{userToDeleteModal.email}</span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span className="text-slate-400">Workspaces:</span>
                  <span className="font-bold text-slate-900">{userToDeleteModal.workspaces_count ?? 1} owned</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-[11px] text-rose-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Cascading Cleanup:</strong> Deleting this user will also permanently remove all of their personal workspaces, registered devices, and historical telemetry records.
                </span>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setUserToDeleteModal(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl border border-slate-300 hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteUser}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm shadow-rose-600/20 disabled:opacity-50 cursor-pointer"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Removing...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Yes, Delete User</span>
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
