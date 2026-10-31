"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import axios from "axios";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";

type CatalogKind = "products" | "plans";
type Product = {
    id: number;
    name: string;
    type: "SERVICE" | "SOFTWARE" | "OTHER";
    sales_price: string;
    cost_price: string;
    notes: string | null;
    is_active: boolean;
};
type Plan = {
    id: number;
    name: string;
    product_id: number;
    product_name: string;
    product_is_active: boolean;
    price: string;
    billing_cycle: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
    min_quantity: number;
    start_date: string | null;
    end_date: string | null;
    auto_close: boolean;
    allow_pause: boolean;
    allow_early_close: boolean;
    allow_renewal: boolean;
    status: "ACTIVE" | "PAUSED" | "CLOSED";
};
type Variant = { id: number; variant_name: string; extra_price: string; price: string };
type ProductForm = {
    name: string; type: Product["type"]; sales_price: string; cost_price: string; notes: string;
};
type PlanForm = {
    name: string; product_id: string; price: string; billing_cycle: Plan["billing_cycle"];
    min_quantity: string; start_date: string; end_date: string; auto_close: boolean;
    allow_pause: boolean; allow_early_close: boolean; allow_renewal: boolean;
};

const fieldClass = "w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 outline-none focus:border-indigo-500";
const buttonClass = "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-50";
const money = (value: string | number) => `₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const getError = (error: unknown) => axios.isAxiosError(error)
    ? error.response?.data?.message || "The request failed"
    : "Something went wrong";

export default function CatalogManager({
    kind,
    requiredRole,
}: {
    kind: CatalogKind;
    requiredRole: "ADMIN" | "STAFF" | "CUSTOMER";
}) {
    const { user, loading } = useAuth();
    const router = useRouter();
    const isAdmin = requiredRole === "ADMIN";
    const title = kind === "products" ? "Products" : "Plans";
    const endpoint = `/${kind}`;
    const [rows, setRows] = useState<(Product | Plan)[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [variants, setVariants] = useState<Variant[]>([]);
    const [loadingRows, setLoadingRows] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [queryInput, setQueryInput] = useState("");
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<Product | Plan | null>(null);
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [variantName, setVariantName] = useState("");
    const [variantPrice, setVariantPrice] = useState("0");
    const [productForm, setProductForm] = useState<ProductForm>({
        name: "", type: "SERVICE", sales_price: "", cost_price: "", notes: "",
    });
    const [planForm, setPlanForm] = useState<PlanForm>({
        name: "", product_id: "", price: "", billing_cycle: "MONTHLY", min_quantity: "1",
        start_date: "", end_date: "", auto_close: false, allow_pause: true,
        allow_early_close: true, allow_renewal: true,
    });

    useEffect(() => {
        if (loading) return;
        if (!user) { router.replace("/login"); return; }
        if (user.role !== requiredRole) router.replace("/unauthorized");
    }, [loading, user, requiredRole, router]);

    const fetchRows = useCallback(async () => {
        setLoadingRows(true);
        setError("");
        try {
            const params: Record<string, string | number> = { page, limit: 10 };
            if (search) params.search = search;
            if (statusFilter) {
                if (kind === "plans") params.status = statusFilter;
                else params.is_active = statusFilter;
            }
            const response = await api.get(endpoint, { params });
            const data = kind === "products" ? response.data.products : response.data.plans;
            setRows(data);
            setTotal(response.data.pagination.total);
        } catch (requestError) {
            setError(getError(requestError));
        } finally {
            setLoadingRows(false);
        }
    }, [endpoint, kind, page, search, statusFilter]);

    useEffect(() => {
        if (!loading && user?.role === requiredRole) {
            void Promise.resolve().then(fetchRows);
        }
    }, [fetchRows, loading, requiredRole, user]);

    const openForm = async (item?: Product | Plan) => {
        setEditing(item ?? null);
        setError("");
        if (kind === "products") {
            const product = item as Product | undefined;
            setProductForm(product
                ? { name: product.name, type: product.type, sales_price: String(product.sales_price), cost_price: String(product.cost_price), notes: product.notes ?? "" }
                : { name: "", type: "SERVICE", sales_price: "", cost_price: "", notes: "" });
        } else {
            try {
                const response = await api.get("/products", { params: { is_active: "true", limit: 100 } });
                setProducts(response.data.products);
            } catch (requestError) {
                setError(getError(requestError));
                return;
            }
            const plan = item as Plan | undefined;
            setPlanForm(plan
                ? {
                    name: plan.name, product_id: String(plan.product_id), price: String(plan.price),
                    billing_cycle: plan.billing_cycle, min_quantity: String(plan.min_quantity),
                    start_date: plan.start_date?.slice(0, 10) ?? "", end_date: plan.end_date?.slice(0, 10) ?? "",
                    auto_close: plan.auto_close, allow_pause: plan.allow_pause,
                    allow_early_close: plan.allow_early_close, allow_renewal: plan.allow_renewal,
                }
                : {
                    name: "", product_id: "", price: "", billing_cycle: "MONTHLY", min_quantity: "1",
                    start_date: "", end_date: "", auto_close: false, allow_pause: true,
                    allow_early_close: true, allow_renewal: true,
                });
        }
        setModalOpen(true);
    };

    const submitForm = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setSaving(true);
        setError("");
        try {
            if (kind === "products") {
                const payload = {
                    ...productForm,
                    name: productForm.name.trim(),
                    sales_price: Number(productForm.sales_price),
                    cost_price: Number(productForm.cost_price),
                    notes: productForm.notes.trim() || null,
                };
                if (editing) await api.patch(`/products/${editing.id}`, payload);
                else await api.post("/products", payload);
            } else {
                const payload = {
                    ...planForm,
                    name: planForm.name.trim(),
                    product_id: Number(planForm.product_id),
                    price: Number(planForm.price),
                    min_quantity: Number(planForm.min_quantity),
                    start_date: planForm.start_date || null,
                    end_date: planForm.end_date || null,
                };
                if (editing) await api.patch(`/plans/${editing.id}`, payload);
                else await api.post("/plans", payload);
            }
            setModalOpen(false);
            setNotice(`${title.slice(0, -1)} ${editing ? "updated" : "created"} successfully`);
            await fetchRows();
        } catch (requestError) {
            setError(getError(requestError));
        } finally {
            setSaving(false);
        }
    };

    const deactivateProduct = async (product: Product) => {
        if (!window.confirm(`Deactivate "${product.name}"?`)) return;
        setError("");
        try {
            await api.delete(`/products/${product.id}`);
            setNotice("Product deactivated");
            await fetchRows();
        } catch (requestError) {
            setError(getError(requestError));
        }
    };

    const changeStatus = async (plan: Plan, status: Plan["status"]) => {
        if (status === "CLOSED" && !window.confirm(`Close "${plan.name}"?`)) return;
        setError("");
        try {
            await api.patch(`/plans/${plan.id}/status`, { status });
            setNotice(`Plan marked ${status.toLowerCase()}`);
            await fetchRows();
        } catch (requestError) {
            setError(getError(requestError));
        }
    };

    const openVariants = async (product: Product) => {
        setSelectedProduct(product);
        setVariantName("");
        setVariantPrice("0");
        setError("");
        try {
            const response = await api.get(`/products/${product.id}/variants`);
            setVariants(response.data.variants);
        } catch (requestError) {
            setError(getError(requestError));
        }
    };

    const addVariant = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!selectedProduct) return;
        setSaving(true);
        setError("");
        try {
            await api.post(`/products/${selectedProduct.id}/variants`, {
                variant_name: variantName.trim(), extra_price: Number(variantPrice),
            });
            setVariantName("");
            setVariantPrice("0");
            const response = await api.get(`/products/${selectedProduct.id}/variants`);
            setVariants(response.data.variants);
            setNotice("Variant added");
        } catch (requestError) {
            setError(getError(requestError));
        } finally {
            setSaving(false);
        }
    };

    const updateVariant = async (variant: Variant) => {
        const name = window.prompt("Variant name", variant.variant_name);
        if (name === null) return;
        const extraPrice = window.prompt("Extra price", String(variant.extra_price));
        if (extraPrice === null) return;
        setError("");
        try {
            await api.patch(`/variants/${variant.id}`, { variant_name: name.trim(), extra_price: Number(extraPrice) });
            const response = await api.get(`/products/${selectedProduct?.id}/variants`);
            setVariants(response.data.variants);
            setNotice("Variant updated");
        } catch (requestError) {
            setError(getError(requestError));
        }
    };

    const deleteVariant = async (variant: Variant) => {
        if (!window.confirm(`Delete "${variant.variant_name}"?`)) return;
        try {
            await api.delete(`/variants/${variant.id}`);
            setVariants((current) => current.filter((entry) => entry.id !== variant.id));
            setNotice("Variant deleted");
        } catch (requestError) {
            setError(getError(requestError));
        }
    };

    if (loading || !user || user.role !== requiredRole) {
        return <div className="flex min-h-screen items-center justify-center bg-gray-950"><Loader2 className="h-7 w-7 animate-spin text-indigo-400" /></div>;
    }

    const totalPages = Math.max(1, Math.ceil(total / 10));
    const labelClass = "mb-1.5 block text-xs font-medium text-gray-400";
    const closeModal = () => { setModalOpen(false); setError(""); };

    return (
        <main className="min-h-screen bg-gray-950 px-4 py-6 text-gray-100 sm:px-6 lg:px-10">
            <div className="mx-auto max-w-7xl">
                <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <button onClick={() => router.push(`/${requiredRole.toLowerCase()}`)} className="mb-2 text-sm text-indigo-300 hover:text-indigo-200">← Dashboard</button>
                        <h1 className="text-2xl font-bold">{title}</h1>
                        <p className="mt-1 text-sm text-gray-400">{isAdmin ? `Manage ${title.toLowerCase()} and settings` : `Browse available ${title.toLowerCase()}`}</p>
                    </div>
                    {isAdmin && (
                        <button onClick={() => void openForm()} className={`${buttonClass} bg-indigo-600 text-white hover:bg-indigo-500`}>
                            <Plus className="h-4 w-4" /> Create {kind === "products" ? "product" : "plan"}
                        </button>
                    )}
                </header>

                <section className="rounded-xl border border-gray-800 bg-gray-900/60">
                    <div className="flex flex-col gap-3 border-b border-gray-800 p-4 sm:flex-row">
                        <form onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(queryInput.trim()); }} className="flex flex-1 gap-2">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
                                <input value={queryInput} onChange={(event) => setQueryInput(event.target.value)} placeholder={`Search ${title.toLowerCase()}...`} className={`${fieldClass} pl-9`} />
                            </div>
                            <button className={`${buttonClass} bg-gray-800 text-gray-200 hover:bg-gray-700`}>Search</button>
                        </form>
                        <select aria-label={`${title} status filter`} value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }} className={`${fieldClass} sm:w-44`}>
                            <option value="">All statuses</option>
                            {kind === "plans" ? <>
                                <option value="ACTIVE">Active</option><option value="PAUSED">Paused</option><option value="CLOSED">Closed</option>
                            </> : <>
                                <option value="true">Active</option>{isAdmin && <option value="false">Inactive</option>}
                            </>}
                        </select>
                    </div>
                    {notice && <div role="status" className="border-b border-emerald-900/60 bg-emerald-950/30 px-4 py-2 text-sm text-emerald-300">{notice}</div>}
                    {error && <div role="alert" className="border-b border-red-900/60 bg-red-950/30 px-4 py-2 text-sm text-red-300">{error}</div>}
                    {loadingRows ? (
                        <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-indigo-400" /></div>
                    ) : rows.length === 0 ? (
                        <div className="px-6 py-16 text-center"><p className="font-medium text-gray-200">No {title.toLowerCase()} found</p><p className="mt-1 text-sm text-gray-500">Try another search or filter.</p></div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[720px] text-left text-sm">
                                <thead className="bg-gray-900 text-xs uppercase tracking-wide text-gray-500">
                                    <tr>
                                        <th className="px-4 py-3">{kind === "products" ? "Product" : "Plan"}</th>
                                        <th className="px-4 py-3">{kind === "products" ? "Type" : "Product"}</th>
                                        <th className="px-4 py-3">{kind === "products" ? "Sales price" : "Price / cycle"}</th>
                                        <th className="px-4 py-3">Status</th>
                                        <th className="px-4 py-3">Details</th>
                                        {isAdmin && <th className="px-4 py-3 text-right">Actions</th>}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-800">
                                    {kind === "products" ? (rows as Product[]).map((product) => (
                                        <tr key={product.id} className="hover:bg-gray-800/30">
                                            <td className="px-4 py-4"><p className="font-medium text-white">{product.name}</p><p className="mt-1 text-xs text-gray-500">Cost {money(product.cost_price)}</p></td>
                                            <td className="px-4 py-4 text-gray-300">{product.type}</td>
                                            <td className="px-4 py-4 font-medium text-gray-200">{money(product.sales_price)}</td>
                                            <td className="px-4 py-4"><StatusBadge status={product.is_active ? "ACTIVE" : "INACTIVE"} /></td>
                                            <td className="max-w-xs truncate px-4 py-4 text-gray-400">{product.notes || "—"}</td>
                                            {isAdmin && <td className="px-4 py-4"><div className="flex justify-end gap-2">
                                                <button onClick={() => void openVariants(product)} className={`${buttonClass} bg-gray-800 text-gray-300 hover:bg-gray-700`}>Variants</button>
                                                <button aria-label={`Edit ${product.name}`} onClick={() => void openForm(product)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-white"><Pencil className="h-4 w-4" /></button>
                                                {product.is_active && <button aria-label={`Deactivate ${product.name}`} onClick={() => void deactivateProduct(product)} className="rounded-lg p-2 text-gray-400 hover:bg-red-950 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>}
                                            </div></td>}
                                        </tr>
                                    )) : (rows as Plan[]).map((plan) => (
                                        <tr key={plan.id} className="hover:bg-gray-800/30">
                                            <td className="px-4 py-4"><p className="font-medium text-white">{plan.name}</p><p className="mt-1 text-xs text-gray-500">Minimum quantity {plan.min_quantity}</p></td>
                                            <td className="px-4 py-4 text-gray-300">{plan.product_name}</td>
                                            <td className="px-4 py-4"><p className="font-medium text-gray-200">{money(plan.price)}</p><p className="mt-1 text-xs text-gray-500">per {plan.billing_cycle.toLowerCase()}</p></td>
                                            <td className="px-4 py-4"><StatusBadge status={plan.status} /></td>
                                            <td className="px-4 py-4 text-gray-400">{plan.start_date ? `${plan.start_date.slice(0, 10)} – ` : ""}{plan.end_date ? plan.end_date.slice(0, 10) : "No end date"}</td>
                                            {isAdmin && <td className="px-4 py-4"><div className="flex justify-end gap-2">
                                                <button aria-label={`Edit ${plan.name}`} onClick={() => void openForm(plan)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-white"><Pencil className="h-4 w-4" /></button>
                                                <select aria-label={`Change ${plan.name} status`} value={plan.status} onChange={(event) => void changeStatus(plan, event.target.value as Plan["status"])} className="rounded-lg border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-200">
                                                    <option value="ACTIVE">Active</option><option value="PAUSED">Paused</option><option value="CLOSED">Closed</option>
                                                </select>
                                            </div></td>}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <footer className="flex items-center justify-between border-t border-gray-800 px-4 py-3 text-sm text-gray-500">
                        <span>{total} total</span>
                        <div className="flex items-center gap-2">
                            <button disabled={page <= 1} onClick={() => setPage((current) => current - 1)} className={`${buttonClass} bg-gray-800 text-gray-300 hover:bg-gray-700`}>Previous</button>
                            <span>Page {page} of {totalPages}</span>
                            <button disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)} className={`${buttonClass} bg-gray-800 text-gray-300 hover:bg-gray-700`}>Next</button>
                        </div>
                    </footer>
                </section>
            </div>

            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4">
                    <section role="dialog" aria-modal="true" aria-labelledby="catalog-dialog-title" className="my-8 w-full max-w-2xl rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl">
                        <header className="flex items-center justify-between border-b border-gray-800 px-5 py-4">
                            <h2 id="catalog-dialog-title" className="font-semibold">{editing ? "Edit" : "Create"} {kind === "products" ? "product" : "plan"}</h2>
                            <button onClick={closeModal} aria-label="Close" className="text-gray-500 hover:text-white"><X className="h-5 w-5" /></button>
                        </header>
                        <form onSubmit={(event) => void submitForm(event)} className="grid gap-4 p-5 sm:grid-cols-2">
                            {kind === "products" ? <>
                                <label><span className={labelClass}>Name</span><input required maxLength={150} value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value })} className={fieldClass} /></label>
                                <label><span className={labelClass}>Type</span><select value={productForm.type} onChange={(event) => setProductForm({ ...productForm, type: event.target.value as Product["type"] })} className={fieldClass}><option>SERVICE</option><option>SOFTWARE</option><option>OTHER</option></select></label>
                                <label><span className={labelClass}>Sales price</span><input required type="number" min="0" step="0.01" value={productForm.sales_price} onChange={(event) => setProductForm({ ...productForm, sales_price: event.target.value })} className={fieldClass} /></label>
                                <label><span className={labelClass}>Cost price</span><input required type="number" min="0" step="0.01" value={productForm.cost_price} onChange={(event) => setProductForm({ ...productForm, cost_price: event.target.value })} className={fieldClass} /></label>
                                <label className="sm:col-span-2"><span className={labelClass}>Notes</span><textarea rows={3} value={productForm.notes} onChange={(event) => setProductForm({ ...productForm, notes: event.target.value })} className={fieldClass} /></label>
                            </> : <>
                                <label><span className={labelClass}>Name</span><input required maxLength={150} value={planForm.name} onChange={(event) => setPlanForm({ ...planForm, name: event.target.value })} className={fieldClass} /></label>
                                <label><span className={labelClass}>Product</span><select required value={planForm.product_id} onChange={(event) => setPlanForm({ ...planForm, product_id: event.target.value })} className={fieldClass}><option value="">Choose product</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
                                <label><span className={labelClass}>Plan price</span><input required type="number" min="0" step="0.01" value={planForm.price} onChange={(event) => setPlanForm({ ...planForm, price: event.target.value })} className={fieldClass} /></label>
                                <label><span className={labelClass}>Billing cycle</span><select value={planForm.billing_cycle} onChange={(event) => setPlanForm({ ...planForm, billing_cycle: event.target.value as Plan["billing_cycle"] })} className={fieldClass}><option>DAILY</option><option>WEEKLY</option><option>MONTHLY</option><option>YEARLY</option></select></label>
                                <label><span className={labelClass}>Minimum quantity</span><input required type="number" min="1" step="1" value={planForm.min_quantity} onChange={(event) => setPlanForm({ ...planForm, min_quantity: event.target.value })} className={fieldClass} /></label>
                                <label><span className={labelClass}>Start date</span><input type="date" value={planForm.start_date} onChange={(event) => setPlanForm({ ...planForm, start_date: event.target.value })} className={fieldClass} /></label>
                                <label><span className={labelClass}>End date</span><input type="date" value={planForm.end_date} onChange={(event) => setPlanForm({ ...planForm, end_date: event.target.value })} className={fieldClass} /></label>
                                <div className="grid gap-2 sm:col-span-2 sm:grid-cols-2">
                                    {([
                                        ["auto_close", "Automatically close at the end date"],
                                        ["allow_pause", "Allow pausing"],
                                        ["allow_early_close", "Allow early close"],
                                        ["allow_renewal", "Allow renewal"],
                                    ] as const).map(([field, label]) => (
                                        <label key={field} className="flex items-center gap-2 text-sm text-gray-300">
                                            <input type="checkbox" checked={planForm[field]} onChange={(event) => setPlanForm({ ...planForm, [field]: event.target.checked })} className="accent-indigo-500" />{label}
                                        </label>
                                    ))}
                                </div>
                            </>}
                            {error && <p role="alert" className="sm:col-span-2 text-sm text-red-300">{error}</p>}
                            <div className="flex justify-end gap-2 pt-2 sm:col-span-2">
                                <button type="button" onClick={closeModal} className={`${buttonClass} bg-gray-800 text-gray-300 hover:bg-gray-700`}>Cancel</button>
                                <button disabled={saving} className={`${buttonClass} bg-indigo-600 text-white hover:bg-indigo-500`}>
                                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}{editing ? "Save changes" : "Create"}
                                </button>
                            </div>
                        </form>
                    </section>
                </div>
            )}

            {selectedProduct && isAdmin && (
                <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4">
                    <section role="dialog" aria-modal="true" aria-labelledby="variants-title" className="my-8 w-full max-w-2xl rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl">
                        <header className="flex items-center justify-between border-b border-gray-800 px-5 py-4">
                            <div><h2 id="variants-title" className="font-semibold">Variants · {selectedProduct.name}</h2><p className="mt-1 text-xs text-gray-500">Variant price is base sales price plus extra price.</p></div>
                            <button onClick={() => setSelectedProduct(null)} aria-label="Close variants" className="text-gray-500 hover:text-white"><X className="h-5 w-5" /></button>
                        </header>
                        <div className="space-y-4 p-5">
                            {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
                            <form onSubmit={(event) => void addVariant(event)} className="grid gap-2 sm:grid-cols-[1fr_150px_auto]">
                                <input required maxLength={150} aria-label="Variant name" placeholder="Variant name" value={variantName} onChange={(event) => setVariantName(event.target.value)} className={fieldClass} />
                                <input required type="number" min="0" step="0.01" aria-label="Extra price" placeholder="Extra price" value={variantPrice} onChange={(event) => setVariantPrice(event.target.value)} className={fieldClass} />
                                <button disabled={saving} className={`${buttonClass} bg-indigo-600 text-white hover:bg-indigo-500`}><Plus className="h-4 w-4" />Add</button>
                            </form>
                            <div className="divide-y divide-gray-800 rounded-lg border border-gray-800">
                                {variants.length === 0 ? <p className="p-4 text-sm text-gray-500">No variants have been added.</p> : variants.map((variant) => (
                                    <div key={variant.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                                        <span className="flex-1 font-medium">{variant.variant_name}</span>
                                        <span className="text-sm text-gray-400">+{money(variant.extra_price)} · {money(variant.price)} total</span>
                                        <button onClick={() => void updateVariant(variant)} aria-label={`Edit ${variant.variant_name}`} className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-white"><Pencil className="h-4 w-4" /></button>
                                        <button onClick={() => void deleteVariant(variant)} aria-label={`Delete ${variant.variant_name}`} className="rounded-lg p-2 text-gray-400 hover:bg-red-950 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>
                </div>
            )}
        </main>
    );
}

function StatusBadge({ status }: { status: string }) {
    const colors: Record<string, string> = {
        ACTIVE: "border-emerald-800 bg-emerald-950/50 text-emerald-300",
        PAUSED: "border-amber-800 bg-amber-950/50 text-amber-300",
        CLOSED: "border-gray-700 bg-gray-800 text-gray-400",
        INACTIVE: "border-red-900 bg-red-950/40 text-red-300",
    };
    return <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${colors[status] ?? colors.CLOSED}`}>{status}</span>;
}
