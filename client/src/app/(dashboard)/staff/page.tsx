"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogOut, Shield, FileText, Loader2, Zap, Package, CreditCard, Bell } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function StaffDashboard() {
    const { user, loading, logout } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (loading) return;
        if (!user) { router.replace("/login"); return; }
        if (user.role !== "STAFF") { router.replace("/unauthorized"); return; }
    }, [user, loading, router]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-950">
                <Loader2 className="w-7 h-7 text-indigo-500 animate-spin" />
            </div>
        );
    }

    const placeholders = [
        { icon: <Package className="w-5 h-5 text-indigo-400" />, label: "Products", color: "border-indigo-700/30 bg-indigo-900/10", href: "/staff/products" },
        { icon: <CreditCard className="w-5 h-5 text-emerald-400" />, label: "Plans", color: "border-emerald-700/30 bg-emerald-900/10", href: "/staff/plans" },
        { icon: <Shield className="w-5 h-5 text-purple-400" />, label: "Subscriptions", color: "border-purple-700/30 bg-purple-900/10", href: "/staff/subscriptions" },
        { icon: <FileText className="w-5 h-5 text-blue-400" />, label: "Quotation Templates", color: "border-blue-700/30 bg-blue-900/10", href: "/staff/quotation-templates" },
        { icon: <FileText className="w-5 h-5 text-blue-400" />, label: "Invoices", color: "border-blue-700/30 bg-blue-900/10", href: "/staff/invoices" },
        { icon: <CreditCard className="w-5 h-5 text-emerald-400" />, label: "Payments", color: "border-emerald-700/30 bg-emerald-900/10", href: "/staff/payments" },
        { icon: <CreditCard className="w-5 h-5 text-purple-400" />, label: "Reports", color: "border-purple-700/30 bg-purple-900/10", href: "/admin/reports" },
        { icon: <Bell className="w-5 h-5 text-emerald-400" />, label: "Notifications", color: "border-emerald-700/30 bg-emerald-900/10", href: "/notifications" },
        { icon: <Bell className="w-5 h-5 text-indigo-400" />, label: "Delivery monitoring", color: "border-indigo-700/30 bg-indigo-900/10", href: "/admin/notifications" },
    ];

    return (
        <div className="min-h-screen flex flex-col bg-gray-950">
            {/* Header */}
            <header className="flex items-center gap-4 px-6 py-4 border-b border-gray-800 bg-gray-950">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                        <Zap className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-white font-bold">SubsTrack</span>
                </div>
                <div className="ml-0 w-11/12 flex justify-between items-center gap-4">
                    <span className="text-gray-400 text-sm hidden sm:block">
                        {user?.name} <span className="text-xs text-blue-400 ml-1">STAFF</span>
                    </span>
                    <button onClick={logout} className="flex mr-8 items-center gap-1.5 text-gray-400 hover:text-red-400 transition text-sm">
                        <LogOut className="w-4 h-4" />
                        <span className="hidden sm:block">Sign out</span>
                    </button>
                </div>
            </header>

            <main className="flex-1 p-6 max-w-4xl mx-auto w-full">
                <div className="mb-8">
                    <h1 className="text-2xl font-bold text-white mb-1">
                        Welcome back, {user?.name?.split(" ")[0]} 👋
                    </h1>
                    <p className="text-gray-400">Here&apos;s your staff workspace.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                    {placeholders.map((card) => card.href ? (
                        <Link key={card.label} href={card.href} className={`rounded-xl border p-5 ${card.color} flex flex-col gap-4 hover:border-indigo-500/50 transition`}>
                            {card.icon}
                            <div>
                                <p className="text-white font-semibold text-sm">{card.label}</p>
                                <p className="text-gray-500 text-xs mt-0.5">{card.label === "Reports" ? "View business analytics" : "Open workspace"}</p>
                            </div>
                            <span className="text-xs bg-gray-800/80 text-indigo-300 px-2.5 py-1 rounded-full self-start">Available</span>
                        </Link>
                    ) : (
                        <div key={card.label} className={`rounded-xl border p-5 ${card.color} flex flex-col gap-4`}>
                            {card.icon}
                            <div>
                                <p className="text-white font-semibold text-sm">{card.label}</p>
                                <p className="text-gray-500 text-xs mt-0.5">Open workspace</p>
                            </div>
                            <span className="text-xs bg-gray-800/80 text-gray-500 px-2.5 py-1 rounded-full self-start">Coming Soon</span>
                        </div>
                    ))}
                </div>
 
            </main>
        </div>
    );
}
