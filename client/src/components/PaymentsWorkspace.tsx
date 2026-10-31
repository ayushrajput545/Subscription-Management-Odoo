"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CreditCard, Loader2, Search } from "lucide-react";
import axios from "axios";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

type Role = "ADMIN" | "STAFF";
type Method = "CASH" | "BANK_TRANSFER" | "CARD" | "UPI" | "OTHER";
type Payment = {
    id: number; invoice_id: number; invoice_number: string; customer_name: string;
    amount: string; method: Method; payment_date: string; reference: string | null;
};
type OutstandingInvoice = {
    id: number; invoice_number: string; customer_name: string; due_date: string;
    total: string; amount_paid: string; outstanding: string;
};

const fieldClass = "w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 outline-none focus:border-indigo-500";
const buttonClass = "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-50";
const money = (value: string | number) => `₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const getError = (error: unknown) => axios.isAxiosError(error) ? error.response?.data?.message || "Request failed" : "Something went wrong";
const localDateTime = () => {
    const date = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
    return date.toISOString().slice(0, 16);
};
const totalPages = (total: number) => Math.max(1, Math.ceil(total / 10));

export default function PaymentsWorkspace({ role }: { role: Role }) {
    const { user, loading } = useAuth();
    const router = useRouter();
    const [payments, setPayments] = useState<Payment[]>([]);
    const [outstanding, setOutstanding] = useState<OutstandingInvoice[]>([]);
    const [summary, setSummary] = useState({ total_collected: "0.00", payment_count: 0 });
    const [paymentPage, setPaymentPage] = useState(1);
    const [paymentTotal, setPaymentTotal] = useState(0);
    const [outstandingPage, setOutstandingPage] = useState(1);
    const [outstandingTotal, setOutstandingTotal] = useState(0);
    const [paymentSearch, setPaymentSearch] = useState("");
    const [outstandingSearch, setOutstandingSearch] = useState("");
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [invoiceId, setInvoiceId] = useState("");
    const [amount, setAmount] = useState("");
    const [method, setMethod] = useState<Method>("CASH");
    const [paymentDate, setPaymentDate] = useState("");
    const [reference, setReference] = useState("");
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    useEffect(() => {
        if (loading) return;
        if (!user) { router.replace("/login"); return; }
        if (user.role !== role) router.replace("/unauthorized");
    }, [loading, user, role, router]);

    useEffect(() => {
        void Promise.resolve().then(() => setPaymentDate(localDateTime()));
    }, []);

    const fetchWorkspace = useCallback(async () => {
        setBusy(true);
        setError("");
        try {
            const [paymentsResponse, outstandingResponse, summaryResponse] = await Promise.all([
                api.get("/payments", { params: { page: paymentPage, limit: 10, ...(paymentSearch ? { search: paymentSearch } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) } }),
                api.get("/invoices/outstanding", { params: { page: outstandingPage, limit: 10, ...(outstandingSearch ? { search: outstandingSearch } : {}) } }),
                api.get("/payments/summary", { params: { ...(from ? { from } : {}), ...(to ? { to } : {}) } }),
            ]);
            setPayments(paymentsResponse.data.payments);
            setPaymentTotal(paymentsResponse.data.pagination.total);
            setOutstanding(outstandingResponse.data.invoices);
            setOutstandingTotal(outstandingResponse.data.pagination.total);
            setSummary(summaryResponse.data.summary);
        } catch (requestError) {
            setError(getError(requestError));
        } finally {
            setBusy(false);
        }
    }, [paymentPage, outstandingPage, paymentSearch, outstandingSearch, from, to]);

    useEffect(() => {
        if (loading || user?.role !== role) return;
        void Promise.resolve().then(fetchWorkspace);
    }, [loading, user, role, fetchWorkspace]);

    const record = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!invoiceId || Number(amount) <= 0) return;
        if (!window.confirm(`Record ${money(amount)} against ${selectedInvoice?.invoice_number ?? "this invoice"}? This action cannot be undone.`)) return;
        setSaving(true);
        setError("");
        setNotice("");
        try {
            await api.post("/payments", {
                invoice_id: Number(invoiceId), amount: Number(amount), method,
                payment_date: new Date(paymentDate).toISOString(), reference: reference.trim() || null,
                note: note.trim() || null,
            });
            setNotice("Payment recorded successfully");
            setInvoiceId("");
            setAmount("");
            setReference("");
            setNote("");
            setPaymentDate(localDateTime());
            await fetchWorkspace();
        } catch (requestError) {
            setError(getError(requestError));
        } finally {
            setSaving(false);
        }
    };

    const selectedInvoice = outstanding.find((item) => String(item.id) === invoiceId);
    if (loading || !user || user.role !== role) {
        return <div className="flex min-h-screen items-center justify-center bg-gray-950"><Loader2 className="h-7 w-7 animate-spin text-indigo-400" /></div>;
    }

    return <main className="min-h-screen bg-gray-950 px-4 py-6 text-gray-100 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-7xl">
            <header className="mb-7"><Link href={`/${role.toLowerCase()}`} className="mb-2 inline-block text-sm text-indigo-300 hover:text-indigo-200">← Dashboard</Link><h1 className="text-2xl font-bold">Payments</h1></header>
            {notice && <p role="status" className="mb-4 rounded-lg border border-emerald-900 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-300">{notice}</p>}
            {error && <p role="alert" className="mb-4 rounded-lg border border-red-900 bg-red-950/30 px-4 py-3 text-sm text-red-300">{error}</p>}

            <section className="mb-5 grid gap-3 sm:grid-cols-2">
                <article className="rounded-xl border border-gray-800 bg-gray-900/60 p-5"><p className="text-sm text-gray-400">Collected in selected period</p><p className="mt-2 text-2xl font-semibold">{money(summary.total_collected)}</p></article>
                <article className="rounded-xl border border-gray-800 bg-gray-900/60 p-5"><p className="text-sm text-gray-400">Payments in selected period</p><p className="mt-2 text-2xl font-semibold">{summary.payment_count}</p></article>
            </section>

            <section className="mb-5 rounded-xl border border-gray-800 bg-gray-900/60 p-5">
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><h2 className="text-lg font-semibold">Record payment</h2><div className="grid gap-3 sm:grid-cols-2"><label><span className="mb-1 block text-xs text-gray-400">Summary from</span><input aria-label="Summary from date" type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPaymentPage(1); }} className={fieldClass} /></label><label><span className="mb-1 block text-xs text-gray-400">Summary to</span><input aria-label="Summary to date" type="date" value={to} onChange={(event) => { setTo(event.target.value); setPaymentPage(1); }} className={fieldClass} /></label></div></div>
                <form onSubmit={(event) => void record(event)} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <label><span className="mb-1 block text-xs text-gray-400">Confirmed invoice</span><select required value={invoiceId} onChange={(event) => { setInvoiceId(event.target.value); const selected = outstanding.find((item) => String(item.id) === event.target.value); if (selected) setAmount(selected.outstanding); }} className={fieldClass}><option value="">Select invoice</option>{outstanding.map((item) => <option key={item.id} value={item.id}>{item.invoice_number} · {item.customer_name} · balance {money(item.outstanding)}</option>)}</select></label>
                    <label><span className="mb-1 block text-xs text-gray-400">Amount</span><input required type="number" min="0.01" max={selectedInvoice?.outstanding} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className={fieldClass} /></label>
                    <label><span className="mb-1 block text-xs text-gray-400">Method</span><select value={method} onChange={(event) => setMethod(event.target.value as Method)} className={fieldClass}>{["CASH", "BANK_TRANSFER", "CARD", "UPI", "OTHER"].map((item) => <option key={item}>{item}</option>)}</select></label>
                    <label><span className="mb-1 block text-xs text-gray-400">Payment date</span><input required type="datetime-local" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} className={fieldClass} /></label>
                    <label><span className="mb-1 block text-xs text-gray-400">Reference</span><input maxLength={255} value={reference} onChange={(event) => setReference(event.target.value)} className={fieldClass} /></label>
                    <label><span className="mb-1 block text-xs text-gray-400">Note</span><input value={note} onChange={(event) => setNote(event.target.value)} className={fieldClass} /></label>
                    <div className="lg:col-span-3"><button disabled={saving || !invoiceId} className={`${buttonClass} bg-indigo-600 text-white hover:bg-indigo-500`}><CreditCard className="h-4 w-4" />{saving ? "Recording..." : "Record payment"}</button></div>
                </form>
            </section>

            <section className="mb-5 overflow-hidden rounded-xl border border-gray-800 bg-gray-900/60">
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 px-5 py-4"><h2 className="font-semibold">Outstanding invoices</h2><form onSubmit={(event) => { event.preventDefault(); setOutstandingPage(1); void fetchWorkspace(); }} className="flex gap-2"><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" /><input value={outstandingSearch} onChange={(event) => setOutstandingSearch(event.target.value)} placeholder="Search invoice or customer" className={`${fieldClass} pl-9`} /></div><button className={`${buttonClass} bg-gray-800 text-gray-200`}>Search</button></form></header>
                {busy ? <Loading /> : outstanding.length === 0 ? <p className="px-5 py-8 text-center text-sm text-gray-500">No outstanding invoices</p> : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-gray-900 text-xs uppercase text-gray-500"><tr><th className="px-5 py-3">Invoice</th><th className="px-5 py-3">Customer</th><th className="px-5 py-3">Due</th><th className="px-5 py-3">Total</th><th className="px-5 py-3">Paid</th><th className="px-5 py-3">Balance</th><th className="px-5 py-3"></th></tr></thead><tbody className="divide-y divide-gray-800">{outstanding.map((item) => <tr key={item.id}><td className="px-5 py-4">{item.invoice_number}</td><td className="px-5 py-4">{item.customer_name}</td><td className="px-5 py-4">{item.due_date}</td><td className="px-5 py-4">{money(item.total)}</td><td className="px-5 py-4">{money(item.amount_paid)}</td><td className="px-5 py-4">{money(item.outstanding)}</td><td className="px-5 py-4"><button type="button" onClick={() => { setInvoiceId(String(item.id)); setAmount(item.outstanding); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="text-indigo-300 hover:text-indigo-200">Record</button></td></tr>)}</tbody></table></div>}
                <Pagination page={outstandingPage} pages={totalPages(outstandingTotal)} onPage={setOutstandingPage} />
            </section>

            <section className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900/60">
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 px-5 py-4"><h2 className="font-semibold">Payment history</h2><form onSubmit={(event) => { event.preventDefault(); setPaymentPage(1); void fetchWorkspace(); }} className="flex gap-2"><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" /><input value={paymentSearch} onChange={(event) => setPaymentSearch(event.target.value)} placeholder="Search payments" className={`${fieldClass} pl-9`} /></div><button className={`${buttonClass} bg-gray-800 text-gray-200`}>Search</button></form></header>
                {busy ? <Loading /> : payments.length === 0 ? <p className="px-5 py-8 text-center text-sm text-gray-500">No payments found</p> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-gray-900 text-xs uppercase text-gray-500"><tr><th className="px-5 py-3">Invoice</th><th className="px-5 py-3">Customer</th><th className="px-5 py-3">Amount</th><th className="px-5 py-3">Method</th><th className="px-5 py-3">Date</th><th className="px-5 py-3">Reference</th></tr></thead><tbody className="divide-y divide-gray-800">{payments.map((payment) => <tr key={payment.id}><td className="px-5 py-4">{payment.invoice_number}</td><td className="px-5 py-4">{payment.customer_name}</td><td className="px-5 py-4">{money(payment.amount)}</td><td className="px-5 py-4">{payment.method}</td><td className="px-5 py-4">{new Date(payment.payment_date).toLocaleString()}</td><td className="px-5 py-4">{payment.reference ?? "—"}</td></tr>)}</tbody></table></div>}
                <Pagination page={paymentPage} pages={totalPages(paymentTotal)} onPage={setPaymentPage} />
            </section>
        </div>
    </main>;
}

function Loading() {
    return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-indigo-400" /></div>;
}

function Pagination({ page, pages, onPage }: { page: number; pages: number; onPage: (page: number) => void }) {
    return <div className="flex items-center justify-between border-t border-gray-800 px-5 py-3 text-xs text-gray-500"><span>Page {page} of {pages}</span><div className="flex gap-2"><button disabled={page <= 1} onClick={() => onPage(page - 1)} className="rounded border border-gray-700 px-3 py-1.5 disabled:opacity-40">Previous</button><button disabled={page >= pages} onClick={() => onPage(page + 1)} className="rounded border border-gray-700 px-3 py-1.5 disabled:opacity-40">Next</button></div></div>;
}
