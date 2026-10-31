"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Pencil, Plus, Printer, Search, Trash2, X } from "lucide-react";
import axios from "axios";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

type Role = "ADMIN" | "STAFF" | "CUSTOMER";
type View = "taxes" | "discounts" | "invoices" | "invoice";
type Product = { id: number; name: string };
type Tax = { id: number; name: string; rate: string; is_active: boolean };
type Discount = {
    id: number; name: string; type: "FIXED" | "PERCENTAGE"; value: string;
    min_purchase: string; min_quantity: number; valid_from: string | null; valid_to: string | null;
    usage_limit: number | null; used_count: number; applies_to: "PRODUCT" | "SUBSCRIPTION";
    is_active: boolean; product_ids: number[];
};
type Invoice = {
    id: number; invoice_number: string; subscription_id: number; subscription_number: string;
    customer_name: string; invoice_date: string; due_date: string; billing_period_start: string;
    billing_period_end: string; subtotal: string; tax_total: string; discount_total: string;
    total: string; amount_paid: string; outstanding: string; status: "DRAFT" | "CONFIRMED" | "PAID" | "CANCELLED";
    customer_email?: string;
    items: { id: number; product_name: string; description: string; quantity: number; unit_price: string; tax_rate: string; tax_amount: string; discount_amount: string; line_total: string }[];
};
type PaymentRecord = { id: number; amount: string; method: string; payment_date: string; reference: string | null; note: string | null; recorded_by_name: string };

const fieldClass = "w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 outline-none focus:border-indigo-500";
const buttonClass = "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-50";
const money = (value: string | number) => `₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const getError = (error: unknown) => axios.isAxiosError(error) ? error.response?.data?.message || "Request failed" : "Something went wrong";

export default function InvoiceWorkspace({
    role,
    view,
    recordId,
}: {
    role: Role;
    view: View;
    recordId?: string;
}) {
    const { user, loading } = useAuth();
    const router = useRouter();
    const base = `/${role.toLowerCase()}`;
    const admin = role === "ADMIN";
    const canManage = role !== "CUSTOMER";
    const isCustomer = role === "CUSTOMER";
    const [busy, setBusy] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [taxes, setTaxes] = useState<Tax[]>([]);
    const [discounts, setDiscounts] = useState<Discount[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [invoice, setInvoice] = useState<Invoice | null>(null);
    const [invoicePayments, setInvoicePayments] = useState<PaymentRecord[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [searchText, setSearchText] = useState("");
    const [search, setSearch] = useState("");
    const [status, setStatus] = useState("");
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [dialog, setDialog] = useState(false);
    const [editingTax, setEditingTax] = useState<Tax | null>(null);
    const [editingDiscount, setEditingDiscount] = useState<Discount | null>(null);
    const [taxForm, setTaxForm] = useState({ name: "", rate: "" });
    const [discountForm, setDiscountForm] = useState({
        name: "", type: "PERCENTAGE" as Discount["type"], value: "", min_purchase: "0",
        min_quantity: "1", valid_from: "", valid_to: "", usage_limit: "",
        applies_to: "SUBSCRIPTION" as Discount["applies_to"], product_ids: [] as string[],
    });

    useEffect(() => {
        if (loading) return;
        if (!user) { router.replace("/login"); return; }
        if (user.role !== role) router.replace("/unauthorized");
    }, [loading, user, role, router]);

    const fetchList = useCallback(async () => {
        setBusy(true);
        setError("");
        try {
            if (view === "taxes") {
                const response = await api.get("/taxes");
                setTaxes(response.data.taxes);
                setTotal(response.data.taxes.length);
            } else if (view === "discounts") {
                const response = await api.get("/discounts", { params: { page, limit: 10, ...(search ? { search } : {}) } });
                setDiscounts(response.data.discounts);
                setTotal(response.data.pagination.total);
            } else {
                const response = await api.get("/invoices", {
                    params: { page, limit: 10, ...(search ? { search } : {}), ...(status ? { status } : {}) },
                });
                setInvoices(response.data.invoices);
                setTotal(response.data.pagination.total);
            }
        } catch (requestError) {
            setError(getError(requestError));
        } finally {
            setBusy(false);
        }
    }, [view, page, search, status]);

    const fetchInvoice = useCallback(async () => {
        if (!recordId) return;
        setBusy(true);
        setError("");
        try {
            const [response, paymentResponse] = await Promise.all([
                api.get(`/invoices/${recordId}`),
                api.get(`/invoices/${recordId}/payments`),
            ]);
            setInvoice(response.data.invoice);
            setInvoicePayments(paymentResponse.data.payments);
        } catch (requestError) {
            setError(getError(requestError));
            setInvoice(null);
        } finally {
            setBusy(false);
        }
    }, [recordId]);

    useEffect(() => {
        if (loading || user?.role !== role) return;
        if (view === "invoice") void Promise.resolve().then(fetchInvoice);
        else void Promise.resolve().then(fetchList);
    }, [loading, user, role, view, fetchInvoice, fetchList]);

    useEffect(() => {
        if (view !== "discounts" || loading || user?.role !== role) return;
        void Promise.resolve().then(async () => {
            try {
                const response = await api.get("/products", { params: { is_active: "true", limit: 100 } });
                setProducts(response.data.products);
            } catch (requestError) {
                setError(getError(requestError));
            }
        });
    }, [view, loading, user, role]);

    const openTax = (tax?: Tax) => {
        setEditingTax(tax ?? null);
        setEditingDiscount(null);
        setTaxForm(tax ? { name: tax.name, rate: String(tax.rate) } : { name: "", rate: "" });
        setError("");
        setDialog(true);
    };

    const openDiscount = (discount?: Discount) => {
        setEditingDiscount(discount ?? null);
        setEditingTax(null);
        setDiscountForm(discount ? {
            name: discount.name, type: discount.type, value: String(discount.value),
            min_purchase: String(discount.min_purchase), min_quantity: String(discount.min_quantity),
            valid_from: discount.valid_from?.slice(0, 10) ?? "", valid_to: discount.valid_to?.slice(0, 10) ?? "",
            usage_limit: discount.usage_limit === null ? "" : String(discount.usage_limit),
            applies_to: discount.applies_to, product_ids: discount.product_ids.map(String),
        } : {
            name: "", type: "PERCENTAGE", value: "", min_purchase: "0", min_quantity: "1",
            valid_from: "", valid_to: "", usage_limit: "", applies_to: "SUBSCRIPTION", product_ids: [],
        });
        setError("");
        setDialog(true);
    };

    const submitTax = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setSaving(true);
        setError("");
        try {
            const payload = { name: taxForm.name.trim(), rate: Number(taxForm.rate) };
            if (editingTax) await api.patch(`/taxes/${editingTax.id}`, payload);
            else await api.post("/taxes", payload);
            setDialog(false);
            setNotice("Tax saved");
            await fetchList();
        } catch (requestError) {
            setError(getError(requestError));
        } finally {
            setSaving(false);
        }
    };

    const submitDiscount = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (discountForm.valid_from && discountForm.valid_to && discountForm.valid_from > discountForm.valid_to) {
            setError("Valid from cannot be after valid to");
            return;
        }
        setSaving(true);
        setError("");
        try {
            const payload = {
                name: discountForm.name.trim(), type: discountForm.type, value: Number(discountForm.value),
                min_purchase: Number(discountForm.min_purchase), min_quantity: Number(discountForm.min_quantity),
                valid_from: discountForm.valid_from || null, valid_to: discountForm.valid_to || null,
                usage_limit: discountForm.usage_limit ? Number(discountForm.usage_limit) : null,
                applies_to: discountForm.applies_to,
                product_ids: discountForm.applies_to === "PRODUCT" ? discountForm.product_ids.map(Number) : [],
            };
            if (editingDiscount) await api.patch(`/discounts/${editingDiscount.id}`, payload);
            else await api.post("/discounts", payload);
            setDialog(false);
            setNotice("Discount saved");
            await fetchList();
        } catch (requestError) {
            setError(getError(requestError));
        } finally {
            setSaving(false);
        }
    };

    const toggleActive = async (record: Tax | Discount) => {
        const label = view === "taxes" ? "tax" : "discount";
        if (!window.confirm(`Deactivate ${label} "${record.name}"?`)) return;
        try {
            await api.delete(`/${label === "tax" ? "taxes" : "discounts"}/${record.id}`);
            setNotice(`${label} deactivated`);
            await fetchList();
        } catch (requestError) {
            setError(getError(requestError));
        }
    };

    const invoiceAction = async (action: "confirm" | "cancel" | "send") => {
        if (!invoice) return;
        if (action === "cancel" && !window.confirm(`Cancel ${invoice.invoice_number}?`)) return;
        setSaving(true);
        setError("");
        try {
            if (action === "send") {
                await api.post(`/invoices/${invoice.id}/send`);
                setNotice("Invoice sent by email");
            } else {
                const response = await api.patch(`/invoices/${invoice.id}/${action}`);
                setInvoice(response.data.invoice);
                setNotice(`Invoice ${action === "confirm" ? "confirmed" : "cancelled"}`);
            }
        } catch (requestError) {
            setError(getError(requestError));
        } finally {
            setSaving(false);
        }
    };

    const title = view === "taxes" ? "Taxes" : view === "discounts" ? "Discounts"
        : view === "invoice" ? invoice?.invoice_number ?? "Invoice details" : "Invoices";
    if (loading || !user || user.role !== role) {
        return <div className="flex min-h-screen items-center justify-center bg-gray-950"><Loader2 className="h-7 w-7 animate-spin text-indigo-400" /></div>;
    }

    const totalPages = Math.max(1, Math.ceil(total / 10));
    const labelClass = "mb-1.5 block text-xs font-medium text-gray-400";
    const openPdf = (invoiceId: number) => window.open(`${api.defaults.baseURL}/invoices/${invoiceId}/pdf`, "_blank", "noopener,noreferrer");

    return (
        <main className="min-h-screen bg-gray-950 px-4 py-6 text-gray-100 sm:px-6 lg:px-10">
            <div className="mx-auto max-w-7xl">
                <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
                    <div><Link href={base} className="mb-2 inline-block text-sm text-indigo-300 hover:text-indigo-200">← Dashboard</Link><h1 className="text-2xl font-bold">{title}</h1></div>
                    {(view === "taxes" && admin) && <button onClick={() => openTax()} className={`${buttonClass} bg-indigo-600 text-white`}><Plus className="h-4 w-4" />Add tax</button>}
                    {(view === "discounts" && admin) && <button onClick={() => openDiscount()} className={`${buttonClass} bg-indigo-600 text-white`}><Plus className="h-4 w-4" />Add discount</button>}
                </header>
                {notice && <p role="status" className="mb-4 rounded-lg border border-emerald-900 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-300">{notice}</p>}
                {error && <p role="alert" className="mb-4 rounded-lg border border-red-900 bg-red-950/30 px-4 py-3 text-sm text-red-300">{error}</p>}

                {(view === "taxes" || view === "discounts" || view === "invoices") && <>
                    {view !== "taxes" && <section className="mb-4 flex flex-col gap-3 rounded-xl border border-gray-800 bg-gray-900/60 p-4 sm:flex-row">
                        <form onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(searchText.trim()); }} className="flex flex-1 gap-2">
                            <div className="relative flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" /><input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder={`Search ${view}...`} className={`${fieldClass} pl-9`} /></div>
                            <button className={`${buttonClass} bg-gray-800 text-gray-200`}>Search</button>
                        </form>
                        {view === "invoices" && <select aria-label="Invoice status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className={`${fieldClass} sm:w-48`}><option value="">All statuses</option>{["DRAFT", "CONFIRMED", "PAID", "CANCELLED"].map((item) => <option key={item}>{item}</option>)}</select>}
                    </section>}
                    {view === "taxes" && <p className="mb-4 rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-3 text-sm text-gray-400">Invoice tax is calculated from the tax-rate snapshot on each subscription item, after discounts. Active tax records are reference rates and are not automatically added to subscriptions.</p>}
                    <section className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900/60">
                        {busy ? <Loading /> : view === "taxes" && taxes.length === 0 ? <Empty text="No taxes configured" />
                            : view === "discounts" && discounts.length === 0 ? <Empty text="No discounts found" />
                                : view === "invoices" && invoices.length === 0 ? <Empty text="No invoices found" />
                                    : <div className="overflow-x-auto">
                                        {view === "taxes" && <table className="w-full min-w-[560px] text-left text-sm"><thead className="bg-gray-900 text-xs uppercase text-gray-500"><tr><th className="px-4 py-3">Tax</th><th className="px-4 py-3">Rate</th><th className="px-4 py-3">Status</th>{admin && <th className="px-4 py-3 text-right">Actions</th>}</tr></thead><tbody className="divide-y divide-gray-800">{taxes.map((tax) => <tr key={tax.id}><td className="px-4 py-4 font-medium">{tax.name}</td><td className="px-4 py-4">{tax.rate}%</td><td className="px-4 py-4"><Badge status={tax.is_active ? "ACTIVE" : "INACTIVE"} /></td>{admin && <td className="px-4 py-4"><div className="flex justify-end gap-2"><button aria-label={`Edit ${tax.name}`} onClick={() => openTax(tax)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-800"><Pencil className="h-4 w-4" /></button>{tax.is_active && <button aria-label={`Deactivate ${tax.name}`} onClick={() => void toggleActive(tax)} className="rounded-lg p-2 text-gray-400 hover:bg-red-950"><Trash2 className="h-4 w-4" /></button>}</div></td>}</tr>)}</tbody></table>}
                                        {view === "discounts" && <table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-gray-900 text-xs uppercase text-gray-500"><tr><th className="px-4 py-3">Discount</th><th className="px-4 py-3">Value</th><th className="px-4 py-3">Scope</th><th className="px-4 py-3">Minimums</th><th className="px-4 py-3">Validity / use</th><th className="px-4 py-3">Status</th>{admin && <th className="px-4 py-3 text-right">Actions</th>}</tr></thead><tbody className="divide-y divide-gray-800">{discounts.map((discount) => <tr key={discount.id}><td className="px-4 py-4 font-medium">{discount.name}{discount.applies_to === "PRODUCT" && <p className="mt-1 text-xs text-gray-500">{discount.product_ids.map((id) => products.find((p) => p.id === Number(id))?.name ?? `#${id}`).join(", ")}</p>}</td><td className="px-4 py-4">{discount.type === "PERCENTAGE" ? `${discount.value}%` : money(discount.value)}</td><td className="px-4 py-4 text-gray-300">{discount.applies_to}</td><td className="px-4 py-4 text-gray-400">{money(discount.min_purchase)} / {discount.min_quantity} qty</td><td className="px-4 py-4 text-gray-400">{discount.valid_from?.slice(0, 10) ?? "Any"} – {discount.valid_to?.slice(0, 10) ?? "Any"}<p className="text-xs">Used {discount.used_count}{discount.usage_limit ? ` / ${discount.usage_limit}` : ""}</p></td><td className="px-4 py-4"><Badge status={discount.is_active ? "ACTIVE" : "INACTIVE"} /></td>{admin && <td className="px-4 py-4"><div className="flex justify-end gap-2"><button aria-label={`Edit ${discount.name}`} onClick={() => openDiscount(discount)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-800"><Pencil className="h-4 w-4" /></button>{discount.is_active && <button aria-label={`Deactivate ${discount.name}`} onClick={() => void toggleActive(discount)} className="rounded-lg p-2 text-gray-400 hover:bg-red-950"><Trash2 className="h-4 w-4" /></button>}</div></td>}</tr>)}</tbody></table>}
                                        {view === "invoices" && <table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-gray-900 text-xs uppercase text-gray-500"><tr><th className="px-4 py-3">Invoice</th>{!isCustomer && <th className="px-4 py-3">Customer</th>}<th className="px-4 py-3">Subscription</th><th className="px-4 py-3">Date / due</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Paid</th><th className="px-4 py-3">Balance</th><th className="px-4 py-3">Status</th></tr></thead><tbody className="divide-y divide-gray-800">{invoices.map((item) => <tr key={item.id}><td className="px-4 py-4"><Link className="font-medium text-indigo-300" href={`${base}/invoices/${item.id}`}>{item.invoice_number}</Link></td>{!isCustomer && <td className="px-4 py-4 text-gray-300">{item.customer_name}</td>}<td className="px-4 py-4 text-gray-300">{item.subscription_number}</td><td className="px-4 py-4 text-gray-400">{item.invoice_date?.slice(0, 10)}<p className="text-xs">Due {item.due_date?.slice(0, 10)}</p></td><td className="px-4 py-4">{money(item.total)}</td><td className="px-4 py-4">{money(item.amount_paid)}</td><td className="px-4 py-4">{money(item.outstanding)}</td><td className="px-4 py-4"><Badge status={item.status} /></td></tr>)}</tbody></table>}
                                    </div>}
                        {view !== "taxes" && <Pagination page={page} pages={totalPages} total={total} onPage={setPage} />}
                    </section>
                </>}

                {view === "invoice" && (busy ? <Loading /> : !invoice ? <Empty text="Invoice not found" /> : <section className="space-y-4">
                    <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-5">
                        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">{invoice.invoice_number}</h2><p className="mt-1 text-sm text-gray-400">{invoice.customer_name} · <Link className="text-indigo-300" href={`${base}/subscriptions/${invoice.subscription_id}`}>{invoice.subscription_number}</Link></p></div><Badge status={invoice.status} /></div>
                        <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[["Invoice date", invoice.invoice_date], ["Due date", invoice.due_date], ["Period start", invoice.billing_period_start], ["Period end", invoice.billing_period_end]].map(([label, value]) => <div key={label}><dt className="text-xs text-gray-500">{label}</dt><dd className="mt-1 text-sm">{value?.slice(0, 10)}</dd></div>)}</dl>
                        {canManage && <div className="mt-5 flex flex-wrap gap-2"><button onClick={() => openPdf(invoice.id)} className={`${buttonClass} bg-gray-800 text-gray-200`}><Printer className="h-4 w-4" />View / print PDF</button>{invoice.status === "DRAFT" && <button disabled={saving} onClick={() => void invoiceAction("confirm")} className={`${buttonClass} bg-indigo-600 text-white`}>Confirm invoice</button>}{invoice.status === "CONFIRMED" && <><button disabled={saving} onClick={() => void invoiceAction("send")} className={`${buttonClass} bg-emerald-700 text-white`}>Send email</button><button disabled={saving} onClick={() => void invoiceAction("cancel")} className={`${buttonClass} bg-red-950 text-red-200`}>Cancel invoice</button></>}</div>}
                        {isCustomer && <button onClick={() => openPdf(invoice.id)} className={`${buttonClass} mt-5 bg-gray-800 text-gray-200`}><Printer className="h-4 w-4" />View / print PDF</button>}
                    </div>
                    <section className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900/60"><div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-gray-900 text-xs uppercase text-gray-500"><tr><th className="px-5 py-3">Description</th><th className="px-5 py-3">Qty</th><th className="px-5 py-3">Unit price</th><th className="px-5 py-3">Discount</th><th className="px-5 py-3">Tax</th><th className="px-5 py-3 text-right">Total</th></tr></thead><tbody className="divide-y divide-gray-800">{invoice.items.map((item) => <tr key={item.id}><td className="px-5 py-4">{item.description}</td><td className="px-5 py-4">{item.quantity}</td><td className="px-5 py-4">{money(item.unit_price)}</td><td className="px-5 py-4">{money(item.discount_amount)}</td><td className="px-5 py-4">{money(item.tax_amount)} ({item.tax_rate}%)</td><td className="px-5 py-4 text-right">{money(item.line_total)}</td></tr>)}</tbody></table></div>
                        <p className="border-t border-gray-800 px-5 py-3 text-xs text-gray-500">Tax is calculated on each discounted line using the tax rate captured on the subscription item.</p>
                        <div className="space-y-1 px-5 py-4 text-right text-sm"><p className="text-gray-400">Subtotal: {money(invoice.subtotal)}</p><p className="text-gray-400">Discount: −{money(invoice.discount_total)}</p><p className="text-gray-400">Tax: {money(invoice.tax_total)}</p><p className="font-semibold text-white">Total: {money(invoice.total)}</p><p className="text-gray-300">Paid: {money(invoice.amount_paid)}</p><p className="font-semibold text-amber-300">Outstanding balance: {money(invoice.outstanding)}</p></div>
                    </section>
                    <section className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900/60">
                        <h2 className="border-b border-gray-800 px-5 py-4 font-semibold">Payment history</h2>
                        {invoicePayments.length === 0 ? <p className="px-5 py-6 text-sm text-gray-500">No payments recorded for this invoice.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-gray-900 text-xs uppercase text-gray-500"><tr><th className="px-5 py-3">Date</th><th className="px-5 py-3">Amount</th><th className="px-5 py-3">Method</th><th className="px-5 py-3">Reference</th><th className="px-5 py-3">Recorded by</th></tr></thead><tbody className="divide-y divide-gray-800">{invoicePayments.map((payment) => <tr key={payment.id}><td className="px-5 py-4">{new Date(payment.payment_date).toLocaleString()}</td><td className="px-5 py-4">{money(payment.amount)}</td><td className="px-5 py-4">{payment.method}</td><td className="px-5 py-4">{payment.reference ?? "—"}</td><td className="px-5 py-4">{payment.recorded_by_name}</td></tr>)}</tbody></table></div>}
                    </section>
                </section>)}
            </div>

            {dialog && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4"><section role="dialog" aria-modal="true" aria-labelledby="record-title" className="my-8 w-full max-w-2xl rounded-2xl border border-gray-700 bg-gray-900">
                <header className="flex items-center justify-between border-b border-gray-800 px-5 py-4"><h2 id="record-title" className="font-semibold">{editingTax || editingDiscount ? "Edit" : "Create"} {view === "taxes" ? "tax" : "discount"}</h2><button aria-label="Close dialog" onClick={() => setDialog(false)} className="text-gray-400"><X className="h-5 w-5" /></button></header>
                {view === "taxes" ? <form onSubmit={(event) => void submitTax(event)} className="space-y-4 p-5">
                    <label className="block"><span className={labelClass}>Tax name</span><input required maxLength={150} value={taxForm.name} onChange={(event) => setTaxForm({ ...taxForm, name: event.target.value })} className={fieldClass} /></label>
                    <label className="block"><span className={labelClass}>Rate (%)</span><input required type="number" min="0" max="100" step="0.01" value={taxForm.rate} onChange={(event) => setTaxForm({ ...taxForm, rate: event.target.value })} className={fieldClass} /></label>
                    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}<DialogButtons saving={saving} close={() => setDialog(false)} />
                </form> : <form onSubmit={(event) => void submitDiscount(event)} className="grid gap-4 p-5 sm:grid-cols-2">
                    <label><span className={labelClass}>Discount name</span><input required maxLength={150} value={discountForm.name} onChange={(event) => setDiscountForm({ ...discountForm, name: event.target.value })} className={fieldClass} /></label>
                    <label><span className={labelClass}>Type</span><select value={discountForm.type} onChange={(event) => setDiscountForm({ ...discountForm, type: event.target.value as Discount["type"] })} className={fieldClass}><option value="PERCENTAGE">Percentage</option><option value="FIXED">Fixed amount</option></select></label>
                    <label><span className={labelClass}>Value {discountForm.type === "PERCENTAGE" ? "(%)" : "(₹)"}</span><input required type="number" min="0.01" max={discountForm.type === "PERCENTAGE" ? 100 : undefined} step="0.01" value={discountForm.value} onChange={(event) => setDiscountForm({ ...discountForm, value: event.target.value })} className={fieldClass} /></label>
                    <label><span className={labelClass}>Applies to</span><select value={discountForm.applies_to} onChange={(event) => setDiscountForm({ ...discountForm, applies_to: event.target.value as Discount["applies_to"] })} className={fieldClass}><option value="SUBSCRIPTION">Subscription</option><option value="PRODUCT">Selected products</option></select></label>
                    <label><span className={labelClass}>Minimum purchase (₹)</span><input type="number" min="0" step="0.01" value={discountForm.min_purchase} onChange={(event) => setDiscountForm({ ...discountForm, min_purchase: event.target.value })} className={fieldClass} /></label>
                    <label><span className={labelClass}>Minimum quantity</span><input required type="number" min="1" step="1" value={discountForm.min_quantity} onChange={(event) => setDiscountForm({ ...discountForm, min_quantity: event.target.value })} className={fieldClass} /></label>
                    <label><span className={labelClass}>Valid from</span><input type="date" value={discountForm.valid_from} onChange={(event) => setDiscountForm({ ...discountForm, valid_from: event.target.value })} className={fieldClass} /></label>
                    <label><span className={labelClass}>Valid to</span><input type="date" value={discountForm.valid_to} onChange={(event) => setDiscountForm({ ...discountForm, valid_to: event.target.value })} className={fieldClass} /></label>
                    <label><span className={labelClass}>Usage limit (optional)</span><input type="number" min="1" step="1" value={discountForm.usage_limit} onChange={(event) => setDiscountForm({ ...discountForm, usage_limit: event.target.value })} className={fieldClass} /></label>
                    {discountForm.applies_to === "PRODUCT" && <fieldset className="sm:col-span-2"><legend className={labelClass}>Target products</legend><div className="grid max-h-36 gap-2 overflow-auto rounded-lg border border-gray-800 p-3 sm:grid-cols-2">{products.map((product) => <label key={product.id} className="flex items-center gap-2 text-sm text-gray-300"><input type="checkbox" checked={discountForm.product_ids.includes(String(product.id))} onChange={(event) => setDiscountForm((current) => ({ ...current, product_ids: event.target.checked ? [...current.product_ids, String(product.id)] : current.product_ids.filter((id) => id !== String(product.id)) }))} className="accent-indigo-500" />{product.name}</label>)}</div></fieldset>}
                    {error && <p role="alert" className="sm:col-span-2 text-sm text-red-300">{error}</p>}<div className="sm:col-span-2"><DialogButtons saving={saving} close={() => setDialog(false)} /></div>
                </form>}
            </section></div>}
        </main>
    );
}

function Loading() {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-indigo-400" /></div>;
}
function Empty({ text }: { text: string }) {
    return <div className="px-6 py-16 text-center text-sm text-gray-400">{text}</div>;
}
function Badge({ status }: { status: string }) {
    const colors: Record<string, string> = {
        ACTIVE: "border-emerald-800 bg-emerald-950 text-emerald-300",
        INACTIVE: "border-gray-700 bg-gray-800 text-gray-400",
        DRAFT: "border-gray-700 bg-gray-800 text-gray-300",
        CONFIRMED: "border-indigo-800 bg-indigo-950 text-indigo-300",
        PAID: "border-emerald-800 bg-emerald-950 text-emerald-300",
        CANCELLED: "border-red-900 bg-red-950 text-red-300",
    };
    return <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${colors[status] ?? colors.DRAFT}`}>{status}</span>;
}
function Pagination({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (page: number) => void }) {
    const cls = "rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 disabled:opacity-40";
    return <footer className="flex items-center justify-between border-t border-gray-800 px-4 py-3 text-sm text-gray-500"><span>{total} total</span><div className="flex items-center gap-2"><button disabled={page <= 1} onClick={() => onPage(page - 1)} className={cls}>Previous</button><span>Page {page} of {pages}</span><button disabled={page >= pages} onClick={() => onPage(page + 1)} className={cls}>Next</button></div></footer>;
}
function DialogButtons({ saving, close }: { saving: boolean; close: () => void }) {
    return <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={close} className={`${buttonClass} bg-gray-800 text-gray-200`}>Cancel</button><button disabled={saving} className={`${buttonClass} bg-indigo-600 text-white`}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}Save</button></div>;
}
