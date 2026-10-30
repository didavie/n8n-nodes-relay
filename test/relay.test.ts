import { describe, expect, it } from 'vitest';
import type { IExecuteFunctions, IPollFunctions } from 'n8n-workflow';

import { Relay } from '../nodes/Relay/Relay.node';
import { RelayTrigger } from '../nodes/RelayTrigger/RelayTrigger.node';
import { diffStatuses, MEMORY_CAP } from '../nodes/RelayTrigger/poll';
import {
	baseUrl,
	keyKind,
	normalizePackage,
	PROD_BASE_URL,
	SANDBOX_BASE_URL,
} from '../nodes/Relay/GenericFunctions';
import { RelayApi } from '../credentials/RelayApi.credentials';
import { fakeContext, ok } from './helpers';

const SHOP_KEY = 'rb_test_' + 'a'.repeat(48);
const SHOP_LIVE_KEY = 'rb_live_' + 'b'.repeat(48);
const AGENCY_KEY = 'relay_pk_live_' + 'c'.repeat(40);
const AGENCY_TEST_KEY = 'relay_pk_test_' + 'd'.repeat(40);

const createParams = {
	resource: 'delivery',
	operation: 'create',
	orderId: '1042',
	clientName: 'Awa Dossou',
	clientPhone: '+22901970000000',
	deliveryAddress: 'Rue 12.045, Fidjrosse, Cotonou',
	additionalFields: {
		weight_kg: 2,
		delivery_latitude: 6.36,
		delivery_longitude: 2.39,
		quote_id: '833324c9-56e9-4038-af1c-0c31fe3b22a9',
		assignment_mode: 'hybrid',
		metadata: '{"source":"n8n"}',
	},
};

async function run(credentials: object, params: object | object[], responder = () => ok({})) {
	const f = fakeContext({ credentials: credentials as never, params: params as never, responder });
	const out = await new Relay().execute.call(f.ctx as unknown as IExecuteFunctions);
	return { out: out[0].map((x) => x.json), calls: f.calls };
}

describe('key type and host', () => {
	it('detects shop and agency keys', () => {
		expect(keyKind(SHOP_KEY)).toBe('shop');
		expect(keyKind(SHOP_LIVE_KEY)).toBe('shop');
		expect(keyKind(AGENCY_KEY)).toBe('agency');
	});
	it('picks the host from the key unless forced', () => {
		expect(baseUrl({ apiKey: SHOP_KEY, environment: 'auto' })).toBe(PROD_BASE_URL);
		expect(baseUrl({ apiKey: AGENCY_TEST_KEY })).toBe(PROD_BASE_URL);
		expect(baseUrl({ apiKey: SHOP_LIVE_KEY, environment: 'auto' })).toBe(PROD_BASE_URL);
		expect(baseUrl({ apiKey: SHOP_KEY, environment: 'production' })).toBe(PROD_BASE_URL);
		// Older stored value: behaves like automatic.
		expect(baseUrl({ apiKey: AGENCY_KEY, environment: 'development' })).toBe(PROD_BASE_URL);
	});
	it('uses a custom https base URL only when it is set', () => {
		const custom = 'https://api.example.test/api/v1';
		expect(baseUrl({ apiKey: SHOP_KEY, environment: 'custom', customBaseUrl: `${custom}/` })).toBe(
			custom,
		);
		expect(
			baseUrl({
				apiKey: SHOP_KEY,
				environment: 'custom',
				customBaseUrl: 'http://api.example.test/api/v1',
			}),
		).toBe(PROD_BASE_URL);
		expect(baseUrl({ apiKey: SHOP_KEY, environment: 'custom' })).toBe(PROD_BASE_URL);
		expect(
			baseUrl({ apiKey: 'rb_sbx_' + 'e'.repeat(48), environment: 'custom', customBaseUrl: custom }),
		).toBe(SANDBOX_BASE_URL);
	});

	it('routes sandbox keys to relaysandbox.didavie.com whatever the environment', () => {
		const sbxShop = 'rb_sbx_' + 'e'.repeat(48);
		const sbxAgency = 'relay_pk_sbx_' + 'f'.repeat(64);
		expect(SANDBOX_BASE_URL).toBe('https://relaysandbox.didavie.com/api/v1');
		expect(keyKind(sbxShop)).toBe('shop');
		expect(keyKind(sbxAgency)).toBe('agency');
		expect(baseUrl({ apiKey: 'rb_live_' + 'a'.repeat(48), environment: 'sandbox' })).toBe(
			SANDBOX_BASE_URL,
		);
		for (const environment of ['auto', 'production', 'sandbox', 'custom'] as const) {
			expect(baseUrl({ apiKey: sbxShop, environment })).toBe(SANDBOX_BASE_URL);
			expect(baseUrl({ apiKey: sbxAgency, environment })).toBe(SANDBOX_BASE_URL);
		}
	});
	it('credential test calls GET /me with a Bearer header', () => {
		const c = new RelayApi();
		expect(c.test.request.url).toBe('/me');
		expect(c.test.request.method).toBe('GET');
		expect(String(c.test.request.baseURL)).toContain('https://relaypartner.didavie.com/api/v1');
		expect(String(c.test.request.baseURL)).toContain('https://relaysandbox.didavie.com/api/v1');
		expect(c.authenticate.properties.headers?.Authorization).toBe(
			'=Bearer {{$credentials.apiKey}}',
		);
	});
});

describe('Delivery › Create', () => {
	it('shop key: platform_order_id, client_address, shop-only fields kept, agency-only dropped', async () => {
		const { out, calls } = await run({ apiKey: SHOP_KEY, environment: 'auto' }, createParams, () =>
			ok({ tracking_code: 'RB1', status: 'registered', platform_order_id: '1042' }, 201),
		);
		expect(calls).toHaveLength(1);
		const o = calls[0].options;
		expect(calls[0].credentialType).toBe('relayApi');
		expect(o.method).toBe('POST');
		expect(o.url).toBe(`${PROD_BASE_URL}/packages`);
		expect(o.body).toEqual({
			platform_order_id: '1042',
			client_name: 'Awa Dossou',
			client_phone: '+22901970000000',
			client_address: 'Rue 12.045, Fidjrosse, Cotonou',
			weight_kg: 2,
			delivery_latitude: 6.36,
			delivery_longitude: 2.39,
			quote_id: '833324c9-56e9-4038-af1c-0c31fe3b22a9',
			metadata: { source: 'n8n' },
		});
		expect(o.headers).not.toHaveProperty('Idempotency-Key');
		expect(out[0]).toMatchObject({
			key_type: 'shop',
			tracking_code: 'RB1',
			ignored_fields: ['assignment_mode'],
		});
	});

	it('agency key: external_order_id, both addresses, Idempotency-Key header, shop-only dropped', async () => {
		const { out, calls } = await run(
			{ apiKey: AGENCY_KEY, environment: 'auto' },
			createParams,
			() =>
				ok({ id: 'p1', tracking_code: 'RL1', status: 'pending', external_order_id: '1042' }, 201),
		);
		const o = calls[0].options;
		expect(o.url).toBe(`${PROD_BASE_URL}/packages`);
		expect(o.headers).toMatchObject({ 'Idempotency-Key': '1042' });
		expect(o.body).toEqual({
			external_order_id: '1042',
			client_name: 'Awa Dossou',
			client_phone: '+22901970000000',
			client_address: 'Rue 12.045, Fidjrosse, Cotonou',
			delivery_address: 'Rue 12.045, Fidjrosse, Cotonou',
			weight_kg: 2,
			delivery_latitude: 6.36,
			delivery_longitude: 2.39,
			assignment_mode: 'hybrid',
		});
		expect(out[0]).toMatchObject({ key_type: 'agency', tracking_code: 'RL1' });
		expect((out[0].ignored_fields as string[]).sort()).toEqual(['metadata', 'quote_id']);
	});

	it('keeps Relay error message and code', async () => {
		await expect(
			run({ apiKey: SHOP_KEY }, createParams, () => ({
				statusCode: 429,
				body: { success: false, error: 'Daily limit reached', code: 'DAILY_LIMIT' },
			})),
		).rejects.toThrow(/Daily limit reached \(DAILY_LIMIT\)/);
	});

	it('continueOnFail returns the error as an item', async () => {
		const f = fakeContext({
			credentials: { apiKey: SHOP_KEY },
			params: createParams,
			continueOnFail: true,
			responder: () => ({
				statusCode: 401,
				body: { success: false, error: 'Invalid key', code: 'INVALID_API_KEY' },
			}),
		});
		const out = await new Relay().execute.call(f.ctx as unknown as IExecuteFunctions);
		expect(out[0][0].json.error).toMatch(/INVALID_API_KEY/);
	});

	it('rejects metadata that is not a JSON object', async () => {
		await expect(
			run({ apiKey: SHOP_KEY }, { ...createParams, additionalFields: { metadata: '[1,2]' } }),
		).rejects.toThrow(/Metadata must be a JSON object/);
	});
});

describe('Delivery › Cancel / Get / Get Many', () => {
	it('cancel sends reason (shop) or cancellation_reason (agency)', async () => {
		const p = {
			resource: 'delivery',
			operation: 'cancel',
			trackingCode: 'RB 1',
			reason: 'Customer cancelled',
		};
		const shop = await run({ apiKey: SHOP_KEY }, p, () => ok({ status: 'cancelled' }));
		expect(shop.calls[0].options.method).toBe('PATCH');
		expect(shop.calls[0].options.url).toBe(`${PROD_BASE_URL}/packages/RB%201/cancel`);
		expect(shop.calls[0].options.body).toEqual({ reason: 'Customer cancelled' });
		const agency = await run({ apiKey: AGENCY_KEY }, p, () => ok({ status: 'cancelled' }));
		expect(agency.calls[0].options.body).toEqual({ cancellation_reason: 'Customer cancelled' });
	});

	it('get flattens the agency shape', async () => {
		const agencyRow = {
			id: 'pp1',
			external_order_id: '1042',
			assignment_mode: 'own_fleet',
			packages: { id: 'pk1', tracking_code: 'RL1', status: 'in_transit' },
		};
		const { out } = await run(
			{ apiKey: AGENCY_KEY },
			{ resource: 'delivery', operation: 'get', trackingCode: 'RL1', simplify: true },
			() => ok(agencyRow),
		);
		expect(out[0]).toMatchObject({
			key_type: 'agency',
			order_id: '1042',
			tracking_code: 'RL1',
			status: 'in_transit',
			id: 'pk1',
			partner_package_id: 'pp1',
			assignment_mode: 'own_fleet',
		});
		expect(out[0]).not.toHaveProperty('packages');
	});

	it('get keeps the raw shape when simplify is off', async () => {
		const row = { packages: { tracking_code: 'RL1' } };
		const { out } = await run(
			{ apiKey: AGENCY_KEY },
			{ resource: 'delivery', operation: 'get', trackingCode: 'RL1', simplify: false },
			() => ok(row),
		);
		expect(out[0]).toEqual(row);
	});

	it('shop get adds order_id from platform_order_id', () => {
		expect(
			normalizePackage('shop', { tracking_code: 'RB1', platform_order_id: '7' }),
		).toMatchObject({
			key_type: 'shop',
			order_id: '7',
		});
	});

	it('get many pages by 100 until the limit, passes the status filter', async () => {
		let served = 0;
		const { out, calls } = await run(
			{ apiKey: SHOP_KEY },
			{
				resource: 'delivery',
				operation: 'getAll',
				returnAll: false,
				limit: 150,
				filters: { status: 'delivered' },
			},
			(o) => {
				const qs = o.qs as { limit: number; offset: number };
				const rows = Array.from({ length: qs.limit }, (_, k) => ({
					tracking_code: `RB${qs.offset + k}`,
					status: 'delivered',
				}));
				served += rows.length;
				return ok({ packages: rows, total: 500, limit: qs.limit, offset: qs.offset });
			},
		);
		expect(calls.map((c) => c.options.qs)).toEqual([
			{ limit: 100, offset: 0, status: 'delivered' },
			{ limit: 50, offset: 100, status: 'delivered' },
		]);
		expect(out).toHaveLength(150);
		expect(served).toBe(150);
	});

	it('return all stops at the total', async () => {
		const { out, calls } = await run(
			{ apiKey: SHOP_KEY },
			{ resource: 'delivery', operation: 'getAll', returnAll: true },
			(o) => {
				const qs = o.qs as { limit: number; offset: number };
				const n = Math.max(0, Math.min(qs.limit, 120 - qs.offset));
				return ok({
					packages: Array.from({ length: n }, (_, k) => ({ tracking_code: `X${qs.offset + k}` })),
					total: 120,
				});
			},
		);
		expect(out).toHaveLength(120);
		expect(calls).toHaveLength(2);
	});
});

describe('Pricing › Estimate', () => {
	it('shop key may leave the pickup out', async () => {
		const { calls, out } = await run(
			{ apiKey: SHOP_KEY },
			{
				resource: 'pricing',
				operation: 'estimate',
				deliveryLat: 6.37,
				deliveryLng: 2.43,
				estimateFields: { weightKg: 2 },
			},
			() => ok({ quote_id: 'q1', price_fcfa: 1860 }),
		);
		expect(calls[0].options.url).toBe(`${PROD_BASE_URL}/pricing/estimate`);
		expect(calls[0].options.qs).toEqual({ delivery_lat: 6.37, delivery_lng: 2.43, weight_kg: 2 });
		expect(out[0]).toMatchObject({ key_type: 'shop', quote_id: 'q1' });
	});

	it('agency key needs the pickup and sends four coordinates', async () => {
		await expect(
			run(
				{ apiKey: AGENCY_KEY },
				{
					resource: 'pricing',
					operation: 'estimate',
					deliveryLat: 6.37,
					deliveryLng: 2.43,
					estimateFields: {},
				},
			),
		).rejects.toThrow(/pickup latitude and longitude/);
		const { calls } = await run(
			{ apiKey: AGENCY_KEY },
			{
				resource: 'pricing',
				operation: 'estimate',
				deliveryLat: 6.37,
				deliveryLng: 2.43,
				estimateFields: { pickupLat: 6.36, pickupLng: 2.42, deliveryType: 'express' },
			},
			() => ok({ min_delivery_fee_fcfa: 1500 }),
		);
		expect(calls[0].options.qs).toEqual({
			delivery_lat: 6.37,
			delivery_lng: 2.43,
			pickup_lat: 6.36,
			pickup_lng: 2.42,
			delivery_type: 'express',
		});
	});
});

describe('Relay Trigger', () => {
	it('diffStatuses: first poll is silent, then emits each change once', () => {
		const a = [
			{ tracking_code: 'A', status: 'registered' },
			{ tracking_code: 'B', status: 'pending' },
		];
		const first = diffStatuses(undefined, a, { includeNew: false, statuses: [] });
		expect(first.changed).toEqual([]);
		const b = [
			{ tracking_code: 'A', status: 'picked_up' },
			{ tracking_code: 'B', status: 'pending' },
			{ tracking_code: 'C', status: 'registered' },
		];
		const second = diffStatuses(first.memory, b, { includeNew: false, statuses: [] });
		expect(second.changed).toEqual([
			{
				tracking_code: 'A',
				status: 'picked_up',
				previous_status: 'registered',
				event: 'status_changed',
			},
		]);
		const third = diffStatuses(second.memory, b, { includeNew: false, statuses: [] });
		expect(third.changed).toEqual([]);
	});

	it('diffStatuses: status filter and new deliveries', () => {
		const mem = { A: 'registered' };
		const now = [
			{ tracking_code: 'A', status: 'picked_up' },
			{ tracking_code: 'N', status: 'registered' },
		];
		expect(diffStatuses(mem, now, { includeNew: false, statuses: ['delivered'] }).changed).toEqual(
			[],
		);
		const r = diffStatuses(mem, now, { includeNew: true, statuses: [] });
		expect(r.changed.map((c) => [c.tracking_code, c.event])).toEqual([
			['A', 'status_changed'],
			['N', 'created'],
		]);
	});

	it('diffStatuses: memory keeps old entries up to the cap', () => {
		const prev: Record<string, string> = {};
		for (let k = 0; k < MEMORY_CAP + 50; k++) prev[`T${k}`] = 'delivered';
		const r = diffStatuses(prev, [{ tracking_code: 'NEW', status: 'pending' }], {
			includeNew: false,
			statuses: [],
		});
		expect(Object.keys(r.memory)).toHaveLength(MEMORY_CAP);
		expect(r.memory.NEW).toBe('pending');
	});

	it('poll: remembers statuses in static data and emits changes', async () => {
		let status = 'registered';
		const responder = () =>
			ok({ packages: [{ tracking_code: 'RB1', status, platform_order_id: '9' }], total: 1 });
		const staticData = {};
		const make = () =>
			fakeContext({
				credentials: { apiKey: SHOP_KEY },
				params: { statuses: [], options: {} },
				responder,
				staticData,
			});
		const t = new RelayTrigger();
		expect(await t.poll.call(make().ctx as unknown as IPollFunctions)).toBeNull();
		status = 'delivered';
		const r = await t.poll.call(make().ctx as unknown as IPollFunctions);
		expect(r?.[0][0].json).toMatchObject({
			tracking_code: 'RB1',
			status: 'delivered',
			previous_status: 'registered',
			order_id: '9',
		});
		expect(await t.poll.call(make().ctx as unknown as IPollFunctions)).toBeNull();
	});

	it('poll in manual mode returns a sample without moving the memory', async () => {
		const f = fakeContext({
			credentials: { apiKey: SHOP_KEY },
			params: { statuses: [], options: {} },
			mode: 'manual',
			responder: () => ok({ packages: [{ tracking_code: 'RB1', status: 'delivered' }] }),
		});
		const r = await new RelayTrigger().poll.call(f.ctx as unknown as IPollFunctions);
		expect(r?.[0][0].json.tracking_code).toBe('RB1');
		expect(f.staticData).toEqual({});
	});
});

describe('updated_since (shop keys)', () => {
	it('sinceParam: shop keys after the first poll only, with 2 minutes overlap', async () => {
		const { sinceParam } = await import('../nodes/RelayTrigger/poll');
		expect(sinceParam('shop', true, '2026-10-29T12:00:00.000Z')).toBe('2026-10-29T11:58:00.000Z');
		expect(sinceParam('shop', false, '2026-10-29T12:00:00.000Z')).toBeUndefined();
		expect(sinceParam('agency', true, '2026-10-29T12:00:00.000Z')).toBeUndefined();
		expect(sinceParam('shop', true, undefined)).toBeUndefined();
	});

	it('an old delivery missing from memory counts as a status change, not a new one', () => {
		const r = diffStatuses(
			{ A: 'registered' },
			[
				{ tracking_code: 'OLD', status: 'delivered', created_at: '2026-10-01T10:00:00Z' },
				{ tracking_code: 'NEW', status: 'registered', created_at: '2026-10-29T12:01:00Z' },
			],
			{ includeNew: false, statuses: [], createdBefore: '2026-10-29T12:00:00Z' },
		);
		expect(r.changed.map((c) => [c.tracking_code, c.event, c.previous_status])).toEqual([
			['OLD', 'status_changed', null],
		]);
	});

	it('poll sends updated_since from the second poll on (shop) and never for agency keys', async () => {
		const seen: unknown[] = [];
		const responder = (o: { qs?: unknown }) => {
			seen.push(o.qs);
			return ok({ packages: [], total: 0 });
		};
		const staticData = {};
		const t = new RelayTrigger();
		for (let k = 0; k < 2; k++) {
			const f = fakeContext({
				credentials: { apiKey: SHOP_KEY },
				params: { statuses: [], options: {} },
				responder: responder as never,
				staticData,
			});
			await t.poll.call(f.ctx as unknown as IPollFunctions);
		}
		expect(seen[0]).not.toHaveProperty('updated_since');
		expect(seen[1]).toHaveProperty('updated_since');
		const agencySeen: unknown[] = [];
		const agencyData = {};
		for (let k = 0; k < 2; k++) {
			const f = fakeContext({
				credentials: { apiKey: AGENCY_KEY },
				params: { statuses: [], options: {} },
				responder: ((o: { qs?: unknown }) => (
					agencySeen.push(o.qs),
					ok({ packages: [] })
				)) as never,
				staticData: agencyData,
			});
			await t.poll.call(f.ctx as unknown as IPollFunctions);
		}
		expect(agencySeen[1]).not.toHaveProperty('updated_since');
	});
});

describe('estimate by address (shop keys)', () => {
	it('sends delivery_address when the coordinates are left at 0', async () => {
		const { calls } = await run(
			{ apiKey: SHOP_KEY },
			{
				resource: 'pricing',
				operation: 'estimate',
				deliveryLat: 0,
				deliveryLng: 0,
				estimateFields: { deliveryAddress: 'Haie Vive, Cotonou' },
			},
			() => ok({ price_fcfa: 1000 }),
		);
		expect(calls[0].options.qs).toEqual({ delivery_address: 'Haie Vive, Cotonou' });
	});
	it('refuses an estimate with neither coordinates nor address', async () => {
		await expect(
			run(
				{ apiKey: SHOP_KEY },
				{
					resource: 'pricing',
					operation: 'estimate',
					deliveryLat: 0,
					deliveryLng: 0,
					estimateFields: {},
				},
			),
		).rejects.toThrow(/delivery latitude and longitude, or a delivery address/);
	});
});
