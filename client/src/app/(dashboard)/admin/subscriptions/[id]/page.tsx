import { Suspense } from "react";
import SubscriptionWorkspace from "@/components/SubscriptionWorkspace";

export default function AdminSubscriptionDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    return <Suspense fallback={<div className="min-h-screen bg-gray-950" />}><PageContent params={params} /></Suspense>;
}

async function PageContent({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <SubscriptionWorkspace role="ADMIN" view="detail" recordId={id} />;
}
