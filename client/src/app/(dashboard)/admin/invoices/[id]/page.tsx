import { Suspense } from "react";
import InvoiceWorkspace from "@/components/InvoiceWorkspace";

export default function AdminInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
    return <Suspense fallback={<div className="min-h-screen bg-gray-950" />}><InvoiceContent params={params} /></Suspense>;
}

async function InvoiceContent({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <InvoiceWorkspace role="ADMIN" view="invoice" recordId={id} />;
}
