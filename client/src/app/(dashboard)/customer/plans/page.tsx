import CatalogManager from "@/components/CatalogManager";

export default function CustomerPlansPage() {
    return <CatalogManager kind="plans" requiredRole="CUSTOMER" />;
}
