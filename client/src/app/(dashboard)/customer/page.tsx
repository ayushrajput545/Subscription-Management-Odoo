"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogOut, Shield, FileText, User, Loader2, Zap } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function CustomerDashboard() {
    const { user, loading, logout } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (loading) return;
        if (!user) { router.replace("/login"); return; }
        if (user.role !== "CUSTOMER") { router.replace("/unauthorized"); return; }
    }, [user, loading, router]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-950">
                <Loader2 className="w-7 h-7 text-indigo-500 animate-spin" />
            </div>
        );
    }

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
                <div className="ml-auto flex items-center gap-4">
                    <span className="text-gray-400 text-sm hidden sm:block">
                        {user?.name} <span className="text-xs text-gray-500 ml-1">CUSTOMER</span>
                    </span>
                    <button onClick={logout} className="flex items-center gap-1.5 text-gray-400 hover:text-red-400 transition text-sm">
                        <LogOut className="w-4 h-4" />
                        <span className="hidden sm:block">Sign out</span>
                    </button>
                </div>
            </header>

            <main className="flex-1 p-6 max-w-4xl mx-auto w-full">
                <div className="mb-8">
                    <h1 className="text-2xl font-bold text-white mb-1">
                        Hello, {user?.name?.split(" ")[0]} 👋
                    </h1>
                    <p className="text-gray-400">Manage your subscriptions and account.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                    {[
                        { icon: <Shield className="w-5 h-5 text-indigo-400" />, label: "Available Plans", desc: "Explore active subscription plans", color: "border-indigo-700/30 bg-indigo-900/10", href: "/customer/plans" },
                        { icon: <Shield className="w-5 h-5 text-indigo-400" />, label: "My Subscriptions", desc: "View and manage your active plans", color: "border-indigo-700/30 bg-indigo-900/10", soon: true },
                        { icon: <FileText className="w-5 h-5 text-blue-400" />, label: "My Invoices", desc: "Download and review your invoices", color: "border-blue-700/30 bg-blue-900/10", soon: true },
                    ].map((card) => card.href ? (
                        <Link key={card.label} href={card.href} className={`rounded-xl border p-5 ${card.color} hover:border-indigo-500/50 transition`}>
                            {card.icon}
                            <p className="text-white font-semibold text-sm mt-3">{card.label}</p>
                            <p className="text-gray-500 text-xs mt-0.5">{card.desc}</p>
                            <span className="inline-block mt-3 text-xs bg-gray-800/80 text-indigo-300 px-2.5 py-1 rounded-full">Browse Plans</span>
                        </Link>
                    ) : (
                        <div key={card.label} className={`rounded-xl border p-5 ${card.color}`}>
                            {card.icon}
                            <p className="text-white font-semibold text-sm mt-3">{card.label}</p>
                            <p className="text-gray-500 text-xs mt-0.5">{card.desc}</p>
                            {card.soon && <span className="inline-block mt-3 text-xs bg-gray-800/80 text-gray-500 px-2.5 py-1 rounded-full">Coming Soon</span>}
                        </div>
                    ))}
                </div>

                {/* Account Info */}
                <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <User className="w-5 h-5 text-gray-400" />
                        <h2 className="text-white font-semibold">Account Information</h2>
                    </div>
                    <div className="space-y-3">
                        {[
                            { label: "Full Name", value: user?.name },
                            { label: "Email", value: user?.email },
                            { label: "Account Type", value: user?.role },
                        ].map((item) => (
                            <div key={item.label} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                                <span className="text-gray-400 text-sm">{item.label}</span>
                                <span className="text-white text-sm font-medium">{item.value}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </main>
        </div>
    );
}
