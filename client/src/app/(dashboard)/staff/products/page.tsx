import CatalogManager from "@/components/CatalogManager";

export default function StaffProductsPage() {
    return <CatalogManager kind="products" requiredRole="STAFF" />;
}
