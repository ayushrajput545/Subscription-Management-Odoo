CREATE TABLE notifications (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(80) NOT NULL CHECK (LENGTH(BTRIM(type)) > 0),
    channel VARCHAR(10) NOT NULL CHECK (channel IN ('EMAIL', 'IN_APP')),
    subject VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'READ')),
    related_type VARCHAR(40),
    related_id BIGINT,
    sent_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    error_message TEXT,
    attempts SMALLINT NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processing_at TIMESTAMPTZ,
    dedupe_key VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
        (channel = 'IN_APP' AND status IN ('PENDING', 'READ'))
        OR (channel = 'EMAIL' AND status IN ('PENDING', 'SENT', 'FAILED'))
    )
);

CREATE INDEX idx_notifications_user_created
    ON notifications (user_id, created_at DESC)
    WHERE channel = 'IN_APP';
CREATE INDEX idx_notifications_status_retry
    ON notifications (status, next_attempt_at, id)
    WHERE channel = 'EMAIL';
CREATE INDEX idx_notifications_created_at
    ON notifications (created_at DESC);
