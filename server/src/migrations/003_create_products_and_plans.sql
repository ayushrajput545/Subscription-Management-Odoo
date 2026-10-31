CREATE TABLE products (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL CHECK (LENGTH(BTRIM(name)) > 0),
    type VARCHAR(20) NOT NULL CHECK (type IN ('SERVICE', 'SOFTWARE', 'OTHER')),
    sales_price NUMERIC(12, 2) NOT NULL CHECK (sales_price >= 0),
    cost_price NUMERIC(12, 2) NOT NULL CHECK (cost_price >= 0),
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_products_active_name ON products (is_active, name);
CREATE INDEX idx_products_type ON products (type);

CREATE TABLE product_variants (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_name VARCHAR(150) NOT NULL CHECK (LENGTH(BTRIM(variant_name)) > 0),
    extra_price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (extra_price >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_product_variants_name
    ON product_variants (product_id, LOWER(variant_name));
CREATE INDEX idx_product_variants_product_id ON product_variants (product_id);

CREATE TABLE plans (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL CHECK (LENGTH(BTRIM(name)) > 0),
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
    billing_cycle VARCHAR(20) NOT NULL CHECK (billing_cycle IN ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY')),
    min_quantity INTEGER NOT NULL DEFAULT 1 CHECK (min_quantity > 0),
    start_date DATE,
    end_date DATE,
    auto_close BOOLEAN NOT NULL DEFAULT FALSE,
    allow_pause BOOLEAN NOT NULL DEFAULT TRUE,
    allow_early_close BOOLEAN NOT NULL DEFAULT TRUE,
    allow_renewal BOOLEAN NOT NULL DEFAULT TRUE,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'CLOSED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (start_date IS NULL OR end_date IS NULL OR start_date <= end_date)
);

CREATE INDEX idx_plans_status_name ON plans (status, name);
CREATE INDEX idx_plans_product_id ON plans (product_id);
