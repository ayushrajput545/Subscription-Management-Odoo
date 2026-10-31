"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Loader2, RotateCw } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";

type Notification = {
    id: number;
    user_name: string | null;
    user_email: string | null;
    type: string;
    channel: "EMAIL" | "IN_APP";
    subject: string;
    status: "PENDING" | "SENT" | "FAILED" | "READ";
    attempts: number;
    sent_at: string | null;
    error_message: string | null;
    related_type: string | null;
    related_id: number | null;
    created_at: string;
    next_attempt_at: string;
};

export default function AdminNotificationsPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const [rows, setRows] = useState<Notification[]>([]);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [status, setStatus] = useState("");
    const [channel, setChannel] = useState("EMAIL");
    const [loading, setLoading] = useState(true);
    const [retrying, setRetrying] = useState<number | null>(null);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const params = new URLSearchParams({ page: String(page), limit: "20" });
            if (status) params.set("status", status);
            if (channel) params.set("channel", channel);
            const result = await api.get(`/admin/notifications?${params.toString()}`);
            setRows(result.data.notifications);
            setTotal(result.data.pagination.total);
        } catch {
            setError("Notification delivery data could not be loaded.");
        } finally {
            setLoading(false);
        }
    }, [page, status, channel]);

    useEffect(() => {
        if (authLoading) return;
        if (!user) router.replace("/login");
        else if (!["ADMIN", "STAFF"].includes(user.role)) router.replace("/unauthorized");
        else {
            const timer = window.setTimeout(() => { void load(); }, 0);
            return () => window.clearTimeout(timer);
        }
    }, [authLoading, user, router, load]);

    const retry = async (id: number) => {
        setRetrying(id);
        setError("");
        setMessage("");
        try {
            const result = await api.post(`/admin/notifications/${id}/retry`);
            setMessage(result.data.message);
            await load();
        } catch {
            setError("Retry was not accepted. The email may have reached its retry limit.");
        } finally {
            setRetrying(null);
        }
    };

    if (authLoading || loading) {
        return <div className="flex min-h-screen items-center justify-center bg-gray-950"><Loader2 className="h-7 w-7 animate-spin text-indigo-500" /></div>;
    }

    const maxPage = Math.max(1, Math.ceil(total / 20));
    return (
        <main className="min-h-screen bg-gray-950 px-4 py-8 text-gray-100 sm:px-6">
            <div className="mx-auto max-w-6xl">
                <Link href={user?.role === "STAFF" ? "/staff" : "/admin"} className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white"><ChevronLeft className="h-4 w-4" /> Dashboard</Link>
                <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
                    <div><h1 className="text-2xl font-bold">Notification delivery</h1><p className="mt-1 text-sm text-gray-400">Inspect delivery outcomes and retry failed email notifications.</p></div>
                    <div className="flex gap-2">
                        <select value={channel} onChange={(event) => { setChannel(event.target.value); setPage(1); }} className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm">
                            <option value="">All channels</option><option value="EMAIL">Email</option><option value="IN_APP">In-app</option>
                        </select>
                        <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm">
                            <option value="">All statuses</option><option value="PENDING">Pending</option><option value="SENT">Sent</option><option value="FAILED">Failed</option><option value="READ">Read</option>
                        </select>
                    </div>
                </div>
                {error && <p role="alert" className="mt-4 rounded-lg border border-red-800 bg-red-950/30 p-3 text-sm text-red-300">{error}</p>}
                {message && <p role="status" className="mt-4 rounded-lg border border-emerald-800 bg-emerald-950/30 p-3 text-sm text-emerald-300">{message}</p>}
                <div className="mt-5 overflow-x-auto rounded-xl border border-gray-800">
                    <table className="w-full min-w-[850px] text-left text-sm">
                        <thead className="bg-gray-900 text-xs uppercase text-gray-400"><tr>
                            <th className="px-4 py-3">Recipient</th><th className="px-4 py-3">Notification</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Attempts</th><th className="px-4 py-3">Created / sent</th><th className="px-4 py-3">Action</th>
                        </tr></thead>
                        <tbody className="divide-y divide-gray-800 bg-gray-900/40">
                            {rows.map((row) => <tr key={row.id} className="align-top">
                                <td className="px-4 py-4"><div className="text-white">{row.user_name || "System"}</div><div className="text-xs text-gray-500">{row.user_email || "—"}</div></td>
                                <td className="px-4 py-4"><div className="text-white">{row.subject}</div><div className="mt-1 text-xs text-gray-500">{row.type} · {row.channel}</div>{row.error_message && <div className="mt-2 max-w-sm text-xs text-red-300">{row.error_message}</div>}</td>
                                <td className="px-4 py-4"><span className={`rounded-full px-2 py-1 text-xs ${row.status === "SENT" || row.status === "READ" ? "bg-emerald-900/50 text-emerald-300" : row.status === "FAILED" ? "bg-red-900/50 text-red-300" : "bg-amber-900/50 text-amber-300"}`}>{row.status}</span></td>
                                <td className="px-4 py-4 text-gray-300">{row.attempts} / 3</td>
                                <td className="px-4 py-4 text-xs text-gray-400"><div>{new Date(row.created_at).toLocaleString()}</div>{row.sent_at && <div className="mt-1 text-emerald-300">Sent {new Date(row.sent_at).toLocaleString()}</div>}</td>
                                <td className="px-4 py-4">{row.channel === "EMAIL" && row.status === "FAILED" && row.attempts < 3 && <button disabled={retrying === row.id} onClick={() => void retry(row.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-800 disabled:opacity-50"><RotateCw className={`h-3.5 w-3.5 ${retrying === row.id ? "animate-spin" : ""}`} /> Retry</button>}</td>
                            </tr>)}
                            {!rows.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">{loading ? "Loading…" : "No notifications match these filters."}</td></tr>}
                        </tbody>
                    </table>
                </div>
                <div className="mt-4 flex items-center justify-between text-sm text-gray-400"><span>{total} records</span><div className="flex items-center gap-2"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded border border-gray-700 px-3 py-1.5 disabled:opacity-40">Previous</button><span>{page} / {maxPage}</span><button disabled={page >= maxPage} onClick={() => setPage((value) => value + 1)} className="rounded border border-gray-700 px-3 py-1.5 disabled:opacity-40">Next</button></div></div>
            </div>
        </main>
    );
}
