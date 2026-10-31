"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import axios from "axios";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";

type Role = "ADMIN" | "STAFF" | "CUSTOMER";
type View = "list" | "new" | "detail" | "templates";
type Product = { id: number; name: string; sales_price: string; is_active: boolean };
type Plan = { id: number; name: string; product_id: number; product_name: string; price: string; min_quantity: number; billing_cycle: string; status: string };
type Customer = { id: number; name: string; email: string };
type Line = { product_id: string; variant_id: string; quantity: string; unit_price: string; tax_rate: string };
type SubscriptionItem = { id: number; product_id: number; product_name: string; variant_id: number | null; variant_name: string | null; quantity: number; unit_price: string; tax_rate: string; amount: string };
type Subscription = {
    id: number; subscription_number: string; customer_id: number; customer_name: string; customer_email: string;
    plan_id: number; plan_name: string; plan_price: string; billing_cycle: string; min_quantity: number;
    start_date: string; expiry_date: string | null; next_billing_date: string | null; payment_terms: string | null;
    status: "DRAFT" | "QUOTATION" | "CONFIRMED" | "ACTIVE" | "CLOSED"; quotation_valid_until: string | null;
    allow_early_close: boolean; items: SubscriptionItem[];
};
type Template = { id: number; name: string; plan_id: number; plan_name: string; product_name: string; validity_days: number; items?: Line[] };
type Variant = { id: number; variant_name: string; extra_price: string };
type SubscriptionDiscount = { id: number; name: string; type: "FIXED" | "PERCENTAGE"; value: string; applies_to: string };

const fieldClass = "w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 outline-none focus:border-indigo-500";
const buttonClass = "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-50";
const money = (value: string | number) => `₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const requestError = (error: unknown) => axios.isAxiosError(error) ? error.response?.data?.message || "Request failed" : "Something went wrong";
const today = () => new Date().toISOString().slice(0, 10);
const emptyLine = (productId = ""): Line => ({ product_id: productId, variant_id: "", quantity: "1", unit_price: "", tax_rate: "0" });

export default function SubscriptionWorkspace({
    role,
    view,
    recordId,
    templateId = "",
}: {
    role: Role;
    view: View;
    recordId?: string;
    templateId?: string;
}) {
    const { user, loading } = useAuth();
    const router = useRouter();
    const base = `/${role.toLowerCase()}`;
    const isCustomer = role === "CUSTOMER";
    const canManage = !isCustomer;
    const [busy, setBusy] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [templates, setTemplates] = useState<Template[]>([]);
    const [detail, setDetail] = useState<Subscription | null>(null);
    const [subscriptionDiscounts, setSubscriptionDiscounts] = useState<SubscriptionDiscount[]>([]);
    const [availableDiscounts, setAvailableDiscounts] = useState<SubscriptionDiscount[]>([]);
    const [discountId, setDiscountId] = useState("");
    const [plans, setPlans] = useState<Plan[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [variantsByProduct, setVariantsByProduct] = useState<Record<string, Variant[]>>({});
    const [searchInput, setSearchInput] = useState("");
    const [search, setSearch] = useState("");
    const [status, setStatus] = useState("");
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [customerId, setCustomerId] = useState("");
    const [planId, setPlanId] = useState("");
    const [startDate, setStartDate] = useState("");
    const [expiryDate, setExpiryDate] = useState("");
    const [paymentTerms, setPaymentTerms] = useState("");
    const [lines, setLines] = useState<Line[]>([emptyLine()]);
    const [templateForm, setTemplateForm] = useState({ id: 0, name: "", plan_id: "", validity_days: "30" });
    const [templateLines, setTemplateLines] = useState<Line[]>([emptyLine()]);
    const [templateDialog, setTemplateDialog] = useState(false);
    const [templateForSubscription, setTemplateForSubscription] = useState("");

    useEffect(() => {
        if (loading) return;
        if (!user) { router.replace("/login"); return; }
        if (user.role !== role) router.replace("/unauthorized");
    }, [loading, user, role, router]);

    const fetchCatalogs = useCallback(async () => {
        const [planResponse, productResponse] = await Promise.all([
            api.get("/plans", { params: { status: "ACTIVE", limit: 100 } }),
            api.get("/products", { params: { is_active: "true", limit: 100 } }),
        ]);
        setPlans(planResponse.data.plans);
        setProducts(productResponse.data.products);
    }, []);

    const fetchList = useCallback(async () => {
        setBusy(true);
        setError("");
        try {
            const response = await api.get(isCustomer ? "/subscriptions/my" : "/subscriptions", {
                params: { page, limit: 10, ...(search ? { search } : {}), ...(status ? { status } : {}) },
            });
            setSubscriptions(response.data.subscriptions);
            setTotal(response.data.pagination.total);
        } catch (requestErrorValue) {
            setError(requestError(requestErrorValue));
        } finally {
            setBusy(false);
        }
    }, [isCustomer, page, search, status]);

    const fetchTemplates = useCallback(async () => {
        setBusy(true);
        setError("");
        try {
            const response = await api.get("/quotation-templates", { params: { page, limit: 10, ...(search ? { search } : {}) } });
            setTemplates(response.data.templates);
            setTotal(response.data.pagination.total);
        } catch (requestErrorValue) {
            setError(requestError(requestErrorValue));
        } finally {
            setBusy(false);
        }
    }, [page, search]);

    const fetchDetail = useCallback(async () => {
        if (!recordId) return;
        setBusy(true);
        setError("");
        try {
            const response = await api.get(`/subscriptions/${recordId}`);
            setDetail(response.data.subscription);
        } catch (requestErrorValue) {
            setError(requestError(requestErrorValue));
            setDetail(null);
        } finally {
            setBusy(false);
        }
    }, [recordId]);

    useEffect(() => {
        if (loading || user?.role !== role) return;
        if (view === "list") void Promise.resolve().then(fetchList);
        if (view === "templates") void Promise.resolve().then(fetchTemplates);
        if (view === "detail") void Promise.resolve().then(fetchDetail);
    }, [loading, user, role, view, fetchList, fetchTemplates, fetchDetail]);

    useEffect(() => {
        if (view !== "new" || loading || user?.role !== role) return;
        void Promise.resolve().then(async () => {
            setBusy(true);
            setError("");
            try {
                const requests: Promise<unknown>[] = [fetchCatalogs()];
                if (canManage) requests.push(api.get("/subscriptions/customers").then((response) => setCustomers(response.data.customers)));
                if (isCustomer) setCustomerId(String(user.id));
                setStartDate(today());
                await Promise.all(requests);
                if (templateId) {
                    const response = await api.get(`/quotation-templates/${templateId}`);
                    const template = response.data.template;
                    setTemplateForSubscription(String(template.id));
                    setPlanId(String(template.plan_id));
                    setLines(template.items.length
                        ? template.items.map((item: { product_id: number; variant_id: number | null; quantity: number; unit_price: string }) => ({
                            product_id: String(item.product_id), variant_id: item.variant_id ? String(item.variant_id) : "",
                            quantity: String(item.quantity), unit_price: String(item.unit_price), tax_rate: "0",
                        }))
                        : [{ ...emptyLine(String(template.plan_product_id)), quantity: String(template.min_quantity) }]);
                    const variantResults = await Promise.all(template.items.map(async (item: { product_id: number }) => {
                        const variantsResponse = await api.get(`/products/${item.product_id}/variants`);
                        return [String(item.product_id), variantsResponse.data.variants] as const;
                    }));
                    setVariantsByProduct((current) => ({ ...current, ...Object.fromEntries(variantResults) }));
                }
            } catch (requestErrorValue) {
                setError(requestError(requestErrorValue));
            } finally {
                setBusy(false);
            }
        });
    }, [view, loading, user, role, fetchCatalogs, canManage, isCustomer, templateId]);

    useEffect(() => {
        if (view !== "templates" || loading || user?.role !== role) return;
        void Promise.resolve().then(fetchCatalogs).catch((requestErrorValue) => setError(requestError(requestErrorValue)));
    }, [view, loading, user, role, fetchCatalogs]);

    useEffect(() => {
        if (view !== "detail" || !canManage || !detail) return;
        void Promise.resolve().then(async () => {
            try {
                const [applied, available] = await Promise.all([
                    api.get(`/subscriptions/${detail.id}/discounts`),
                    api.get("/discounts", { params: { is_active: "true", limit: 100 } }),
                ]);
                setSubscriptionDiscounts(applied.data.discounts);
                setAvailableDiscounts(available.data.discounts);
            } catch (requestErrorValue) {
                setError(requestError(requestErrorValue));
            }
        });
    }, [view, canManage, detail]);

    const selectedPlan = plans.find((plan) => String(plan.id) === planId);
    const lineTotals = useMemo(() => lines.reduce((sum, line) => {
        const product = products.find((entry) => String(entry.id) === line.product_id);
        const variant = variantsByProduct[line.product_id]?.find((entry) => String(entry.id) === line.variant_id);
        const unit = line.unit_price === "" ? Number(product?.sales_price ?? 0) + Number(variant?.extra_price ?? 0) : Number(line.unit_price);
        return sum + Number(line.quantity || 0) * unit;
    }, 0), [lines, products, variantsByProduct]);

    const fetchVariants = async (productId: string) => {
        if (!productId || variantsByProduct[productId]) return;
        try {
            const response = await api.get(`/products/${productId}/variants`);
            setVariantsByProduct((current) => ({ ...current, [productId]: response.data.variants }));
        } catch (requestErrorValue) {
            setError(requestError(requestErrorValue));
        }
    };

    const selectPlan = (id: string, isTemplate = false) => {
        if (isTemplate) {
            setTemplateForm((current) => ({ ...current, plan_id: id }));
            const plan = plans.find((item) => String(item.id) === id);
            if (plan) {
                setTemplateLines((current) => {
                    if (current.some((line) => line.product_id === String(plan.product_id))) return current;
                    const occupied = current.filter((line) => line.product_id);
                    return [...occupied, { ...emptyLine(String(plan.product_id)), quantity: String(plan.min_quantity) }];
                });
                void fetchVariants(String(plan.product_id));
            }
        }
        else {
            setPlanId(id);
            const plan = plans.find((item) => String(item.id) === id);
            if (plan) setLines([{ ...emptyLine(String(plan.product_id)), quantity: String(plan.min_quantity) }]);
        }
    };

    const updateLine = (index: number, patch: Partial<Line>, template = false) => {
        const set = template ? setTemplateLines : setLines;
        set((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
    };

    const submitSubscription = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (expiryDate && expiryDate < startDate) { setError("Expiry date cannot be before start date"); return; }
        setSaving(true);
        setError("");
        try {
            const payload = {
                customer_id: Number(customerId), plan_id: Number(planId), start_date: startDate,
                expiry_date: expiryDate || null, payment_terms: paymentTerms.trim() || null,
                items: lines.map((line) => ({
                    product_id: Number(line.product_id),
                    ...(line.variant_id ? { variant_id: Number(line.variant_id) } : {}),
                    quantity: Number(line.quantity),
                    ...(line.unit_price === "" ? {} : { unit_price: Number(line.unit_price) }),
                    tax_rate: Number(line.tax_rate),
                })),
            };
            const response = templateForSubscription
                ? await api.post(`/subscriptions/from-template/${templateForSubscription}`, {
                    customer_id: Number(customerId), start_date: startDate,
                    expiry_date: expiryDate || null, payment_terms: paymentTerms.trim() || null,
                    items: lines.map((line) => ({
                        product_id: Number(line.product_id),
                        ...(line.variant_id ? { variant_id: Number(line.variant_id) } : {}),
                        quantity: Number(line.quantity),
                        ...(line.unit_price === "" ? {} : { unit_price: Number(line.unit_price) }),
                    })),
                })
                : await api.post("/subscriptions", payload);
            router.push(`${base}/subscriptions/${response.data.subscription.id}`);
        } catch (requestErrorValue) {
            setError(requestError(requestErrorValue));
        } finally {
            setSaving(false);
        }
    };

    const transition = async (nextStatus: Subscription["status"]) => {
        if (!detail) return;
        if (nextStatus === "CLOSED" && !window.confirm(`Close ${detail.subscription_number}?`)) return;
        setSaving(true);
        setError("");
        try {
            const response = await api.patch(`/subscriptions/${detail.id}/status`, { status: nextStatus });
            setDetail(response.data.subscription);
            setNotice(`Subscription updated to ${nextStatus}`);
        } catch (requestErrorValue) {
            setError(requestError(requestErrorValue));
        } finally {
            setSaving(false);
        }
    };

    const applyDiscount = async () => {
        if (!detail || !discountId) return;
        setSaving(true);
        setError("");
        try {
            await api.post(`/subscriptions/${detail.id}/discounts`, { discount_id: Number(discountId) });
            const response = await api.get(`/subscriptions/${detail.id}/discounts`);
            setSubscriptionDiscounts(response.data.discounts);
            setDiscountId("");
            setNotice("Discount applied to subscription");
        } catch (requestErrorValue) {
            setError(requestError(requestErrorValue));
        } finally {
            setSaving(false);
        }
    };

    const removeDiscount = async (discount: SubscriptionDiscount) => {
        if (!detail) return;
        try {
            await api.delete(`/subscriptions/${detail.id}/discounts/${discount.id}`);
            setSubscriptionDiscounts((current) => current.filter((item) => item.id !== discount.id));
            setNotice("Discount removed");
        } catch (requestErrorValue) {
            setError(requestError(requestErrorValue));
        }
    };

    const generateInvoice = async () => {
        if (!detail) return;
        setSaving(true);
        setError("");
        try {
            const response = await api.post(`/invoices/generate/${detail.id}`, {});
            router.push(`${base}/invoices/${response.data.invoice.id}`);
        } catch (requestErrorValue) {
            setError(requestError(requestErrorValue));
        } finally {
            setSaving(false);
        }
    };

    const openTemplate = async (template?: Template) => {
        setError("");
        if (!template) {
            setTemplateForm({ id: 0, name: "", plan_id: "", validity_days: "30" });
            setTemplateLines([emptyLine()]);
            setTemplateDialog(true);
            return;
        }
        try {
            const response = await api.get(`/quotation-templates/${template.id}`);
            const data = response.data.template;
            setTemplateForm({ id: data.id, name: data.name, plan_id: String(data.plan_id), validity_days: String(data.validity_days) });
            setTemplateLines(data.items.length ? data.items.map((item: { product_id: number; variant_id: number | null; quantity: number; unit_price: string }) => ({
                product_id: String(item.product_id), variant_id: item.variant_id ? String(item.variant_id) : "",
                quantity: String(item.quantity), unit_price: String(item.unit_price), tax_rate: "0",
            })) : [emptyLine()]);
            setTemplateDialog(true);
        } catch (requestErrorValue) {
            setError(requestError(requestErrorValue));
        }
    };

    const saveTemplate = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setSaving(true);
        setError("");
        try {
            const payload = {
                name: templateForm.name.trim(), plan_id: Number(templateForm.plan_id),
                validity_days: Number(templateForm.validity_days),
                items: templateLines.map((line) => ({
                    product_id: Number(line.product_id),
                    ...(line.variant_id ? { variant_id: Number(line.variant_id) } : {}),
                    quantity: Number(line.quantity),
                    ...(line.unit_price === "" ? {} : { unit_price: Number(line.unit_price) }),
                })),
            };
            if (templateForm.id) await api.patch(`/quotation-templates/${templateForm.id}`, payload);
            else await api.post("/quotation-templates", payload);
            setTemplateDialog(false);
            setNotice("Quotation template saved");
            await fetchTemplates();
        } catch (requestErrorValue) {
            setError(requestError(requestErrorValue));
        } finally {
            setSaving(false);
        }
    };

    const deleteTemplate = async (template: Template) => {
        if (!window.confirm(`Delete "${template.name}"?`)) return;
        try {
            await api.delete(`/quotation-templates/${template.id}`);
            setNotice("Quotation template deleted");
            await fetchTemplates();
        } catch (requestErrorValue) {
            setError(requestError(requestErrorValue));
        }
    };

    const pageTitle = view === "templates" ? "Quotation templates"
        : view === "new" ? "New subscription"
            : view === "detail" ? detail?.subscription_number ?? "Subscription details" : "Subscriptions";

    if (loading || !user || user.role !== role) {
        return <div className="flex min-h-screen items-center justify-center bg-gray-950"><Loader2 className="h-7 w-7 animate-spin text-indigo-400" /></div>;
    }

    const labelClass = "mb-1.5 block text-xs font-medium text-gray-400";
    const totalPages = Math.max(1, Math.ceil(total / 10));

    return (
        <main className="min-h-screen bg-gray-950 px-4 py-6 text-gray-100 sm:px-6 lg:px-10">
            <div className="mx-auto max-w-7xl">
                <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <Link href={base} className="mb-2 inline-flex items-center gap-1 text-sm text-indigo-300 hover:text-indigo-200"><ArrowLeft className="h-4 w-4" />Dashboard</Link>
                        <h1 className="text-2xl font-bold">{pageTitle}</h1>
                    </div>
                    {view === "list" && canManage && (
                        <div className="flex gap-2">
                            <Link href={`${base}/quotation-templates`} className={`${buttonClass} border border-gray-700 bg-gray-900 text-gray-200 hover:bg-gray-800`}>Quotation templates</Link>
                            <Link href={`${base}/subscriptions/new`} className={`${buttonClass} bg-indigo-600 text-white hover:bg-indigo-500`}><Plus className="h-4 w-4" />New subscription</Link>
                        </div>
                    )}
                    {view === "templates" && canManage && <button onClick={() => void openTemplate()} className={`${buttonClass} bg-indigo-600 text-white hover:bg-indigo-500`}><Plus className="h-4 w-4" />New template</button>}
                </header>

                {notice && <p role="status" className="mb-4 rounded-lg border border-emerald-900 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-300">{notice}</p>}
                {error && <p role="alert" className="mb-4 rounded-lg border border-red-900 bg-red-950/30 px-4 py-3 text-sm text-red-300">{error}</p>}

                {view === "list" && <>
                    <section className="mb-4 flex flex-col gap-3 rounded-xl border border-gray-800 bg-gray-900/60 p-4 sm:flex-row">
                        <form onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(searchInput.trim()); }} className="flex flex-1 gap-2">
                            <div className="relative flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" /><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search number, customer, or plan" className={`${fieldClass} pl-9`} /></div>
                            <button className={`${buttonClass} bg-gray-800 text-gray-200 hover:bg-gray-700`}>Search</button>
                        </form>
                        <select aria-label="Filter by status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className={`${fieldClass} sm:w-48`}>
                            <option value="">All statuses</option>{["DRAFT", "QUOTATION", "CONFIRMED", "ACTIVE", "CLOSED"].map((item) => <option key={item}>{item}</option>)}
                        </select>
                    </section>
                    <section className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900/60">
                        {busy ? <Loading /> : subscriptions.length === 0 ? <Empty label="No subscriptions found" /> : <div className="overflow-x-auto">
                            <table className="w-full min-w-[700px] text-left text-sm">
                                <thead className="bg-gray-900 text-xs uppercase text-gray-500"><tr><th className="px-4 py-3">Number</th>{!isCustomer && <th className="px-4 py-3">Customer</th>}<th className="px-4 py-3">Plan</th><th className="px-4 py-3">Start date</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Next billing</th></tr></thead>
                                <tbody className="divide-y divide-gray-800">{subscriptions.map((subscription) => <tr key={subscription.id} className="hover:bg-gray-800/30">
                                    <td className="px-4 py-4"><Link className="font-medium text-indigo-300 hover:text-indigo-200" href={`${base}/subscriptions/${subscription.id}`}>{subscription.subscription_number}</Link></td>
                                    {!isCustomer && <td className="px-4 py-4 text-gray-300">{subscription.customer_name}<p className="text-xs text-gray-500">{subscription.customer_email}</p></td>}
                                    <td className="px-4 py-4 text-gray-300">{subscription.plan_name}</td><td className="px-4 py-4 text-gray-400">{String(subscription.start_date).slice(0, 10)}</td><td className="px-4 py-4"><Badge status={subscription.status} /></td><td className="px-4 py-4 text-gray-400">{subscription.next_billing_date?.slice(0, 10) ?? "—"}</td>
                                </tr>)}</tbody>
                            </table>
                        </div>}
                        <Pagination page={page} pages={totalPages} total={total} onPage={setPage} />
                    </section>
                </>}

                {view === "templates" && <>
                    <section className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900/60">
                        {busy ? <Loading /> : templates.length === 0 ? <Empty label="No quotation templates yet" /> : <div className="overflow-x-auto">
                            <table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-gray-900 text-xs uppercase text-gray-500"><tr><th className="px-4 py-3">Template</th><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Product</th><th className="px-4 py-3">Validity</th>{canManage && <th className="px-4 py-3 text-right">Actions</th>}</tr></thead>
                                <tbody className="divide-y divide-gray-800">{templates.map((template) => <tr key={template.id}><td className="px-4 py-4 font-medium">{template.name}</td><td className="px-4 py-4 text-gray-300">{template.plan_name}</td><td className="px-4 py-4 text-gray-300">{template.product_name}</td><td className="px-4 py-4 text-gray-400">{template.validity_days} days</td>{canManage && <td className="px-4 py-4"><div className="flex justify-end gap-2"><button onClick={() => void openTemplate(template)} aria-label={`Edit ${template.name}`} className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-white"><Pencil className="h-4 w-4" /></button>{role === "ADMIN" && <button onClick={() => void deleteTemplate(template)} aria-label={`Delete ${template.name}`} className="rounded-lg p-2 text-gray-400 hover:bg-red-950 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>}</div></td>}</tr>)}</tbody>
                            </table>
                        </div>}
                        <Pagination page={page} pages={totalPages} total={total} onPage={setPage} />
                    </section>
                    {canManage && <section className="mt-4 rounded-xl border border-gray-800 bg-gray-900/50 p-4">
                        <h2 className="mb-3 font-semibold">Create from a template</h2>
                        <div className="flex flex-col gap-2 sm:flex-row"><select value={templateForSubscription} onChange={(event) => setTemplateForSubscription(event.target.value)} className={fieldClass}><option value="">Choose a template</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select><Link href={`${base}/subscriptions/new${templateForSubscription ? `?template=${templateForSubscription}` : ""}`} className={`${buttonClass} bg-indigo-600 text-white hover:bg-indigo-500`}>Start subscription</Link></div>
                    </section>}
                </>}

                {view === "new" && <section className="rounded-xl border border-gray-800 bg-gray-900/60 p-5">
                    {busy ? <Loading /> : <form onSubmit={(event) => void submitSubscription(event)} className="grid gap-4 sm:grid-cols-2">
                        {canManage && <label><span className={labelClass}>Customer</span><select required value={customerId} onChange={(event) => setCustomerId(event.target.value)} className={fieldClass}><option value="">Choose customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} · {customer.email}</option>)}</select></label>}
                        <label><span className={labelClass}>Plan</span><select required value={planId} onChange={(event) => selectPlan(event.target.value)} className={fieldClass}><option value="">Choose plan</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {plan.billing_cycle.toLowerCase()}</option>)}</select></label>
                        <label><span className={labelClass}>Start date</span><input required type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className={fieldClass} /></label>
                        <label><span className={labelClass}>Expiry date (optional)</span><input type="date" min={startDate} value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} className={fieldClass} /></label>
                        <label className="sm:col-span-2"><span className={labelClass}>Payment terms</span><textarea rows={2} value={paymentTerms} onChange={(event) => setPaymentTerms(event.target.value)} className={fieldClass} /></label>
                        <div className="sm:col-span-2">
                            <div className="mb-3 flex items-center justify-between"><div><h2 className="font-semibold">Product lines</h2><p className="mt-1 text-xs text-gray-500">The plan product must meet the minimum quantity. Leave unit price blank to use product and variant pricing.</p></div><button type="button" onClick={() => setLines((current) => [...current, emptyLine()])} className={`${buttonClass} bg-gray-800 text-gray-200 hover:bg-gray-700`}><Plus className="h-4 w-4" />Add line</button></div>
                            <div className="space-y-3">{lines.map((line, index) => {
                                const variant = variantsByProduct[line.product_id] ?? [];
                                const product = products.find((entry) => String(entry.id) === line.product_id);
                                const selectedVariant = variant.find((entry) => String(entry.id) === line.variant_id);
                                const unit = line.unit_price === "" ? Number(product?.sales_price ?? 0) + Number(selectedVariant?.extra_price ?? 0) : Number(line.unit_price);
                                return <div key={index} className="grid gap-2 rounded-lg border border-gray-800 p-3 sm:grid-cols-[2fr_1.5fr_85px_120px_85px_auto]">
                                    <select required aria-label="Product" value={line.product_id} onChange={(event) => { updateLine(index, { product_id: event.target.value, variant_id: "" }); void fetchVariants(event.target.value); }} className={fieldClass}><option value="">Choose product</option>{products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
                                    <select aria-label="Variant" value={line.variant_id} onChange={(event) => updateLine(index, { variant_id: event.target.value })} className={fieldClass}><option value="">No variant</option>{variant.map((item) => <option key={item.id} value={item.id}>{item.variant_name} (+{money(item.extra_price)})</option>)}</select>
                                    <input required aria-label="Quantity" type="number" min="1" step="1" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} className={fieldClass} />
                                    <input aria-label="Unit price" type="number" min="0" step="0.01" placeholder={money(unit)} value={line.unit_price} onChange={(event) => updateLine(index, { unit_price: event.target.value })} className={fieldClass} />
                                    <input aria-label="Tax rate percentage" type="number" min="0" max="100" step="0.01" value={line.tax_rate} onChange={(event) => updateLine(index, { tax_rate: event.target.value })} className={fieldClass} />
                                    <button type="button" disabled={lines.length === 1} aria-label="Remove line" onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))} className="rounded-lg px-3 text-gray-400 hover:bg-red-950 hover:text-red-300 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
                                </div>;
                            })}</div>
                            <p className="mt-3 text-right text-sm text-gray-300">Estimated product total: <strong>{money(lineTotals)}</strong>{selectedPlan && <span className="ml-2 text-gray-500">Plan {money(selectedPlan.price)} / {selectedPlan.billing_cycle.toLowerCase()}</span>}</p>
                        </div>
                        <div className="flex justify-end gap-2 sm:col-span-2"><Link href={`${base}/subscriptions`} className={`${buttonClass} bg-gray-800 text-gray-200 hover:bg-gray-700`}>Cancel</Link><button disabled={saving || !planId || !customerId} className={`${buttonClass} bg-indigo-600 text-white hover:bg-indigo-500`}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}Create draft</button></div>
                    </form>}
                </section>}

                {view === "detail" && (busy ? <Loading /> : !detail ? <Empty label="Subscription not found" /> : <section className="space-y-4">
                    <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-5">
                        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">{detail.subscription_number}</h2><p className="mt-1 text-sm text-gray-400">{detail.plan_name} · {detail.customer_name} ({detail.customer_email})</p></div><Badge status={detail.status} /></div>
                        <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[
                            ["Start date", detail.start_date?.slice(0, 10)], ["Expiry date", detail.expiry_date?.slice(0, 10) ?? "—"],
                            ["Next billing", detail.next_billing_date?.slice(0, 10) ?? "Not activated"], ["Quotation valid until", detail.quotation_valid_until?.slice(0, 10) ?? "—"],
                        ].map(([label, value]) => <div key={label}><dt className="text-xs text-gray-500">{label}</dt><dd className="mt-1 text-sm text-gray-200">{value}</dd></div>)}</dl>
                        {detail.payment_terms && <p className="mt-4 text-sm text-gray-400">Payment terms: {detail.payment_terms}</p>}
                        {canManage && <div className="mt-5 flex flex-wrap gap-2">
                            {detail.status === "DRAFT" && <button disabled={saving} onClick={() => void transition("QUOTATION")} className={`${buttonClass} bg-indigo-600 text-white hover:bg-indigo-500`}>Send quotation</button>}
                            {detail.status === "QUOTATION" && <button disabled={saving} onClick={() => void transition("CONFIRMED")} className={`${buttonClass} bg-indigo-600 text-white hover:bg-indigo-500`}>Confirm quotation</button>}
                            {detail.status === "CONFIRMED" && <button disabled={saving} onClick={() => void transition("ACTIVE")} className={`${buttonClass} bg-emerald-700 text-white hover:bg-emerald-600`}>Activate</button>}
                            {detail.status === "ACTIVE" && (detail.allow_early_close || (detail.expiry_date && detail.expiry_date.slice(0, 10) <= today())) && <button disabled={saving} onClick={() => void transition("CLOSED")} className={`${buttonClass} bg-red-900 text-red-100 hover:bg-red-800`}>Close subscription</button>}
                            {detail.status === "ACTIVE" && <button disabled={saving} onClick={() => void generateInvoice()} className={`${buttonClass} bg-indigo-600 text-white hover:bg-indigo-500`}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}Generate invoice</button>}
                        </div>}
                    </div>
                    {canManage && detail.status !== "CLOSED" && <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-5">
                        <h2 className="font-semibold">Subscription discounts</h2>
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                            <select aria-label="Discount to apply" value={discountId} onChange={(event) => setDiscountId(event.target.value)} className={fieldClass}>
                                <option value="">Choose eligible discount</option>
                                {availableDiscounts.filter((discount) => !subscriptionDiscounts.some((applied) => applied.id === discount.id)).map((discount) => <option key={discount.id} value={discount.id}>{discount.name} · {discount.type === "PERCENTAGE" ? `${discount.value}%` : money(discount.value)}</option>)}
                            </select>
                            <button disabled={!discountId || saving} onClick={() => void applyDiscount()} className={`${buttonClass} bg-indigo-600 text-white`}>Apply discount</button>
                        </div>
                        {subscriptionDiscounts.length > 0 && <ul className="mt-3 divide-y divide-gray-800">{subscriptionDiscounts.map((discount) => <li key={discount.id} className="flex items-center gap-3 py-2 text-sm"><span className="flex-1">{discount.name} · {discount.type === "PERCENTAGE" ? `${discount.value}%` : money(discount.value)}</span><button onClick={() => void removeDiscount(discount)} className="text-red-300 hover:text-red-200">Remove</button></li>)}</ul>}
                    </div>}
                    <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900/60">
                        <div className="border-b border-gray-800 px-5 py-4"><h2 className="font-semibold">Product lines</h2></div>
                        <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-gray-900 text-xs uppercase text-gray-500"><tr><th className="px-5 py-3">Product</th><th className="px-5 py-3">Quantity</th><th className="px-5 py-3">Unit price</th><th className="px-5 py-3">Tax</th><th className="px-5 py-3 text-right">Amount</th></tr></thead><tbody className="divide-y divide-gray-800">{detail.items.map((item) => <tr key={item.id}><td className="px-5 py-4 text-gray-200">{item.product_name}{item.variant_name && <span className="text-gray-500"> · {item.variant_name}</span>}</td><td className="px-5 py-4 text-gray-300">{item.quantity}</td><td className="px-5 py-4 text-gray-300">{money(item.unit_price)}</td><td className="px-5 py-4 text-gray-400">{item.tax_rate}%</td><td className="px-5 py-4 text-right text-gray-200">{money(item.amount)}</td></tr>)}</tbody></table></div>
                        <div className="space-y-1 border-t border-gray-800 px-5 py-4 text-right text-sm"><p className="text-gray-400">Subtotal: {money(detail.items.reduce((sum, item) => sum + Number(item.amount), 0))}</p><p className="text-gray-400">Tax: {money(detail.items.reduce((sum, item) => sum + Number(item.amount) * Number(item.tax_rate) / 100, 0))}</p><p className="font-semibold text-white">Total: {money(detail.items.reduce((sum, item) => sum + Number(item.amount) * (1 + Number(item.tax_rate) / 100), 0))}</p></div>
                    </div>
                </section>)}
            </div>

            {templateDialog && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4"><section role="dialog" aria-modal="true" aria-labelledby="template-title" className="my-8 w-full max-w-3xl rounded-2xl border border-gray-700 bg-gray-900">
                <header className="border-b border-gray-800 px-5 py-4"><h2 id="template-title" className="font-semibold">{templateForm.id ? "Edit" : "Create"} quotation template</h2></header>
                <form onSubmit={(event) => void saveTemplate(event)} className="space-y-4 p-5">
                    <div className="grid gap-4 sm:grid-cols-3">
                        <label className="sm:col-span-1"><span className={labelClass}>Name</span><input required maxLength={150} value={templateForm.name} onChange={(event) => setTemplateForm((current) => ({ ...current, name: event.target.value }))} className={fieldClass} /></label>
                        <label><span className={labelClass}>Plan</span><select required value={templateForm.plan_id} onChange={(event) => selectPlan(event.target.value, true)} className={fieldClass}><option value="">Choose plan</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>
                        <label><span className={labelClass}>Validity days</span><input required type="number" min="1" max="3650" value={templateForm.validity_days} onChange={(event) => setTemplateForm((current) => ({ ...current, validity_days: event.target.value }))} className={fieldClass} /></label>
                    </div>
                    <div className="flex items-center justify-between"><h3 className="font-medium">Quotation items</h3><button type="button" onClick={() => setTemplateLines((current) => [...current, emptyLine()])} className={`${buttonClass} bg-gray-800 text-gray-200`}><Plus className="h-4 w-4" />Add item</button></div>
                    <div className="space-y-2">{templateLines.map((line, index) => <div key={index} className="grid gap-2 sm:grid-cols-[2fr_100px_130px_auto]">
                        <select required aria-label="Template product" value={line.product_id} onChange={(event) => { updateLine(index, { product_id: event.target.value }, true); void fetchVariants(event.target.value); }} className={fieldClass}><option value="">Choose product</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select>
                        <input required aria-label="Template quantity" type="number" min="1" step="1" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value }, true)} className={fieldClass} />
                        <input aria-label="Template unit price" type="number" min="0" step="0.01" placeholder="Auto price" value={line.unit_price} onChange={(event) => updateLine(index, { unit_price: event.target.value }, true)} className={fieldClass} />
                        <button type="button" disabled={templateLines.length === 1} onClick={() => setTemplateLines((current) => current.filter((_, lineIndex) => lineIndex !== index))} aria-label="Remove item" className="rounded-lg px-3 text-gray-400 hover:bg-red-950 hover:text-red-300 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
                    </div>)}</div>
                    <div className="flex justify-end gap-2"><button type="button" onClick={() => setTemplateDialog(false)} className={`${buttonClass} bg-gray-800 text-gray-200`}>Cancel</button><button disabled={saving} className={`${buttonClass} bg-indigo-600 text-white hover:bg-indigo-500`}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}Save template</button></div>
                </form>
            </section></div>}
        </main>
    );
}

function Loading() {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-indigo-400" /></div>;
}

function Empty({ label }: { label: string }) {
    return <div className="px-6 py-16 text-center text-sm text-gray-400">{label}</div>;
}

function Badge({ status }: { status: string }) {
    const color: Record<string, string> = {
        DRAFT: "border-gray-700 bg-gray-800 text-gray-300",
        QUOTATION: "border-indigo-800 bg-indigo-950 text-indigo-300",
        CONFIRMED: "border-blue-800 bg-blue-950 text-blue-300",
        ACTIVE: "border-emerald-800 bg-emerald-950 text-emerald-300",
        CLOSED: "border-red-900 bg-red-950 text-red-300",
    };
    return <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${color[status] ?? color.DRAFT}`}>{status}</span>;
}

function Pagination({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (page: number) => void }) {
    const cls = "rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 disabled:opacity-40";
    return <footer className="flex items-center justify-between border-t border-gray-800 px-4 py-3 text-sm text-gray-500"><span>{total} total</span><div className="flex items-center gap-2"><button disabled={page <= 1} onClick={() => onPage(page - 1)} className={cls}>Previous</button><span>Page {page} of {pages}</span><button disabled={page >= pages} onClick={() => onPage(page + 1)} className={cls}>Next</button></div></footer>;
}
