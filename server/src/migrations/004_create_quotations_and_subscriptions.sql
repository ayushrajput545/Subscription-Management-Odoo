CREATE SEQUENCE subscription_number_seq START WITH 1;

CREATE TABLE quotation_templates (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL CHECK (LENGTH(BTRIM(name)) > 0),
    plan_id BIGINT NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
    validity_days INTEGER NOT NULL DEFAULT 30 CHECK (validity_days > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quotation_templates_plan_id ON quotation_templates (plan_id);
CREATE INDEX idx_quotation_templates_name ON quotation_templates (name);

CREATE TABLE quotation_template_items (
    id BIGSERIAL PRIMARY KEY,
    template_id BIGINT NOT NULL REFERENCES quotation_templates(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    variant_id BIGINT REFERENCES product_variants(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0)
);

CREATE INDEX idx_quotation_template_items_template_id ON quotation_template_items (template_id);

CREATE TABLE subscriptions (
    id BIGSERIAL PRIMARY KEY,
    subscription_number VARCHAR(32) NOT NULL UNIQUE,
    customer_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    plan_id BIGINT NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
    start_date DATE NOT NULL,
    expiry_date DATE,
    next_billing_date DATE,
    payment_terms TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT', 'QUOTATION', 'CONFIRMED', 'ACTIVE', 'CLOSED')),
    quotation_valid_until DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (expiry_date IS NULL OR start_date <= expiry_date)
);

CREATE INDEX idx_subscriptions_customer_status ON subscriptions (customer_id, status);
CREATE INDEX idx_subscriptions_plan_id ON subscriptions (plan_id);
CREATE INDEX idx_subscriptions_number ON subscriptions (subscription_number);

CREATE TABLE subscription_items (
    id BIGSERIAL PRIMARY KEY,
    subscription_id BIGINT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    variant_id BIGINT REFERENCES product_variants(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100),
    amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0)
);

CREATE INDEX idx_subscription_items_subscription_id ON subscription_items (subscription_id);
