import { Suspense } from "react";
import SubscriptionWorkspace from "@/components/SubscriptionWorkspace";

export default function NewAdminSubscriptionPage({
    searchParams,
}: {
    searchParams: Promise<{ template?: string }>;
}) {
    return <Suspense fallback={<div className="min-h-screen bg-gray-950" />}><PageContent searchParams={searchParams} /></Suspense>;
}

async function PageContent({ searchParams }: { searchParams: Promise<{ template?: string }> }) {
    const { template } = await searchParams;
    return <SubscriptionWorkspace role="ADMIN" view="new" templateId={template} />;
}
