CREATE SEQUENCE invoice_number_seq START WITH 1;

CREATE TABLE taxes (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL CHECK (LENGTH(BTRIM(name)) > 0),
    rate NUMERIC(5, 2) NOT NULL CHECK (rate >= 0 AND rate <= 100),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_taxes_active_name_rate ON taxes (LOWER(name), rate) WHERE is_active = TRUE;

CREATE TABLE discounts (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL CHECK (LENGTH(BTRIM(name)) > 0),
    type VARCHAR(20) NOT NULL CHECK (type IN ('FIXED', 'PERCENTAGE')),
    value NUMERIC(12, 2) NOT NULL CHECK (value > 0),
    min_purchase NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (min_purchase >= 0),
    min_quantity INTEGER NOT NULL DEFAULT 1 CHECK (min_quantity > 0),
    valid_from DATE,
    valid_to DATE,
    usage_limit INTEGER CHECK (usage_limit IS NULL OR usage_limit > 0),
    used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
    applies_to VARCHAR(20) NOT NULL CHECK (applies_to IN ('PRODUCT', 'SUBSCRIPTION')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_from <= valid_to),
    CHECK (usage_limit IS NULL OR used_count <= usage_limit),
    CHECK (type <> 'PERCENTAGE' OR value <= 100)
);

CREATE INDEX idx_discounts_active_dates ON discounts (is_active, valid_from, valid_to);
CREATE INDEX idx_discounts_type_scope ON discounts (type, applies_to);

CREATE TABLE discount_products (
    id BIGSERIAL PRIMARY KEY,
    discount_id BIGINT NOT NULL REFERENCES discounts(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    UNIQUE (discount_id, product_id)
);

CREATE INDEX idx_discount_products_product_id ON discount_products (product_id);

CREATE TABLE subscription_discounts (
    id BIGSERIAL PRIMARY KEY,
    subscription_id BIGINT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    discount_id BIGINT NOT NULL REFERENCES discounts(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (subscription_id, discount_id)
);

CREATE INDEX idx_subscription_discounts_discount_id ON subscription_discounts (discount_id);

CREATE TABLE invoices (
    id BIGSERIAL PRIMARY KEY,
    invoice_number VARCHAR(32) NOT NULL UNIQUE,
    subscription_id BIGINT NOT NULL REFERENCES subscriptions(id) ON DELETE RESTRICT,
    customer_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    billing_period_start DATE NOT NULL,
    billing_period_end DATE NOT NULL,
    invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE NOT NULL,
    subtotal NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0),
    tax_total NUMERIC(12, 2) NOT NULL CHECK (tax_total >= 0),
    discount_total NUMERIC(12, 2) NOT NULL CHECK (discount_total >= 0),
    total NUMERIC(12, 2) NOT NULL CHECK (total >= 0),
    amount_paid NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0 AND amount_paid <= total),
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT', 'CONFIRMED', 'PAID', 'CANCELLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (billing_period_start <= billing_period_end),
    CHECK (due_date >= invoice_date),
    UNIQUE (subscription_id, billing_period_start, billing_period_end)
);

CREATE INDEX idx_invoices_customer_status ON invoices (customer_id, status);
CREATE INDEX idx_invoices_subscription_id ON invoices (subscription_id);
CREATE INDEX idx_invoices_invoice_date ON invoices (invoice_date DESC);

CREATE TABLE invoice_items (
    id BIGSERIAL PRIMARY KEY,
    invoice_id BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    description VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100),
    tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
    discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
    line_total NUMERIC(12, 2) NOT NULL CHECK (line_total >= 0)
);

CREATE INDEX idx_invoice_items_invoice_id ON invoice_items (invoice_id);
