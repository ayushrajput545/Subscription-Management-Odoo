import CatalogManager from "@/components/CatalogManager";

export default function AdminPlansPage() {
    return <CatalogManager kind="plans" requiredRole="ADMIN" />;
}
