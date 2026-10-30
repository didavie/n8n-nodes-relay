// Live check against a Relay environment with a real key, through the built
// node's own execute() / poll(). Usage (after `npm run build`):
//
//   RELAY_CREDENTIALS_FILE=/path/to/creds.json node scripts/live-check.mjs
//
// creds.json: { "apiKey": "rb_sbx_…", "environment": "auto" }  (keep it out of git)
// Use a sandbox or test key: the script creates one delivery and cancels it.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Relay } = require('../dist/nodes/Relay/Relay.node.js');
const { RelayTrigger } = require('../dist/nodes/RelayTrigger/RelayTrigger.node.js');
const { baseUrl } = require('../dist/nodes/Relay/GenericFunctions.js');

const file = process.env.RELAY_CREDENTIALS_FILE;
if (!file) throw new Error('Set RELAY_CREDENTIALS_FILE');
const credentials = JSON.parse(readFileSync(file, 'utf8'));
if (!/_(test|sbx)_/.test(String(credentials.apiKey)))
	throw new Error('Use a test or sandbox key for the live check');

/** What n8n does for httpRequestWithAuthentication with the RelayApi credential. */
async function httpRequestWithAuthentication(_type, o) {
	// RELAY_SANDBOX_URL points the sandbox host at another copy of the sandbox (optional).
	const sandboxUrl = process.env.RELAY_SANDBOX_URL;
	const url = new URL(
		sandboxUrl
			? o.url.replace('https://relaysandbox.didavie.com', sandboxUrl.replace(/\/+$/, ''))
			: o.url,
	);
	for (const [k, v] of Object.entries(o.qs ?? {})) url.searchParams.set(k, String(v));
	const res = await fetch(url, {
		method: o.method,
		headers: {
			...(o.headers ?? {}),
			Authorization: `Bearer ${credentials.apiKey}`,
			...(o.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
		},
		body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
	});
	const text = await res.text();
	let body;
	try {
		body = JSON.parse(text);
	} catch {
		body = text;
	}
	return { statusCode: res.status, body };
}

const staticData = {};
function ctx(params, mode = 'trigger') {
	return {
		getInputData: () => [{ json: {} }],
		getNode: () => ({
			id: 'live',
			name: 'Relay',
			type: 'n8n-nodes-relay.relay',
			typeVersion: 1,
			position: [0, 0],
			parameters: {},
		}),
		getMode: () => mode,
		continueOnFail: () => false,
		getCredentials: async () => credentials,
		getWorkflowStaticData: () => staticData,
		getNodeParameter: (name, a, b) => {
			const fallback = typeof a === 'number' ? b : a;
			return name in params ? params[name] : fallback;
		},
		helpers: {
			httpRequestWithAuthentication,
			returnJsonArray: (d) => d.map((json) => ({ json })),
		},
	};
}

const node = new Relay();
const trigger = new RelayTrigger();
const exec = async (params) => (await node.execute.call(ctx(params)))[0].map((x) => x.json);
const results = [];
const check = (name, cond, detail = '') => {
	results.push({ name, ok: Boolean(cond) });
	console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

console.log(`Host: ${baseUrl(credentials)}`);

// Credential test request, as n8n would send it.
const me = await httpRequestWithAuthentication('relayApi', {
	method: 'GET',
	url: `${baseUrl(credentials)}/me`,
});
check(
	'credential test GET /me',
	me.statusCode === 200 && me.body?.data?.key_type,
	`key_type=${me.body?.data?.key_type} mode=${me.body?.data?.mode}`,
);

// Trigger baseline.
const triggerParams = { statuses: [], options: { includeNew: true, scanLimit: 50 } };
check('trigger first poll is silent', (await trigger.poll.call(ctx(triggerParams))) === null);

const est = (
	await exec({
		resource: 'pricing',
		operation: 'estimate',
		deliveryLat: 6.3703,
		deliveryLng: 2.3912,
		estimateFields: { weightKg: 1 },
	})
)[0];
check(
	'pricing estimate',
	est.price_fcfa > 0 || est.min_delivery_fee_fcfa > 0,
	`price=${est.price_fcfa ?? est.min_delivery_fee_fcfa} quote=${est.quote_id ? 'yes' : 'no'}`,
);

const byAddress = (
	await exec({
		resource: 'pricing',
		operation: 'estimate',
		deliveryLat: 0,
		deliveryLng: 0,
		estimateFields: { deliveryAddress: 'Haie Vive, Cotonou' },
	})
)[0];
check(
	'pricing estimate by delivery address',
	byAddress.price_fcfa > 0,
	`price=${byAddress.price_fcfa} geocoded=${byAddress.geocoded}`,
);

const orderId = `n8n-live-${Date.now()}`;
const createParams = {
	resource: 'delivery',
	operation: 'create',
	orderId,
	clientName: 'n8n live check',
	clientPhone: '+2290197000001',
	deliveryAddress: 'Carrefour Saint Michel, Cotonou (n8n live check)',
	additionalFields: {
		delivery_latitude: 6.3703,
		delivery_longitude: 2.3912,
		description: 'n8n live check, cancel me',
		quote_id: est.quote_id,
		metadata: '{"source":"n8n-live-check"}',
	},
};
const created = (await exec(createParams))[0];
check(
	'create delivery',
	created.tracking_code && created.idempotent === false,
	`tracking=${created.tracking_code} status=${created.status}`,
);

const again = (
	await exec({
		...createParams,
		additionalFields: { ...createParams.additionalFields, quote_id: undefined },
	})
)[0];
check(
	'create again with same order id is idempotent',
	again.tracking_code === created.tracking_code && again.idempotent === true,
);

const got = (
	await exec({
		resource: 'delivery',
		operation: 'get',
		trackingCode: created.tracking_code,
		simplify: true,
	})
)[0];
check(
	'get delivery (simplified)',
	got.tracking_code === created.tracking_code && got.order_id === orderId,
	`status=${got.status}`,
);
check(
	'get returns the public tracking_url',
	typeof got.tracking_url === 'string' && got.tracking_url.startsWith('http'),
);
check('trigger keeps lastPollAt for updated_since', typeof staticData.lastPollAt === 'string');

const list = await exec({
	resource: 'delivery',
	operation: 'getAll',
	returnAll: false,
	limit: 5,
	simplify: true,
	filters: {},
});
check(
	'get many includes the new delivery',
	list.some((p) => p.tracking_code === created.tracking_code),
	`${list.length} rows`,
);

const polled = await trigger.poll.call(ctx(triggerParams));
const createdEvt = polled?.[0].find((x) => x.json.tracking_code === created.tracking_code);
check('trigger emits the new delivery (includeNew)', createdEvt?.json.event === 'created');

const cancelled = (
	await exec({
		resource: 'delivery',
		operation: 'cancel',
		trackingCode: created.tracking_code,
		reason: 'n8n live check',
	})
)[0];
check(
	'cancel delivery',
	cancelled.status === 'cancelled' ||
		cancelled.package_status === 'cancelled' ||
		cancelled.cancelled === true,
	JSON.stringify(cancelled).slice(0, 160),
);

const after = (
	await exec({
		resource: 'delivery',
		operation: 'get',
		trackingCode: created.tracking_code,
		simplify: true,
	})
)[0];
check('status is cancelled after cancel', after.status === 'cancelled', `status=${after.status}`);

const polled2 = await trigger.poll.call(ctx(triggerParams));
const evt = polled2?.[0].find((x) => x.json.tracking_code === created.tracking_code);
check(
	'trigger emits the status change once',
	evt?.json.status === 'cancelled' && evt?.json.previous_status,
	`previous=${evt?.json.previous_status}`,
);
check('trigger dedupes on the next poll', (await trigger.poll.call(ctx(triggerParams))) === null);

try {
	await exec({
		resource: 'delivery',
		operation: 'get',
		trackingCode: 'RB-DOES-NOT-EXIST',
		simplify: true,
	});
	check('unknown tracking code raises a Relay error', false);
} catch (e) {
	check('unknown tracking code raises a Relay error', /NOT_FOUND/.test(e.message), e.message);
}

const failed = results.filter((r) => !r.ok).length;
console.log(
	`\n${results.length - failed}/${results.length} passed. Test delivery ${created.tracking_code} (${orderId}) cancelled: ${after.status === 'cancelled'}`,
);
process.exit(failed ? 1 : 0);
