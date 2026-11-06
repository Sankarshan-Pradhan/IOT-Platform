import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  Plus, 
  Layers, 
  Copy, 
  Check, 
  ShieldCheck, 
  ArrowRight, 
  Trash2, 
  User, 
  Users, 
  Mail, 
  Phone, 
  Calendar,
  Filter,
  Crown,
  Sparkles
} from 'lucide-react';
import { generateUUID } from '../utils/generators';
import { fetchUsers } from '../api';

export default function TenantsView({
  tenants,
  activeTenant,
  setActiveTenant,
  onOpenAddTenant,
  onOpenAddDevice,
  onDeleteTenant,
  onAddTenant,
  currentUser,
  devicesCountByTenant = {},
}) {
  const [copiedId, setCopiedId] = useState(null);
  const [viewTab, setViewTab] = useState('workspaces'); // 'workspaces' or 'users'
  const [userList, setUserList] = useState([]);
  const [selectedUserFilter, setSelectedUserFilter] = useState('ALL');

  // Inline first workspace creation state
  const [newWsName, setNewWsName] = useState('');
  const [newWsSlug, setNewWsSlug] = useState('');
  const [newWsDesc, setNewWsDesc] = useState('');
  const [isCreatingFirst, setIsCreatingFirst] = useState(false);

  const hasWorkspace = Array.isArray(tenants) && tenants.length > 0;

  const handleCreateFirstWorkspace = async (e) => {
    e.preventDefault();
    if (!newWsName.trim() || !onAddTenant) return;
    setIsCreatingFirst(true);
    try {
      await onAddTenant({
        id: generateUUID(),
        name: newWsName.trim(),
        slug: newWsSlug.trim() || 'ws-' + Math.random().toString(36).substring(2, 6),
        description: newWsDesc.trim(),
        created_at: new Date().toISOString(),
      });
      setNewWsName('');
      setNewWsSlug('');
      setNewWsDesc('');
    } catch (err) {
      console.error('Failed to create workspace:', err);
    } finally {
      setIsCreatingFirst(false);
    }
  };

  const isAdmin = currentUser?.role === 'admin';

  // Load all users for Admin
  useEffect(() => {
    if (isAdmin) {
      fetchUsers().then((users) => {
        if (Array.isArray(users)) {
          setUserList(users);
        }
      });
    }
  }, [isAdmin]);

  const handleCopy = (id) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Filter workspaces for admin if a specific user is selected
  const filteredTenants = selectedUserFilter === 'ALL'
    ? tenants
    : tenants.filter((t) => t.owner_id === selectedUserFilter || t.owner_name === selectedUserFilter);

  return (
    <div className="space-y-6">
      
      {/* Header & Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2.5">
              <Building2 className="w-6 h-6 text-emerald-500" />
              <span>{isAdmin ? 'Multi-Tenant Management Console' : 'My Workspaces'}</span>
            </h2>
            {isAdmin ? (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-300 flex items-center gap-1">
                <Crown className="w-3 h-3 text-amber-600" />
                <span>Admin View (All Users)</span>
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Personal Workspaces
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {isAdmin 
              ? 'Administrator overview of all user accounts and their created workspaces.' 
              : 'Isolated workspaces created and managed under your account.'}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {!isAdmin ? (
            hasWorkspace && (
              <button
                onClick={onOpenAddTenant}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition shadow-md shadow-emerald-500/20"
              >
                <Plus className="w-4 h-4" />
                <span>Create New Workspace</span>
              </button>
            )
          ) : (
            <div className="px-3.5 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 shadow-xs">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Supervisory Monitoring Active</span>
            </div>
          )}
        </div>
      </div>

      {/* Admin Supervisory Overview Strip */}
      {isAdmin && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600 border border-amber-200">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Total Registered Users</span>
              <p className="text-lg font-extrabold text-slate-900">{userList.length} Accounts</p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Total Workspaces Monitored</span>
              <p className="text-lg font-extrabold text-slate-900">{tenants.length} Workspaces</p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-50 text-cyan-600 border border-cyan-200">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Inspecting Workspace</span>
              <p className="text-sm font-bold text-slate-900 truncate max-w-[180px]">{activeTenant?.name || 'Default'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Admin Tab Switcher & Filter Bar */}
      {isAdmin && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-white border border-slate-200 rounded-2xl shadow-sm">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewTab('workspaces')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                viewTab === 'workspaces'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>All Workspaces ({tenants.length})</span>
            </button>

            <button
              onClick={() => setViewTab('users')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                viewTab === 'users'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
              }`}
            >
              <Users className="w-3.5 h-3.5 text-emerald-500" />
              <span>Registered Users ({userList.length})</span>
            </button>
          </div>

          {viewTab === 'workspaces' && userList.length > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-500 text-[11px] font-semibold">Filter by Owner:</span>
              <select
                value={selectedUserFilter}
                onChange={(e) => setSelectedUserFilter(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-xs text-slate-800 font-medium focus:outline-none focus:border-emerald-500"
              >
                <option value="ALL">All Users ({tenants.length} Workspaces)</option>
                {userList.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} (@{u.username})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 1: WORKSPACES VIEW */}
      {/* ==================================================================== */}
      {viewTab === 'workspaces' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTenants.length === 0 ? (
            !isAdmin && !hasWorkspace ? (
              <div className="col-span-full max-w-2xl mx-auto w-full py-4">
                <div className="bg-white rounded-3xl border border-emerald-200/90 shadow-xl shadow-emerald-500/5 p-6 sm:p-8 space-y-6">
                  <div className="flex items-start gap-4 pb-5 border-b border-slate-100">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-slate-950 font-bold shadow-md shadow-emerald-500/20 flex-shrink-0">
                      <Building2 className="w-6 h-6 text-slate-950" />
                    </div>
                    <div>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">
                        <Sparkles className="w-3 h-3 text-emerald-600" />
                        Step 1: Workspace Setup
                      </span>
                      <h3 className="text-xl font-extrabold text-slate-900 tracking-tight mt-1.5">
                        Create Your Workspace to Get Started
                      </h3>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                        Welcome, <strong className="text-slate-800">{currentUser?.name || currentUser?.username}</strong>! Before you can register IoT devices or create tenants, please create your first workspace.
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleCreateFirstWorkspace} className="space-y-4">
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5 block">
                        Workspace Name <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={newWsName}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNewWsName(val);
                          setNewWsSlug(val.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-'));
                        }}
                        placeholder="e.g. Smart Factory Zone 1"
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-emerald-500 font-medium transition"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5 block">
                        Identifier Slug
                      </label>
                      <input
                        type="text"
                        required
                        value={newWsSlug}
                        onChange={(e) => setNewWsSlug(e.target.value)}
                        placeholder="e.g. smart-factory-zone-1"
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-xs font-mono text-emerald-700 focus:outline-none focus:border-emerald-500 transition"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5 block">
                        Description (Optional)
                      </label>
                      <textarea
                        rows={2}
                        value={newWsDesc}
                        onChange={(e) => setNewWsDesc(e.target.value)}
                        placeholder="Primary workspace for IoT edge nodes and environmental telemetry."
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2 text-xs text-slate-900 focus:outline-none focus:border-emerald-500 transition"
                      />
                    </div>

                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={isCreatingFirst || !newWsName.trim()}
                        className="w-full py-3 px-5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition shadow-md shadow-emerald-500/20 disabled:opacity-50 cursor-pointer"
                      >
                        <Building2 className="w-4 h-4 text-slate-950" />
                        <span>{isCreatingFirst ? 'Creating Workspace...' : 'Create Workspace & Continue'}</span>
                        <ArrowRight className="w-4 h-4 text-slate-950" />
                      </button>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 text-[11px] flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <span>After creating your workspace, options to create additional tenants, register IoT devices, and stream telemetry will be unlocked.</span>
                    </div>
                  </form>
                </div>
              </div>
            ) : (
              <div className="col-span-full py-12 text-center bg-white rounded-2xl border border-slate-200 p-8 space-y-3">
                <Building2 className="w-10 h-10 text-slate-300 mx-auto" />
                <h3 className="text-sm font-bold text-slate-800">No workspaces found</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  {selectedUserFilter !== 'ALL'
                    ? 'No workspaces found for the selected user.'
                    : 'Click "Create New Workspace" above to add your first organizational workspace.'}
                </p>
              </div>
            )
          ) : (
            filteredTenants.map((t) => {
              const isSelected = activeTenant?.id === t.id;
              const devCount = devicesCountByTenant[t.id] ?? 0;

              return (
                <div
                  key={t.id}
                  className={`rounded-2xl p-5 border transition-colors text-left flex flex-col justify-between shadow-xs relative overflow-hidden ${
                    isSelected
                      ? 'bg-white border-emerald-500 ring-1 ring-emerald-500/40'
                      : 'bg-white hover:bg-slate-50/50 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {isSelected && (
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 to-teal-400" />
                  )}

                  <div>
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200 text-emerald-600">
                        <Building2 className="w-5 h-5" />
                      </div>

                      <div className="flex items-center gap-1.5">
                        {isSelected ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Active
                          </span>
                        ) : (
                          <button
                            onClick={() => setActiveTenant(t)}
                            className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition"
                          >
                            Select
                          </button>
                        )}

                        <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm(`Delete workspace "${t.name}"? This will delete all devices, channels, and telemetry in this workspace.`)) {
                                if (onDeleteTenant) onDeleteTenant(t.id);
                              }
                            }}
                            className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                            title="Delete Workspace"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                      </div>
                    </div>

                    <h3 className="text-base font-bold text-slate-900 tracking-tight">{t.name}</h3>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                      {t.description || 'Dedicated multi-tenant workspace with isolated telemetry storage.'}
                    </p>

                    {/* Owner Attribution Badge (Admin & User clarity) */}
                    <div className="mt-3.5 p-2 rounded-xl bg-slate-50 border border-slate-200 text-[11px] flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 truncate text-slate-600">
                        <User className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                        <span className="font-semibold text-slate-900 truncate">
                          {t.owner_name || 'System Admin'}
                        </span>
                        {t.owner_email && (
                          <span className="text-slate-400 text-[10px] truncate hidden sm:inline">
                            • {t.owner_email}
                          </span>
                        )}
                      </div>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-200 text-slate-700">
                        Owner
                      </span>
                    </div>

                    {/* Tenant UUID */}
                    <div className="mt-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Workspace UUID</span>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-mono text-emerald-700 truncate">
                          {t.id}
                        </span>
                        <button
                          onClick={() => handleCopy(t.id)}
                          className="text-slate-400 hover:text-slate-800 transition p-1"
                          title="Copy Tenant ID"
                        >
                          {copiedId === t.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <span>Slug: <strong className="text-slate-700 font-mono">{t.slug}</strong></span>
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                      {devCount} devices
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 2: ADMIN REGISTERED USERS DIRECTORY */}
      {/* ==================================================================== */}
      {isAdmin && viewTab === 'users' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-600" />
                <span>All Registered Users in Database</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Complete user directory with linked workspace associations.
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-200 text-slate-700">
              {userList.length} Total Users
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-6 py-3">User & ID</th>
                  <th className="px-6 py-3">Email Address</th>
                  <th className="px-6 py-3">Mobile</th>
                  <th className="px-6 py-3">Role</th>
                  <th className="px-6 py-3">Workspaces</th>
                  <th className="px-6 py-3">Joined Date</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {userList.map((user) => {
                  const isUserAdmin = user.role === 'admin';
                  return (
                    <tr key={user.id} className="hover:bg-slate-50/80 transition">
                      <td className="px-6 py-3.5">
                        <div className="font-bold text-slate-900">{user.name}</div>
                        <div className="text-[11px] font-mono text-slate-400">@{user.username}</div>
                      </td>

                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-1.5 text-slate-700">
                          <Mail className="w-3.5 h-3.5 text-slate-400" />
                          <span>{user.email}</span>
                        </div>
                      </td>

                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-1.5 text-slate-700">
                          <Phone className="w-3.5 h-3.5 text-slate-400" />
                          <span>{user.mobile || '—'}</span>
                        </div>
                      </td>

                      <td className="px-6 py-3.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          isUserAdmin
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        }`}>
                          {user.role}
                        </span>
                      </td>

                      <td className="px-6 py-3.5">
                        <span className="font-bold text-slate-900">
                          {user.workspaces_count ?? 1}
                        </span>
                        <span className="text-slate-400 ml-1">workspaces</span>
                      </td>

                      <td className="px-6 py-3.5 text-slate-500">
                        {user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
                      </td>

                      <td className="px-6 py-3.5 text-right">
                        <button
                          onClick={() => {
                            setSelectedUserFilter(user.id);
                            setViewTab('workspaces');
                          }}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-[11px] transition"
                        >
                          View Workspaces
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Quick Add Device Callout (Users only - visible ONLY after workspace is created) */}
      {!isAdmin && hasWorkspace && (
        <div className="rounded-2xl p-5 bg-gradient-to-r from-emerald-50 via-white to-slate-50 border border-emerald-200 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900">Need to register a sensor device to this workspace?</h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Add your device ID and friendly name to start streaming live telemetry immediately.
              </p>
            </div>
          </div>

          <button
            onClick={onOpenAddDevice}
            className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition whitespace-nowrap shadow-sm"
          >
            <span>Register Device</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

    </div>
  );
}