"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Check, Loader2 } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

type Notification = {
    id: number;
    type: string;
    subject: string;
    message: string;
    status: "PENDING" | "READ";
    created_at: string;
};

export default function NotificationBell() {
    const { user } = useAuth();
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [unread, setUnread] = useState(0);
    const [notifications, setNotifications] = useState<Notification[]>([]);

    const refreshCount = useCallback(async () => {
        if (!user) return;
        try {
            const response = await api.get("/notifications/unread-count");
            setUnread(response.data.unread_count);
        } catch {
            setError("Could not load notification count.");
        }
    }, [user]);

    const loadNotifications = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const [list, count] = await Promise.all([
                api.get("/notifications?limit=5"),
                api.get("/notifications/unread-count"),
            ]);
            setNotifications(list.data.notifications);
            setUnread(count.data.unread_count);
        } catch {
            setError("Could not load notifications.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!user) return;
        const initialLoad = window.setTimeout(() => { void refreshCount(); }, 0);
        const timer = window.setInterval(() => { void refreshCount(); }, 60000);
        return () => {
            window.clearTimeout(initialLoad);
            window.clearInterval(timer);
        };
    }, [user, refreshCount]);

    const markRead = async (id: number) => {
        try {
            await api.patch(`/notifications/${id}/read`);
            await loadNotifications();
        } catch {
            setError("Could not mark notification as read.");
        }
    };

    if (!user) return null;

    return (
        <div className="relative">
            <button
                type="button"
                aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
                onClick={() => {
                    const next = !open;
                    setOpen(next);
                    if (next) void loadNotifications();
                }}
                className="relative rounded-lg p-2 text-gray-400 transition hover:bg-gray-800 hover:text-white"
            >
                <Bell className="h-5 w-5" />
                {unread > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-indigo-500 px-1 text-center text-[10px] leading-4 text-white">{unread > 99 ? "99+" : unread}</span>}
            </button>
            {open && (
                <div className="absolute right-0 top-12 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-gray-800 bg-gray-900 shadow-xl">
                    <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
                        <h2 className="text-sm font-semibold text-white">Notifications</h2>
                        <Link href="/notifications" onClick={() => setOpen(false)} className="text-xs text-indigo-300 hover:text-indigo-200">View all</Link>
                    </div>
                    {error && <p role="alert" className="px-4 py-3 text-xs text-red-300">{error}</p>}
                    {loading ? (
                        <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-indigo-400" /></div>
                    ) : notifications.length === 0 ? (
                        <p className="px-4 py-6 text-center text-sm text-gray-400">You&apos;re all caught up.</p>
                    ) : (
                        <ul className="max-h-80 divide-y divide-gray-800 overflow-y-auto">
                            {notifications.map((notification) => (
                                <li key={notification.id} className={`px-4 py-3 ${notification.status === "PENDING" ? "bg-indigo-950/30" : ""}`}>
                                    <div className="flex items-start gap-2">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium text-white">{notification.subject}</p>
                                            <p className="mt-1 line-clamp-2 text-xs text-gray-400">{notification.message}</p>
                                            <time className="mt-2 block text-[11px] text-gray-500">{new Date(notification.created_at).toLocaleString()}</time>
                                        </div>
                                        {notification.status === "PENDING" && (
                                            <button type="button" aria-label="Mark as read" onClick={() => void markRead(notification.id)} className="rounded p-1 text-gray-400 hover:text-emerald-300">
                                                <Check className="h-4 w-4" />
                                            </button>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}
