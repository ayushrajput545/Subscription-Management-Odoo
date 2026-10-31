CREATE TABLE payments (
    id BIGSERIAL PRIMARY KEY,
    invoice_id BIGINT NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    method VARCHAR(20) NOT NULL CHECK (method IN ('CASH', 'BANK_TRANSFER', 'CARD', 'UPI', 'OTHER')),
    payment_date TIMESTAMPTZ NOT NULL,
    reference VARCHAR(255),
    note TEXT,
    recorded_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_invoice_id_date ON payments (invoice_id, payment_date DESC);
CREATE INDEX idx_payments_recorded_by ON payments (recorded_by);
CREATE INDEX idx_payments_payment_date ON payments (payment_date DESC);
