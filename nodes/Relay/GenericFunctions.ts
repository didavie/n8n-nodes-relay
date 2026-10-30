import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	IPollFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

export const PROD_BASE_URL = 'https://relaypartner.didavie.com/api/v1';
/** Public API sandbox: rb_sbx_ (shop) and relay_pk_sbx_ (agency) keys work only there. */
export const SANDBOX_BASE_URL = 'https://relaysandbox.didavie.com/api/v1';

/** Shop keys come from Shop › Connect my website, agency keys from the agency dashboard. */
export type RelayKeyKind = 'shop' | 'agency';

export interface RelayCredentials {
	apiKey: string;
	/** 'development' is an older stored value; it now behaves like 'auto'. */
	environment?: 'auto' | 'production' | 'sandbox' | 'custom' | 'development';
	/** Used only when environment is 'custom': full https base URL ending in /api/v1. */
	customBaseUrl?: string;
}

type RelayContext = IExecuteFunctions | IPollFunctions | ILoadOptionsFunctions;

export function keyKind(apiKey: string): RelayKeyKind {
	return apiKey.startsWith('rb_') ? 'shop' : 'agency';
}

export function isSandboxKey(apiKey: string): boolean {
	return apiKey.startsWith('rb_sbx_') || apiKey.startsWith('relay_pk_sbx_');
}

export function isTestKey(apiKey: string): boolean {
	return apiKey.startsWith('rb_test_') || apiKey.startsWith('relay_pk_test_');
}

/**
 * Same rule as the credential test: sandbox keys always go to the sandbox (they work
 * nowhere else). Every other key uses production. The old test keys (rb_test_,
 * relay_pk_test_) are retired: production answers 401 TEST_KEY_RETIRED, shown as is.
 * A custom base URL is used only when it is set and starts with https://.
 */
export function baseUrl(credentials: RelayCredentials): string {
	if (credentials.environment === 'sandbox' || isSandboxKey(String(credentials.apiKey ?? '')))
		return SANDBOX_BASE_URL;
	if (credentials.environment === 'custom') {
		const custom = String(credentials.customBaseUrl ?? '')
			.trim()
			.replace(/\/+$/, '');
		if (/^https:\/\/[^\s/]+/.test(custom)) return custom;
	}
	return PROD_BASE_URL;
}

export async function getRelayCredentials(this: RelayContext): Promise<RelayCredentials> {
	const c = await this.getCredentials('relayApi');
	return {
		apiKey: String(c.apiKey ?? '').trim(),
		environment: (c.environment as RelayCredentials['environment']) ?? 'auto',
		customBaseUrl: c.customBaseUrl ? String(c.customBaseUrl) : undefined,
	};
}

/**
 * One call to the Relay v1 API. Relay answers { success, data } or
 * { success: false, error, code }; a refusal becomes a NodeApiError that keeps
 * Relay's message and code.
 */
export async function relayApiRequest(
	this: RelayContext,
	method: IHttpRequestMethods,
	path: string,
	options: { body?: IDataObject; qs?: IDataObject; headers?: IDataObject } = {},
): Promise<IDataObject> {
	const credentials = await getRelayCredentials.call(this);
	const request: IHttpRequestOptions = {
		method,
		url: `${baseUrl(credentials)}${path}`,
		json: true,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
		headers: { Accept: 'application/json', ...(options.headers ?? {}) },
	};
	if (options.qs && Object.keys(options.qs).length) request.qs = options.qs;
	if (options.body !== undefined) request.body = options.body;

	const response = (await this.helpers.httpRequestWithAuthentication.call(
		this,
		'relayApi',
		request,
	)) as { statusCode?: number; body?: unknown };

	const status = Number(response?.statusCode ?? 0);
	const payload = (response?.body ?? {}) as IDataObject;
	if (status >= 200 && status < 300 && payload.success !== false) {
		return (payload.data ?? payload) as IDataObject;
	}
	const message = String(payload.error ?? payload.message ?? `Relay answered HTTP ${status}`);
	const code = payload.code ? String(payload.code) : undefined;
	throw new NodeApiError(this.getNode(), payload as JsonObject, {
		message: code ? `${message} (${code})` : message,
		httpCode: String(status || ''),
		description: payload.details ? JSON.stringify(payload.details) : undefined,
	});
}

// ─── Request bodies ─────────────────────────────────────────────────────────

export interface CreateDeliveryInput {
	orderId: string;
	clientName: string;
	clientPhone: string;
	deliveryAddress: string;
	additional: IDataObject;
}

const SHOP_ONLY = new Set(['quote_id', 'delivery_payer', 'metadata', 'test']);
const AGENCY_ONLY = new Set([
	'assignment_mode',
	'is_cod',
	'priority_level',
	'require_pickup_qr',
	'require_delivery_qr',
]);

function clean(obj: IDataObject): IDataObject {
	const out: IDataObject = {};
	for (const [k, v] of Object.entries(obj)) {
		if (v === undefined || v === null || v === '') continue;
		out[k] = v;
	}
	return out;
}

function parseMetadata(value: unknown): IDataObject | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	if (typeof value === 'object' && !Array.isArray(value)) return value as IDataObject;
	if (typeof value === 'string') {
		const parsed = JSON.parse(value) as unknown;
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
			return parsed as IDataObject;
	}
	throw new Error('Metadata must be a JSON object');
}

/**
 * Builds the POST /packages body for the key type.
 *  - shop:   platform_order_id + client_address (the order id makes the call idempotent)
 *  - agency: external_order_id + client_address + delivery_address (both ≥ 10 characters),
 *            and the order id is also sent as the Idempotency-Key header.
 * Fields the key type does not accept are left out.
 */
export function buildCreateRequest(
	kind: RelayKeyKind,
	input: CreateDeliveryInput,
): { body: IDataObject; headers: IDataObject; dropped: string[] } {
	const a = { ...input.additional };
	const dropped: string[] = [];
	const metadata = parseMetadata(a.metadata);
	delete a.metadata;

	const common: IDataObject = clean({
		client_name: input.clientName,
		client_phone: input.clientPhone,
		client_address: input.deliveryAddress,
		...a,
	});
	if (metadata) common.metadata = metadata;

	for (const k of Object.keys(common)) {
		if ((kind === 'shop' && AGENCY_ONLY.has(k)) || (kind === 'agency' && SHOP_ONLY.has(k))) {
			dropped.push(k);
			delete common[k];
		}
	}

	if (kind === 'shop') {
		return {
			body: { platform_order_id: input.orderId, ...common },
			headers: {},
			dropped,
		};
	}
	const body: IDataObject = { ...common, delivery_address: input.deliveryAddress };
	if (input.orderId) body.external_order_id = input.orderId;
	return {
		body,
		headers: input.orderId ? { 'Idempotency-Key': input.orderId } : {},
		dropped,
	};
}

/** Shop keys read `reason`, agency keys read `cancellation_reason`. */
export function buildCancelBody(kind: RelayKeyKind, reason: string): IDataObject {
	const r = reason.trim() || 'Cancelled from n8n';
	return kind === 'shop' ? { reason: r } : { cancellation_reason: r };
}

export interface EstimateInput {
	deliveryLat?: number;
	deliveryLng?: number;
	/** Shop keys: written address, geocoded by Relay when no coordinates are sent. */
	deliveryAddress?: string;
	pickupLat?: number;
	pickupLng?: number;
	weightKg?: number;
	deliveryType?: string;
}

/** Shops may leave the pickup out (their saved pickup point is used); agencies must send it. */
export function buildEstimateQuery(kind: RelayKeyKind, e: EstimateInput): IDataObject {
	const hasPickup = isNum(e.pickupLat) && isNum(e.pickupLng);
	// 0,0 is the empty default of the number fields, not a real delivery point.
	const hasDelivery =
		isNum(e.deliveryLat) && isNum(e.deliveryLng) && !(e.deliveryLat === 0 && e.deliveryLng === 0);
	const address = kind === 'shop' ? (e.deliveryAddress ?? '').trim() : '';
	if (kind === 'agency' && !hasPickup) {
		throw new Error('Agency keys need the pickup latitude and longitude for an estimate');
	}
	if (!hasDelivery && !address) {
		throw new Error(
			kind === 'shop'
				? 'Send the delivery latitude and longitude, or a delivery address'
				: 'Agency keys need the delivery latitude and longitude for an estimate',
		);
	}
	return clean({
		delivery_lat: hasDelivery ? e.deliveryLat : undefined,
		delivery_lng: hasDelivery ? e.deliveryLng : undefined,
		delivery_address: !hasDelivery && address ? address : undefined,
		pickup_lat: hasPickup ? e.pickupLat : undefined,
		pickup_lng: hasPickup ? e.pickupLng : undefined,
		weight_kg: isNum(e.weightKg) && (e.weightKg as number) > 0 ? e.weightKg : undefined,
		delivery_type: e.deliveryType || undefined,
	});
}

function isNum(v: unknown): boolean {
	return typeof v === 'number' && Number.isFinite(v);
}

// ─── Responses ──────────────────────────────────────────────────────────────

/**
 * One shape for both key types: shop rows are flat, agency rows keep the
 * package under `packages{}` next to the agency fields. The flat result always
 * has tracking_code, status, order_id and key_type.
 */
export function normalizePackage(kind: RelayKeyKind, row: IDataObject): IDataObject {
	if (kind === 'shop') {
		return {
			key_type: 'shop',
			order_id: row.platform_order_id ?? null,
			...row,
		};
	}
	const nested = (Array.isArray(row.packages) ? row.packages[0] : row.packages) as
		| IDataObject
		| undefined;
	if (!nested || typeof nested !== 'object') {
		return { key_type: 'agency', order_id: row.external_order_id ?? null, ...row };
	}
	const { packages: _omit, id: partnerPackageId, ...agencyFields } = row;
	void _omit;
	return {
		key_type: 'agency',
		order_id: row.external_order_id ?? null,
		...agencyFields,
		...nested,
		partner_package_id: partnerPackageId,
	};
}

export function packagesFromList(data: IDataObject): IDataObject[] {
	const list = data.packages;
	return Array.isArray(list) ? (list as IDataObject[]) : [];
}
