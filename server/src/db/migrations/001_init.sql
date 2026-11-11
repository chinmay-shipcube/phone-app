-- Cell Decor billing: first schema. Money is integer paise. GST rates are basis points (1800 = 18%).

CREATE TABLE users (
  id               serial PRIMARY KEY,
  name             text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 40),
  role             text NOT NULL CHECK (role IN ('employee', 'admin')),
  pin_hash         text,                    -- employees: null = no PIN
  password_hash    text,                    -- admin only
  active           boolean NOT NULL DEFAULT true,
  failed_attempts  integer NOT NULL DEFAULT 0,
  locked_until     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_name_key ON users (lower(trim(name)));

CREATE TABLE sessions (
  id          text PRIMARY KEY,             -- sha256 of the cookie token
  user_id     integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_seen   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE shop_settings (
  id                     integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  shop_name              text NOT NULL DEFAULT 'Cell Decor',
  address_line1          text NOT NULL DEFAULT '',
  address_line2          text NOT NULL DEFAULT '',
  phone                  text NOT NULL DEFAULT '',
  gstin                  text NOT NULL DEFAULT '',
  invoice_prefix         text NOT NULL DEFAULT 'CD',
  default_gst_bp         integer NOT NULL DEFAULT 1800,
  default_hsn            text NOT NULL DEFAULT '',
  footer                 text NOT NULL DEFAULT 'Thank you! Visit again.',
  printer_name           text NOT NULL DEFAULT '',
  paper                  text NOT NULL DEFAULT '80mm' CHECK (paper IN ('58mm', '80mm')),
  allow_custom_items     boolean NOT NULL DEFAULT true,
  employee_idle_minutes  integer NOT NULL DEFAULT 480,
  admin_idle_minutes     integer NOT NULL DEFAULT 30,
  updated_at             timestamptz NOT NULL DEFAULT now()
);
INSERT INTO shop_settings (id) VALUES (1);

CREATE TABLE items (
  id                  serial PRIMARY KEY,
  name                text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  default_price_paise integer CHECK (default_price_paise >= 0),
  hsn                 text NOT NULL DEFAULT '',
  gst_bp              integer NOT NULL DEFAULT 1800 CHECK (gst_bp BETWEEN 0 AND 10000),
  active              boolean NOT NULL DEFAULT true,
  created_by          integer REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX items_name_key ON items (lower(trim(name)));

-- One row per financial year. Incremented inside the bill's transaction, so a failed bill
-- rolls the number back and the series has no gaps.
CREATE TABLE invoice_counters (
  fy       text PRIMARY KEY,
  last_no  integer NOT NULL
);

CREATE TABLE bills (
  id                 serial PRIMARY KEY,
  invoice_no         text NOT NULL UNIQUE,
  fy                 text NOT NULL,
  seq                integer NOT NULL,
  client_request_id  uuid NOT NULL UNIQUE,
  employee_id        integer NOT NULL REFERENCES users(id),
  customer_name      text NOT NULL DEFAULT '',
  customer_phone     text NOT NULL DEFAULT '',
  customer_gstin     text NOT NULL DEFAULT '',
  payment_mode       text NOT NULL CHECK (payment_mode IN ('cash', 'upi', 'card', 'other')),
  gross_paise        integer NOT NULL,
  discount_paise     integer NOT NULL DEFAULT 0,
  taxable_paise      integer NOT NULL,
  cgst_paise         integer NOT NULL,
  sgst_paise         integer NOT NULL,
  total_paise        integer NOT NULL,
  status             text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'voided')),
  void_reason        text NOT NULL DEFAULT '',
  voided_by          integer REFERENCES users(id),
  voided_at          timestamptz,
  commission_rate_bp integer,               -- set once the commission rule is decided
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fy, seq)
);
CREATE INDEX bills_created_idx ON bills (created_at);
CREATE INDEX bills_employee_idx ON bills (employee_id, created_at);

CREATE TABLE bill_items (
  id              serial PRIMARY KEY,
  bill_id         integer NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  line_no         integer NOT NULL,
  item_id         integer REFERENCES items(id),   -- null = unlisted item typed by staff
  name            text NOT NULL,
  custom          boolean NOT NULL DEFAULT false,
  hsn             text NOT NULL DEFAULT '',
  gst_bp          integer NOT NULL,
  qty             integer NOT NULL CHECK (qty > 0),
  rate_paise      integer NOT NULL CHECK (rate_paise >= 0),
  gross_paise     integer NOT NULL,
  discount_paise  integer NOT NULL,
  net_paise       integer NOT NULL,
  taxable_paise   integer NOT NULL,
  tax_paise       integer NOT NULL,
  UNIQUE (bill_id, line_no)
);
CREATE INDEX bill_items_item_idx ON bill_items (item_id);

CREATE TABLE print_jobs (
  id            serial PRIMARY KEY,
  bill_id       integer NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('original', 'copy')),
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'printed', 'failed', 'unknown')),
  error         text NOT NULL DEFAULT '',
  printer       text NOT NULL DEFAULT '',
  requested_by  integer REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz
);
CREATE INDEX print_jobs_bill_idx ON print_jobs (bill_id);

CREATE TABLE audit_log (
  id         bigserial PRIMARY KEY,
  actor_id   integer REFERENCES users(id),
  action     text NOT NULL,
  entity     text NOT NULL,
  entity_id  text NOT NULL DEFAULT '',
  before     jsonb,
  after      jsonb,
  at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_entity_idx ON audit_log (entity, entity_id);
