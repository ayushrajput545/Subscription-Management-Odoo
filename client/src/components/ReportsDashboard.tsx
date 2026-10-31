"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, RefreshCw } from "lucide-react";
import axios from "axios";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

type Summary = {
    total_customers: number; active_subscriptions: number; expiring_soon: number;
    overdue_invoices: number; invoiced_amount: string; collected_amount: string; outstanding_amount: string;
};
type GroupRow = { status?: string; billing_cycle?: string; invoice_count?: number; count?: number; invoiced_amount?: string; amount_paid?: string; balance?: string };
type RevenueRow = { period: string; collected_amount: string; payment_count: number };
type MethodRow = { method: string; payment_count: number; total_amount: string };
type PaymentDateRow = { period: string; payment_count: number; total_amount: string };
type TopCustomer = { customer_id: number; customer_name: string; customer_email: string; invoices_paid: number; collected_amount: string };
type Expiring = { id: number; subscription_number: string; customer_name: string; customer_email: string; plan_name: string; expiry_date: string };
type Outstanding = { id: number; invoice_number: string; customer_name: string; customer_email: string; due_date: string; total: string; amount_paid: string; balance: string };
type ReportData = {
    summary: Summary;
    revenue: RevenueRow[];
    subscriptions: { byStatus: GroupRow[]; byBillingCycle: GroupRow[] };
    invoices: GroupRow[];
    payments: { byMethod: MethodRow[]; byDate: PaymentDateRow[] };
    customers: TopCustomer[];
    expiring: Expiring[];
    outstanding: Outstanding[];
};

const fieldClass = "rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 outline-none focus:border-indigo-500";
const buttonClass = "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-50";
const money = (value: string | number) => `₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const getError = (error: unknown) => axios.isAxiosError(error) ? error.response?.data?.message || "Request failed" : "Something went wrong";
const today = () => new Date().toISOString().slice(0, 10);
const emptyData: ReportData = {
    summary: { total_customers: 0, active_subscriptions: 0, expiring_soon: 0, overdue_invoices: 0, invoiced_amount: "0", collected_amount: "0", outstanding_amount: "0" },
    revenue: [], subscriptions: { byStatus: [], byBillingCycle: [] }, invoices: [],
    payments: { byMethod: [], byDate: [] }, customers: [], expiring: [], outstanding: [],
};

export default function ReportsDashboard() {
    const { user, loading } = useAuth();
    const [data, setData] = useState<ReportData>(emptyData);
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [groupBy, setGroupBy] = useState("month");
    const [busy, setBusy] = useState(true);
    const [error, setError] = useState("");

    const fetchReports = useCallback(async () => {
        setBusy(true);
        setError("");
        const params = { ...(startDate ? { startDate } : {}), ...(endDate ? { endDate } : {}), groupBy };
        try {
            const [dashboard, revenue, subscriptions, invoices, payments, customers, expiring, outstanding] = await Promise.all([
                api.get("/reports/dashboard", { params }),
                api.get("/reports/revenue", { params }),
                api.get("/reports/subscriptions"),
                api.get("/reports/invoices", { params }),
                api.get("/reports/payments", { params }),
                api.get("/reports/top-customers", { params }),
                api.get("/reports/expiring-subscriptions", { params: { days: 30 } }),
                api.get("/reports/outstanding-invoices", { params }),
            ]);
            setData({
                summary: dashboard.data.summary,
                revenue: revenue.data.revenue,
                subscriptions: subscriptions.data,
                invoices: invoices.data.invoices,
                payments: payments.data,
                customers: customers.data.customers,
                expiring: expiring.data.subscriptions,
                outstanding: outstanding.data.invoices,
            });
        } catch (requestError) {
            setError(getError(requestError));
        } finally {
            setBusy(false);
        }
    }, [startDate, endDate, groupBy]);

    useEffect(() => {
        if (loading) return;
        if (!user) { window.location.replace("/login"); return; }
        if (user.role !== "ADMIN" && user.role !== "STAFF") { window.location.replace("/unauthorized"); return; }
        void Promise.resolve().then(fetchReports);
    }, [loading, user, fetchReports]);

    if (loading || !user || (user.role !== "ADMIN" && user.role !== "STAFF")) {
        return <div className="flex min-h-screen items-center justify-center bg-gray-950"><Loader2 className="h-7 w-7 animate-spin text-indigo-400" /></div>;
    }

    return <main className="min-h-screen bg-gray-950 px-4 py-6 text-gray-100 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-7xl">
            <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
                <div><Link href={user.role === "ADMIN" ? "/admin" : "/staff"} className="mb-2 inline-block text-sm text-indigo-300 hover:text-indigo-200">← Dashboard</Link><h1 className="text-2xl font-bold">Reports &amp; analytics</h1></div>
                <div className="flex flex-wrap items-end gap-2">
                    <label><span className="mb-1 block text-xs text-gray-400">Start date</span><input type="date" max={endDate || today()} value={startDate} onChange={(event) => setStartDate(event.target.value)} className={fieldClass} /></label>
                    <label><span className="mb-1 block text-xs text-gray-400">End date</span><input type="date" min={startDate || undefined} max={today()} value={endDate} onChange={(event) => setEndDate(event.target.value)} className={fieldClass} /></label>
                    <label><span className="mb-1 block text-xs text-gray-400">Revenue group</span><select value={groupBy} onChange={(event) => setGroupBy(event.target.value)} className={fieldClass}>{["day", "week", "month", "year"].map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select></label>
                    <button onClick={() => void fetchReports()} disabled={busy} className={`${buttonClass} bg-indigo-600 text-white`}><RefreshCw className="h-4 w-4" />Refresh</button>
                </div>
            </header>
            {error && <p role="alert" className="mb-4 rounded-lg border border-red-900 bg-red-950/30 px-4 py-3 text-sm text-red-300">{error}</p>}
            {busy && <div className="mb-4 flex items-center gap-2 text-sm text-gray-400"><Loader2 className="h-4 w-4 animate-spin" />Updating reports...</div>}

            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <Metric label="Customers" value={data.summary.total_customers} />
                <Metric label="Active subscriptions" value={data.summary.active_subscriptions} />
                <Metric label="Expiring in 30 days" value={data.summary.expiring_soon} />
                <Metric label="Invoiced revenue" value={money(data.summary.invoiced_amount)} />
                <Metric label="Collected revenue" value={money(data.summary.collected_amount)} />
                <Metric label="Outstanding balance" value={money(data.summary.outstanding_amount)} />
            </section>
            <p className="mt-2 text-xs text-gray-500">Overdue invoices: {data.summary.overdue_invoices}</p>

            <section className="mt-5 grid gap-5 lg:grid-cols-2">
                <Panel title="Collected revenue by period" empty={!data.revenue.length}>
                    <SimpleBars rows={data.revenue.map((row) => ({ label: row.period, value: Number(row.collected_amount), display: money(row.collected_amount) }))} />
                </Panel>
                <Panel title="Payments by method" empty={!data.payments.byMethod.length}>
                    <SimpleBars rows={data.payments.byMethod.map((row) => ({ label: row.method, value: Number(row.total_amount), display: `${money(row.total_amount)} · ${row.payment_count} payments` }))} />
                </Panel>
                <Panel title="Subscriptions by status" empty={!data.subscriptions.byStatus.length}>
                    <CountTable rows={data.subscriptions.byStatus.map((row) => [row.status ?? "", row.count ?? 0])} />
                </Panel>
                <Panel title="Subscriptions by billing cycle" empty={!data.subscriptions.byBillingCycle.length}>
                    <CountTable rows={data.subscriptions.byBillingCycle.map((row) => [row.billing_cycle ?? "", row.count ?? 0])} />
                </Panel>
                <Panel title="Invoices by status" empty={!data.invoices.length}>
                    <Table headers={["Status", "Count", "Invoiced", "Paid", "Balance"]} rows={data.invoices.map((row) => [row.status ?? "", String(row.invoice_count ?? 0), money(row.invoiced_amount ?? "0"), money(row.amount_paid ?? "0"), money(row.balance ?? "0")])} />
                </Panel>
                <Panel title={`Payment totals by ${groupBy}`} empty={!data.payments.byDate.length}>
                    <SimpleBars rows={data.payments.byDate.map((row) => ({ label: row.period, value: Number(row.total_amount), display: `${money(row.total_amount)} · ${row.payment_count}` }))} />
                </Panel>
                <Panel title="Top customers by collected revenue" empty={!data.customers.length}>
                    <Table headers={["Customer", "Invoices", "Collected"]} rows={data.customers.map((row) => [`${row.customer_name} (${row.customer_email})`, String(row.invoices_paid), money(row.collected_amount)])} />
                </Panel>
                <Panel title="Subscriptions expiring in 30 days" empty={!data.expiring.length}>
                    <Table headers={["Subscription", "Customer", "Plan", "Expires"]} rows={data.expiring.map((row) => [row.subscription_number, row.customer_name, row.plan_name, row.expiry_date])} />
                </Panel>
                <Panel title="Outstanding invoices" empty={!data.outstanding.length}>
                    <Table headers={["Invoice", "Customer", "Due", "Total", "Paid", "Balance"]} rows={data.outstanding.map((row) => [row.invoice_number, row.customer_name, row.due_date, money(row.total), money(row.amount_paid), money(row.balance)])} />
                </Panel>
            </section>
        </div>
    </main>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
    return <article className="rounded-xl border border-gray-800 bg-gray-900/60 p-4"><p className="text-xs text-gray-500">{label}</p><p className="mt-2 text-xl font-semibold text-white">{value}</p></article>;
}

function Panel({ title, empty, children }: { title: string; empty: boolean; children: React.ReactNode }) {
    return <section className="min-w-0 overflow-hidden rounded-xl border border-gray-800 bg-gray-900/60"><h2 className="border-b border-gray-800 px-5 py-4 font-semibold">{title}</h2>{empty ? <p className="px-5 py-8 text-center text-sm text-gray-500">No data for this period.</p> : <div className="overflow-x-auto p-4">{children}</div>}</section>;
}

function SimpleBars({ rows }: { rows: { label: string; value: number; display: string }[] }) {
    const max = Math.max(...rows.map((row) => row.value), 1);
    return <div className="space-y-3">{rows.map((row) => <div key={row.label} className="grid grid-cols-[minmax(75px,1fr)_3fr_auto] items-center gap-3 text-xs"><span className="truncate text-gray-400">{row.label}</span><div className="h-2 overflow-hidden rounded bg-gray-800"><div className="h-full rounded bg-indigo-500" style={{ width: `${Math.max(row.value > 0 ? 2 : 0, (row.value / max) * 100)}%` }} /></div><span className="whitespace-nowrap text-gray-200">{row.display}</span></div>)}</div>;
}

function CountTable({ rows }: { rows: [string, number][] }) {
    return <Table headers={["Category", "Count"]} rows={rows.map(([label, count]) => [label, String(count)])} />;
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
    return <table className="w-full min-w-max text-left text-xs"><thead className="text-gray-500"><tr>{headers.map((header) => <th key={header} className="px-3 py-2 font-medium">{header}</th>)}</tr></thead><tbody className="divide-y divide-gray-800">{rows.map((row, index) => <tr key={`${row[0]}-${index}`}>{row.map((cell, cellIndex) => <td key={cellIndex} className="max-w-56 truncate px-3 py-3 text-gray-300" title={cell}>{cell}</td>)}</tr>)}</tbody></table>;
}
