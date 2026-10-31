"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
    Users, UserPlus, LogOut, LayoutDashboard, Package,
    CreditCard, FileText, BarChart3, Zap, Pencil, Trash2,
    X, Loader2, Eye, EyeOff, Check, AlertTriangle, ChevronRight,
    Shield, Bell
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import type { User } from "@/types/auth";
import axios from "axios";

// ─── Sidebar ──────────────────────────────────────────────────────────────────
type NavItem = { icon: React.ReactNode; label: string; active?: boolean; soon?: boolean; href?: string };
const navItems: NavItem[] = [
    { icon: <LayoutDashboard className="w-4 h-4" />, label: "Dashboard", active: true },
    { icon: <Users className="w-4 h-4" />, label: "Staff Management" },
    { icon: <Package className="w-4 h-4" />, label: "Products", href: "/admin/products" },
    { icon: <CreditCard className="w-4 h-4" />, label: "Plans", href: "/admin/plans" },
    { icon: <Shield className="w-4 h-4" />, label: "Subscriptions", href: "/admin/subscriptions" },
    { icon: <FileText className="w-4 h-4" />, label: "Quotation Templates", href: "/admin/quotation-templates" },
    { icon: <CreditCard className="w-4 h-4" />, label: "Taxes", href: "/admin/taxes" },
    { icon: <CreditCard className="w-4 h-4" />, label: "Discounts", href: "/admin/discounts" },
    { icon: <FileText className="w-4 h-4" />, label: "Invoices", href: "/admin/invoices" },
    { icon: <CreditCard className="w-4 h-4" />, label: "Payments", href: "/admin/payments" },
    { icon: <CreditCard className="w-4 h-4" />, label: "Recurring Billing", href: "/admin/billing" },
    { icon: <BarChart3 className="w-4 h-4" />, label: "Reports", href: "/admin/reports" },
    { icon: <Bell className="w-4 h-4" />, label: "Notifications", href: "/admin/notifications" },
];

// ─── Toast ────────────────────────────────────────────────────────────────────
type Toast = { id: number; message: string; type: "success" | "error" };
let toastId = 0;

type DashboardSummary = {
    total_users: number;
    active_subscriptions: number;
    collected_amount: string | number;
    outstanding_invoice_count: number;
};

// ─── Admin Dashboard ──────────────────────────────────────────────────────────
export default function AdminDashboard() {
    const { user, loading, logout } = useAuth();
    const router = useRouter();

    const [activeSection, setActiveSection] = useState("Dashboard");
    const [users, setUsers] = useState<User[]>([]);
    const [usersLoading, setUsersLoading] = useState(false);
    const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary | null>(null);
    const [dashboardLoading, setDashboardLoading] = useState(true);
    const [dashboardError, setDashboardError] = useState("");
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // Modal state
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);

    // Form state
    const [form, setForm] = useState({ name: "", email: "", password: "" });
    const [editForm, setEditForm] = useState({ name: "", email: "" });
    const [formError, setFormError] = useState("");
    const [formLoading, setFormLoading] = useState(false);
    const [showFormPassword, setShowFormPassword] = useState(false);

    const addToast = (message: string, type: "success" | "error") => {
        const id = ++toastId;
        setToasts((prev) => [...prev, { id, message, type }]);
        setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
    };

    const fetchUsers = useCallback(async () => {
        setUsersLoading(true);
        try {
            const res = await api.get("/users");
            setUsers(res.data.users);
        } catch {
            addToast("Failed to load users", "error");
        } finally {
            setUsersLoading(false);
        }
    }, []);

    const fetchDashboardSummary = useCallback(async () => {
        setDashboardLoading(true);
        setDashboardError("");
        try {
            const response = await api.get("/admin/dashboard");
            setDashboardSummary(response.data.summary);
        } catch {
            setDashboardError("Dashboard metrics could not be loaded.");
        } finally {
            setDashboardLoading(false);
        }
    }, []);

    useEffect(() => {
        if (loading) return;
        if (!user) { router.replace("/login"); return; }
        if (user.role !== "ADMIN") { router.replace("/unauthorized"); return; }
    }, [user, loading, router]);

    useEffect(() => {
        if (loading || user?.role !== "ADMIN") return;
        const timer = window.setTimeout(() => { void fetchDashboardSummary(); }, 0);
        return () => window.clearTimeout(timer);
    }, [loading, user, fetchDashboardSummary]);

    useEffect(() => {
        if (activeSection === "Staff Management") fetchUsers();
    }, [activeSection, fetchUsers]);

    const handleCreateStaff = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError("");
        if (!form.name.trim() || !form.email.trim() || !form.password)
            return setFormError("All fields are required");

        setFormLoading(true);
        try {
            await api.post("/users/staff", {
                name: form.name.trim(),
                email: form.email.trim(),
                password: form.password,
            });
            addToast("Staff member created successfully", "success");
            setShowCreateModal(false);
            setForm({ name: "", email: "", password: "" });
            fetchUsers();
            fetchDashboardSummary();
        } catch (err) {
            if (axios.isAxiosError(err))
                setFormError(err.response?.data?.message || "Failed to create staff");
        } finally {
            setFormLoading(false);
        }
    };

    const handleEditUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError("");
        if (!editForm.name.trim() || !editForm.email.trim())
            return setFormError("Name and email are required");

        setFormLoading(true);
        try {
            await api.patch(`/users/${selectedUser?.id}`, {
                name: editForm.name.trim(),
                email: editForm.email.trim(),
            });
            addToast("User updated successfully", "success");
            setShowEditModal(false);
            fetchUsers();
            fetchDashboardSummary();
        } catch (err) {
            if (axios.isAxiosError(err))
                setFormError(err.response?.data?.message || "Failed to update user");
        } finally {
            setFormLoading(false);
        }
    };

    const handleDeleteUser = async () => {
        if (!selectedUser) return;
        setFormLoading(true);
        try {
            await api.delete(`/users/${selectedUser.id}`);
            addToast("User deleted successfully", "success");
            setShowDeleteModal(false);
            setSelectedUser(null);
            fetchUsers();
            fetchDashboardSummary();
        } catch (err) {
            if (axios.isAxiosError(err))
                addToast(err.response?.data?.message || "Failed to delete user", "error");
        } finally {
            setFormLoading(false);
        }
    };

    const roleBadge = (role: string) => {
        const colors: Record<string, string> = {
            ADMIN: "bg-purple-900/40 text-purple-300 border-purple-700/40",
            STAFF: "bg-blue-900/40 text-blue-300 border-blue-700/40",
            CUSTOMER: "bg-gray-800 text-gray-300 border-gray-700/40",
        };
        return (
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${colors[role] || colors.CUSTOMER}`}>
                {role}
            </span>
        );
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-950">
                <Loader2 className="w-7 h-7 text-indigo-500 animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen flex bg-gray-950">
            {/* Toast */}
            <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
                {toasts.map((t) => (
                    <div key={t.id} className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium shadow-lg animate-in slide-in-from-right ${t.type === "success" ? "bg-emerald-900/80 border-emerald-700/50 text-emerald-300" : "bg-red-900/80 border-red-700/50 text-red-300"}`}>
                        {t.type === "success" ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                        {t.message}
                    </div>
                ))}
            </div>

            {/* Sidebar */}
            <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-gray-900 border-r border-gray-800 flex flex-col transition-transform duration-200 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:relative lg:translate-x-0`}>
                <div className="flex items-center gap-2 px-6 py-5 border-b border-gray-800">
                    <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                        <Zap className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-white font-bold text-lg">SubsTrack</span>
                </div>

                <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                    {navItems.map((item) => (
                        <button
                            key={item.label}
                            onClick={() => {
                                setSidebarOpen(false);
                                if (item.href) router.push(item.href);
                                else setActiveSection(item.label);
                            }}
                            disabled={item.soon}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition text-left ${activeSection === item.label
                                    ? "bg-indigo-600/20 text-indigo-300 border border-indigo-700/30"
                                    : item.soon
                                        ? "text-gray-600 cursor-not-allowed"
                                        : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
                                }`}
                        >
                            {item.icon}
                            <span className="flex-1">{item.label}</span>
                            {item.soon && <span className="text-[10px] bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded">Soon</span>}
                            {activeSection === item.label && !item.soon && <ChevronRight className="w-3 h-3 text-indigo-400" />}
                        </button>
                    ))}
                </nav>

                <div className="p-4 border-t border-gray-800">
                    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-800/60 mb-2">
                        <div className="w-8 h-8 rounded-full bg-indigo-600/30 border border-indigo-500/30 flex items-center justify-center text-indigo-300 font-bold text-sm">
                            {user?.name?.[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-medium truncate">{user?.name}</p>
                            <p className="text-gray-500 text-xs">{user?.role}</p>
                        </div>
                    </div>
                    <button
                        onClick={logout}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-900/20 transition text-sm"
                    >
                        <LogOut className="w-4 h-4" />
                        Sign out
                    </button>
                </div>
            </aside>

            {/* Mobile overlay */}
            {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} />}

            {/* Main */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Top bar */}
                <header className="flex items-center gap-4 px-6 py-4 border-b border-gray-800 bg-gray-950/80 sticky top-0 backdrop-blur-sm z-10">
                    <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-gray-400 hover:text-white">
                        <Users className="w-5 h-5" />
                    </button>
                    <h1 className="text-lg font-semibold text-white">{activeSection}</h1>
                    <div className="ml-0 flex items-center gap-4">
                        <span className="hidden sm:block text-sm text-gray-500">
                            Welcome back, <span className="text-gray-300">{user?.name}</span>
                        </span>
                    </div>
                </header>

                <main className="flex-1 p-6 overflow-auto">
                    {/* Dashboard overview */}
                    {activeSection === "Dashboard" && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                {[
                                    { label: "Total Users", value: dashboardSummary ? Number(dashboardSummary.total_users).toLocaleString("en-IN") : null, icon: <Users className="w-5 h-5 text-indigo-400" />, color: "border-indigo-700/30 bg-indigo-900/10" },
                                    { label: "Active Subscriptions", value: dashboardSummary ? Number(dashboardSummary.active_subscriptions).toLocaleString("en-IN") : null, icon: <Shield className="w-5 h-5 text-purple-400" />, color: "border-purple-700/30 bg-purple-900/10" },
                                    { label: "Collected Revenue", value: dashboardSummary ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(dashboardSummary.collected_amount)) : null, icon: <CreditCard className="w-5 h-5 text-emerald-400" />, color: "border-emerald-700/30 bg-emerald-900/10" },
                                    { label: "Outstanding Invoices", value: dashboardSummary ? Number(dashboardSummary.outstanding_invoice_count).toLocaleString("en-IN") : null, icon: <BarChart3 className="w-5 h-5 text-amber-400" />, color: "border-amber-700/30 bg-amber-900/10", href: "/admin/reports" },
                                ].map((card) => (
                                    <button key={card.label} type="button" onClick={card.href ? () => router.push(card.href) : undefined} className={`w-full rounded-xl border p-5 text-left ${card.color} ${card.href ? "transition hover:border-amber-500/50" : "cursor-default"}`}>
                                        <div className="mb-3 flex items-center justify-between">{card.icon}<span className="text-xs text-gray-500">{card.label}</span></div>
                                        <p className="text-2xl font-bold text-white">{dashboardLoading ? <Loader2 className="h-6 w-6 animate-spin text-gray-400" /> : dashboardError ? "—" : card.value}</p>
                                    </button>
                                ))}
                            </div>
                            {dashboardError && (
                                <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-800/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
                                    <span>{dashboardError}</span>
                                    <button type="button" onClick={fetchDashboardSummary} className="rounded-lg border border-red-700/60 px-3 py-1.5 hover:bg-red-900/30">Retry</button>
                                </div>
                            )}

                            <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-6">
                                <h2 className="text-white font-semibold mb-3">Quick Actions</h2>
                                <div className="flex flex-wrap gap-3">
                                    {[
                                        { label: "Products", href: "/admin/products", icon: <Package className="w-4 h-4" /> },
                                        { label: "Plans", href: "/admin/plans", icon: <CreditCard className="w-4 h-4" /> },
                                        { label: "Subscriptions", href: "/admin/subscriptions", icon: <Shield className="w-4 h-4" /> },
                                        { label: "Invoices", href: "/admin/invoices", icon: <FileText className="w-4 h-4" /> },
                                        { label: "Payments", href: "/admin/payments", icon: <CreditCard className="w-4 h-4" /> },
                                        { label: "Reports", href: "/admin/reports", icon: <BarChart3 className="w-4 h-4" /> },
                                    ].map((action) => (
                                        <button key={action.label} type="button" onClick={() => router.push(action.href)} className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800/60 px-4 py-2 text-sm text-gray-300 transition hover:border-indigo-500/50 hover:bg-gray-800 hover:text-white">
                                            {action.icon} {action.label}
                                        </button>
                                    ))}
                                    <button
                                        onClick={() => setActiveSection("Staff Management")}
                                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600/20 border border-indigo-700/30 text-indigo-300 hover:bg-indigo-600/30 transition text-sm"
                                    >
                                        <UserPlus className="w-4 h-4" /> Manage Staff
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Staff Management */}
                    {activeSection === "Staff Management" && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <p className="text-gray-400 text-sm">Manage all users and staff accounts</p>
                                <button
                                    onClick={() => { setShowCreateModal(true); setForm({ name: "", email: "", password: "" }); setFormError(""); }}
                                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition"
                                >
                                    <UserPlus className="w-4 h-4" /> Add Staff
                                </button>
                            </div>

                            {usersLoading ? (
                                <div className="flex items-center justify-center py-20">
                                    <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
                                </div>
                            ) : (
                                <div className="rounded-xl border border-gray-800 overflow-hidden">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="border-b border-gray-800 bg-gray-900/60">
                                                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">User</th>
                                                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider hidden sm:table-cell">Email</th>
                                                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Role</th>
                                                <th className="text-right px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-800">
                                            {users.length === 0 ? (
                                                <tr><td colSpan={4} className="text-center py-10 text-gray-500">No users found</td></tr>
                                            ) : (
                                                users.map((u) => (
                                                    <tr key={u.id} className="hover:bg-gray-900/40 transition">
                                                        <td className="px-4 py-3">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-8 h-8 rounded-full bg-indigo-600/20 border border-indigo-700/30 flex items-center justify-center text-indigo-300 font-bold text-xs flex-shrink-0">
                                                                    {u.name?.[0]?.toUpperCase()}
                                                                </div>
                                                                <div>
                                                                    <p className="text-white text-sm font-medium">{u.name}</p>
                                                                    <p className="text-gray-500 text-xs sm:hidden">{u.email}</p>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3 text-gray-400 text-sm hidden sm:table-cell">{u.email}</td>
                                                        <td className="px-4 py-3">{roleBadge(u.role)}</td>
                                                        <td className="px-4 py-3">
                                                            <div className="flex items-center gap-2 justify-end">
                                                                <button
                                                                    onClick={() => { setSelectedUser(u); setEditForm({ name: u.name, email: u.email }); setFormError(""); setShowEditModal(true); }}
                                                                    className="p-1.5 text-gray-500 hover:text-indigo-300 hover:bg-indigo-900/30 rounded-lg transition"
                                                                >
                                                                    <Pencil className="w-3.5 h-3.5" />
                                                                </button>
                                                                {u.id !== user?.id && (
                                                                    <button
                                                                        onClick={() => { setSelectedUser(u); setShowDeleteModal(true); }}
                                                                        className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-900/30 rounded-lg transition"
                                                                    >
                                                                        <Trash2 className="w-3.5 h-3.5" />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </main>
            </div>

            {/* Create Staff Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                    <div className="w-full max-w-md bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
                            <h3 className="text-white font-semibold">Create Staff Member</h3>
                            <button onClick={() => setShowCreateModal(false)} className="text-gray-500 hover:text-gray-300 transition">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleCreateStaff} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1.5">Full name</label>
                                <input
                                    type="text"
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                    placeholder="Jane Smith"
                                    className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1.5">Email</label>
                                <input
                                    type="email"
                                    value={form.email}
                                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                                    placeholder="jane@example.com"
                                    className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1.5">Password</label>
                                <div className="relative">
                                    <input
                                        type={showFormPassword ? "text" : "password"}
                                        value={form.password}
                                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                                        placeholder="••••••••"
                                        className="w-full px-4 pr-10 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition text-sm"
                                    />
                                    <button type="button" onClick={() => setShowFormPassword(!showFormPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition">
                                        {showFormPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>
                            {formError && <p className="text-red-400 text-sm">{formError}</p>}
                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setShowCreateModal(false)} className="flex-1 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-xl transition text-sm">
                                    Cancel
                                </button>
                                <button type="submit" disabled={formLoading} className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-semibold rounded-xl transition text-sm flex items-center justify-center gap-2">
                                    {formLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                                    Create
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {showEditModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                    <div className="w-full max-w-md bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
                            <h3 className="text-white font-semibold">Edit User</h3>
                            <button onClick={() => setShowEditModal(false)} className="text-gray-500 hover:text-gray-300 transition">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleEditUser} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1.5">Name</label>
                                <input
                                    type="text"
                                    value={editForm.name}
                                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1.5">Email</label>
                                <input
                                    type="email"
                                    value={editForm.email}
                                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition text-sm"
                                />
                            </div>
                            {formError && <p className="text-red-400 text-sm">{formError}</p>}
                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setShowEditModal(false)} className="flex-1 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-xl transition text-sm">
                                    Cancel
                                </button>
                                <button type="submit" disabled={formLoading} className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-semibold rounded-xl transition text-sm flex items-center justify-center gap-2">
                                    {formLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                                    Save
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteModal && selectedUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                    <div className="w-full max-w-sm bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-6 text-center">
                        <div className="w-12 h-12 rounded-2xl bg-red-900/30 border border-red-700/40 flex items-center justify-center mx-auto mb-4">
                            <AlertTriangle className="w-6 h-6 text-red-400" />
                        </div>
                        <h3 className="text-white font-semibold mb-1">Delete User</h3>
                        <p className="text-gray-400 text-sm mb-6">
                            Are you sure you want to delete <span className="text-white font-medium">{selectedUser.name}</span>? This action cannot be undone.
                        </p>
                        <div className="flex gap-3">
                            <button onClick={() => setShowDeleteModal(false)} className="flex-1 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-xl transition text-sm">
                                Cancel
                            </button>
                            <button onClick={handleDeleteUser} disabled={formLoading} className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white font-semibold rounded-xl transition text-sm flex items-center justify-center gap-2">
                                {formLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
