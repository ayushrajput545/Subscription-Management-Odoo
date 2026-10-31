import CatalogManager from "@/components/CatalogManager";

export default function AdminProductsPage() {
    return <CatalogManager kind="products" requiredRole="ADMIN" />;
}
