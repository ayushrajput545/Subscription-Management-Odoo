import CatalogManager from "@/components/CatalogManager";

export default function StaffPlansPage() {
    return <CatalogManager kind="plans" requiredRole="STAFF" />;
}
