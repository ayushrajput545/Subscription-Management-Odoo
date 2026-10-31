"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bell, Check, ChevronLeft, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";

type Notification = {
    id: number;
    type: string;
    subject: string;
    message: string;
    status: "PENDING" | "READ";
    related_type: string | null;
    related_id: number | null;
    created_at: string;
    read_at: string | null;
};

export default function NotificationsPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const result = await api.get(`/notifications?page=${page}&limit=20`);
            setNotifications(result.data.notifications);
            setTotal(result.data.pagination.total);
        } catch {
            setError("Notifications could not be loaded. Please try again.");
        } finally {
            setLoading(false);
        }
    }, [page]);

    useEffect(() => {
        if (authLoading) return;
        if (!user) router.replace("/login");
        else {
            const timer = window.setTimeout(() => { void load(); }, 0);
            return () => window.clearTimeout(timer);
        }
    }, [authLoading, user, router, load]);

    const markRead = async (id: number) => {
        try {
            await api.patch(`/notifications/${id}/read`);
            await load();
        } catch {
            setError("Could not mark this notification as read.");
        }
    };

    const markAllRead = async () => {
        try {
            await api.patch("/notifications/read-all");
            await load();
        } catch {
            setError("Could not mark notifications as read.");
        }
    };

    if (authLoading || loading) {
        return <div className="flex min-h-screen items-center justify-center bg-gray-950"><Loader2 className="h-7 w-7 animate-spin text-indigo-500" /></div>;
    }

    const maxPage = Math.max(1, Math.ceil(total / 20));
    return (
        <main className="min-h-screen bg-gray-950 px-4 py-8 text-gray-100 sm:px-6">
            <div className="mx-auto max-w-3xl">
                <Link href={user?.role === "ADMIN" ? "/admin" : user?.role === "STAFF" ? "/staff" : "/customer"} className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white">
                    <ChevronLeft className="h-4 w-4" /> Dashboard
                </Link>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <Bell className="h-6 w-6 text-indigo-400" />
                        <div><h1 className="text-2xl font-bold">Notifications</h1><p className="text-sm text-gray-400">Your account updates and reminders.</p></div>
                    </div>
                    <button onClick={() => void markAllRead()} className="rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800">Mark all as read</button>
                </div>
                {error && <p role="alert" className="mt-5 rounded-lg border border-red-800 bg-red-950/30 p-3 text-sm text-red-300">{error}</p>}
                <section className="mt-6 overflow-hidden rounded-xl border border-gray-800 bg-gray-900/50">
                    {notifications.length === 0 ? (
                        <div className="p-10 text-center text-sm text-gray-400">No notifications to display.</div>
                    ) : notifications.map((notification) => (
                        <article key={notification.id} className={`border-b border-gray-800 p-4 last:border-0 sm:p-5 ${notification.status === "PENDING" ? "bg-indigo-950/20" : ""}`}>
                            <div className="flex items-start gap-3">
                                <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${notification.status === "PENDING" ? "bg-indigo-400" : "bg-gray-700"}`} />
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <h2 className="font-semibold text-white">{notification.subject}</h2>
                                        <time className="text-xs text-gray-500">{new Date(notification.created_at).toLocaleString()}</time>
                                    </div>
                                    <p className="mt-2 whitespace-pre-wrap text-sm text-gray-300">{notification.message}</p>
                                    {notification.status === "PENDING" && <button onClick={() => void markRead(notification.id)} className="mt-3 inline-flex items-center gap-1.5 text-xs text-indigo-300 hover:text-indigo-200"><Check className="h-3.5 w-3.5" /> Mark as read</button>}
                                </div>
                            </div>
                        </article>
                    ))}
                </section>
                <div className="mt-4 flex items-center justify-between text-sm text-gray-400">
                    <span>{total} notification{total === 1 ? "" : "s"}</span>
                    <div className="flex items-center gap-2">
                        <button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded border border-gray-700 px-3 py-1.5 disabled:opacity-40">Previous</button>
                        <span>{page} / {maxPage}</span>
                        <button disabled={page >= maxPage} onClick={() => setPage((value) => value + 1)} className="rounded border border-gray-700 px-3 py-1.5 disabled:opacity-40">Next</button>
                    </div>
                </div>
            </div>
        </main>
    );
}
