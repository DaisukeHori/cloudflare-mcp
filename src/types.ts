// ─── Cloudflare API generic response ──────────────────────────────────
export interface CfError {
  code: number;
  message: string;
}

export interface CfResultInfo {
  page: number;
  per_page: number;
  total_pages: number;
  count: number;
  total_count: number;
}

export interface CfResponse<T> {
  success: boolean;
  errors: CfError[];
  messages: string[];
  result: T;
  result_info?: CfResultInfo;
}

// ─── Account ─────────────────────────────────────────────────────────
export interface CfAccount {
  id: string;
  name: string;
  type: string;
  settings?: Record<string, unknown>;
  created_on?: string;
}

export interface CfAccountMember {
  id: string;
  user: { id: string; first_name: string; last_name: string; email: string };
  status: string;
  roles: Array<{ id: string; name: string }>;
}

export interface CfUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  username: string;
  telephone: string | null;
  country: string | null;
  created_on: string;
  modified_on: string;
  two_factor_authentication_enabled: boolean;
  suspended: boolean;
}

// ─── Zone ────────────────────────────────────────────────────────────
export interface CfZone {
  id: string;
  name: string;
  status: string;
  paused: boolean;
  type: string;
  name_servers: string[];
  original_name_servers: string[];
  plan?: { id: string; name: string; price: number; currency: string };
  created_on: string;
  modified_on: string;
}

export interface CfZoneSetting {
  id: string;
  value: unknown;
  editable: boolean;
  modified_on?: string;
}

// ─── DNS ─────────────────────────────────────────────────────────────
export interface CfDnsRecord {
  id: string;
  zone_id: string;
  zone_name: string;
  name: string;
  type: string;
  content: string;
  proxiable: boolean;
  proxied: boolean;
  ttl: number;
  locked: boolean;
  created_on: string;
  modified_on: string;
  comment?: string;
  tags?: string[];
  priority?: number;
}

// ─── Tunnel ──────────────────────────────────────────────────────────
export interface CfTunnel {
  id: string;
  name: string;
  status: string;
  created_at: string;
  deleted_at?: string;
  connections: CfTunnelConnection[];
  conns_active_at?: string;
  conns_inactive_at?: string;
  metadata?: Record<string, unknown>;
}

export interface CfTunnelConnection {
  id: string;
  features: string[];
  version: string;
  arch: string;
  colo_name: string;
  config_version: number;
  is_pending_reconnect: boolean;
  opened_at: string;
  origin_ip: string;
}

export interface CfTunnelIngress {
  hostname?: string;
  path?: string;
  service: string;
  originRequest?: {
    noTLSVerify?: boolean;
    httpHostHeader?: string;
    connectTimeout?: string;
    disableChunkedEncoding?: boolean;
  };
}

export interface CfTunnelConfig {
  config: {
    ingress: CfTunnelIngress[];
    warp_routing?: { enabled: boolean };
    originRequest?: Record<string, unknown>;
  };
}

// ─── Billing ─────────────────────────────────────────────────────────
export interface CfBillingProfile {
  id: string;
  first_name: string;
  last_name: string;
  address: string;
  address2: string;
  company: string;
  city: string;
  state: string;
  zipcode: string;
  country: string;
  telephone: string;
  card_number: string;
  card_expiry_year: number;
  card_expiry_month: number;
  edited_on: string;
  created_on: string;
}

export interface CfBillingHistory {
  id: string;
  type: string;
  action: string;
  description: string;
  occurred_at: string;
  amount: number;
  currency: string;
  zone?: { name: string };
}

export interface CfSubscription {
  id: string;
  rate_plan: { id: string; public_name: string; currency: string; price: number };
  current_period_start: string;
  current_period_end: string;
  state: string;
}

// ─── Registrar ───────────────────────────────────────────────────────
export interface CfRegistrarDomain {
  domain_name: string;
  status: string;
  locked: boolean;
  auto_renew: boolean;
  expires_at: string;
  created_at: string;
  updated_at: string;
  registrant_contact?: Record<string, unknown>;
  privacy: boolean;
}

// ─── Access ──────────────────────────────────────────────────────────
export interface CfAccessApp {
  id: string;
  uid: string;
  name: string;
  domain: string;
  type: string;
  session_duration: string;
  created_at: string;
  updated_at: string;
  aud: string;
}

export interface CfAccessPolicy {
  id: string;
  name: string;
  decision: string;
  precedence: number;
  include: Array<Record<string, unknown>>;
  exclude: Array<Record<string, unknown>>;
  require: Array<Record<string, unknown>>;
  created_at: string;
  updated_at: string;
}

// ─── Workers ─────────────────────────────────────────────────────────
export interface CfWorker {
  id: string;
  created_on: string;
  modified_on: string;
  etag: string;
  logpush?: boolean;
}

export interface CfWorkerRoute {
  id: string;
  pattern: string;
  script: string;
}

// ─── Pages ───────────────────────────────────────────────────────────
export interface CfPagesProject {
  id: string;
  name: string;
  subdomain: string;
  created_on: string;
  production_branch: string;
  canonical_deployment?: CfPagesDeployment;
  latest_deployment?: CfPagesDeployment;
}

export interface CfPagesDeployment {
  id: string;
  url: string;
  environment: string;
  created_on: string;
  modified_on: string;
  latest_stage: { name: string; status: string; ended_on?: string };
  deployment_trigger?: { type: string; metadata?: Record<string, unknown> };
  aliases?: string[];
}

// ─── R2 ──────────────────────────────────────────────────────────────
export interface CfR2Bucket {
  name: string;
  creation_date: string;
  location?: string;
}

// ─── KV ──────────────────────────────────────────────────────────────
export interface CfKvNamespace {
  id: string;
  title: string;
  supports_url_encoding: boolean;
}

export interface CfKvKey {
  name: string;
  expiration?: number;
  metadata?: Record<string, unknown>;
}
