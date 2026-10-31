"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Play, RefreshCw } from "lucide-react";
import axios from "axios";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

type Activity = {
    id: number; invoice_number: string; invoice_date: string;
    billing_period_start: string; billing_period_end: string;
    total: string; status: string; customer_name: string;
};
type BillingStatus = {
    running: boolean;
    lastRunAt: string | null;
    lastRunFinishedAt: string | null;
    processedCount: number;
    successCount: number;
    failureCount: number;
    scheduleIntervalMs: number;
    recentFailures: { subscriptionId: string | null; code: string }[];
    recentActivity: Activity[];
};

const buttonClass = "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-50";
const money = (value: string | number) => `₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const getError = (error: unknown) => axios.isAxiosError(error) ? error.response?.data?.message || "Request failed" : "Something went wrong";
const formatDate = (value: string | null) => value ? new Date(value).toLocaleString() : "No runs yet";
const scheduleLabel = (intervalMs: number) => {
    const hours = intervalMs / 3_600_000;
    return Number.isInteger(hours) && hours >= 1 ? `Every ${hours} hour${hours === 1 ? "" : "s"}` : `Every ${Math.round(intervalMs / 60_000)} minutes`;
};

export default function BillingWorkspace() {
    const { user, loading } = useAuth();
    const [status, setStatus] = useState<BillingStatus | null>(null);
    const [busy, setBusy] = useState(true);
    const [running, setRunning] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    const fetchStatus = useCallback(async () => {
        setBusy(true);
        setError("");
        try {
            const response = await api.get("/billing/status");
            setStatus(response.data);
        } catch (requestError) {
            setError(getError(requestError));
        } finally {
            setBusy(false);
        }
    }, []);

    useEffect(() => {
        if (loading) return;
        if (!user) { window.location.replace("/login"); return; }
        if (user.role !== "ADMIN") { window.location.replace("/unauthorized"); return; }
        void Promise.resolve().then(fetchStatus);
    }, [loading, user, fetchStatus]);

    const trigger = async () => {
        if (!window.confirm("Run recurring billing now? Due active subscriptions will be invoiced.")) return;
        setRunning(true);
        setError("");
        setNotice("");
        try {
            const response = await api.post("/billing/run", {});
            setStatus((current) => current ? { ...current, ...response.data } : response.data);
            setNotice("Billing run completed");
            await fetchStatus();
        } catch (requestError) {
            setError(getError(requestError));
        } finally {
            setRunning(false);
        }
    };

    if (loading || !user || user.role !== "ADMIN") {
        return <div className="flex min-h-screen items-center justify-center bg-gray-950"><Loader2 className="h-7 w-7 animate-spin text-indigo-400" /></div>;
    }

    return <main className="min-h-screen bg-gray-950 px-4 py-6 text-gray-100 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-7xl">
            <header className="mb-7 flex flex-wrap items-end justify-between gap-3">
                <div><Link href="/admin" className="mb-2 inline-block text-sm text-indigo-300 hover:text-indigo-200">← Dashboard</Link><h1 className="text-2xl font-bold">Recurring billing</h1><p className="mt-1 text-sm text-gray-400">Scheduled billing: {scheduleLabel(status?.scheduleIntervalMs ?? 3_600_000)}</p></div>
                <div className="flex gap-2"><button onClick={() => void fetchStatus()} disabled={busy} className={`${buttonClass} bg-gray-800 text-gray-200`}><RefreshCw className="h-4 w-4" />Refresh</button><button onClick={() => void trigger()} disabled={running || status?.running} className={`${buttonClass} bg-indigo-600 text-white hover:bg-indigo-500`}><Play className="h-4 w-4" />{running || status?.running ? "Billing running..." : "Run billing now"}</button></div>
            </header>
            {notice && <p role="status" className="mb-4 rounded-lg border border-emerald-900 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-300">{notice}</p>}
            {error && <p role="alert" className="mb-4 rounded-lg border border-red-900 bg-red-950/30 px-4 py-3 text-sm text-red-300">{error}</p>}
            {busy && !status ? <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-indigo-400" /></div> : status && <>
                <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <Card label="Last run" value={formatDate(status.lastRunAt)} detail={status.lastRunFinishedAt ? `Finished ${formatDate(status.lastRunFinishedAt)}` : "No completed run"} />
                    <Card label="Run status" value={status.running ? "Running" : "Idle"} detail={status.running ? "Processing due subscriptions" : "Ready"} />
                    <Card label="Subscriptions processed" value={status.processedCount} detail="Billing periods processed in the latest run" />
                    <Card label="Invoices generated" value={status.successCount} detail="Successfully billed periods" />
                    <Card label="Failures" value={status.failureCount} detail={status.recentFailures.length ? "See recent failures below" : "No failures in the latest run"} />
                </section>
                {status.recentFailures.length > 0 && <section className="mt-5 rounded-xl border border-red-900/70 bg-red-950/20 p-5"><h2 className="font-semibold text-red-200">Recent billing failures</h2><ul className="mt-3 space-y-2 text-sm text-gray-300">{status.recentFailures.map((failure, index) => <li key={`${failure.subscriptionId}-${index}`}>Subscription {failure.subscriptionId ?? "batch"} · {failure.code}</li>)}</ul></section>}
                <section className="mt-5 overflow-hidden rounded-xl border border-gray-800 bg-gray-900/60">
                    <h2 className="border-b border-gray-800 px-5 py-4 font-semibold">Recent invoice activity</h2>
                    {status.recentActivity.length === 0 ? <p className="px-5 py-8 text-center text-sm text-gray-500">No recent invoices.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[780px] text-left text-sm"><thead className="bg-gray-900 text-xs uppercase text-gray-500"><tr><th className="px-5 py-3">Invoice</th><th className="px-5 py-3">Customer</th><th className="px-5 py-3">Billing period</th><th className="px-5 py-3">Date</th><th className="px-5 py-3">Total</th><th className="px-5 py-3">Status</th></tr></thead><tbody className="divide-y divide-gray-800">{status.recentActivity.map((item) => <tr key={item.id}><td className="px-5 py-4 font-medium">{item.invoice_number}</td><td className="px-5 py-4">{item.customer_name}</td><td className="px-5 py-4">{item.billing_period_start} – {item.billing_period_end}</td><td className="px-5 py-4">{item.invoice_date}</td><td className="px-5 py-4">{money(item.total)}</td><td className="px-5 py-4">{item.status}</td></tr>)}</tbody></table></div>}
                </section>
            </>}
        </div>
    </main>;
}

function Card({ label, value, detail }: { label: string; value: string | number; detail: string }) {
    return <article className="rounded-xl border border-gray-800 bg-gray-900/60 p-5"><p className="text-sm text-gray-400">{label}</p><p className="mt-2 text-xl font-semibold">{value}</p><p className="mt-1 text-xs text-gray-500">{detail}</p></article>;
}
