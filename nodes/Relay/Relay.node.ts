import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import {
	deliveryFields,
	deliveryOperations,
	pricingFields,
	pricingOperations,
	resourceProperty,
} from './descriptions';
import {
	buildCancelBody,
	buildCreateRequest,
	buildEstimateQuery,
	getRelayCredentials,
	keyKind,
	normalizePackage,
	packagesFromList,
	relayApiRequest,
} from './GenericFunctions';

/**
 * Programmatic style: the same operation needs different request bodies and
 * gives different response shapes for shop keys and agency keys, which the
 * declarative routing cannot express cleanly.
 */
export class Relay implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Relay',
		name: 'relay',
		icon: { light: 'file:../../icons/relay.svg', dark: 'file:../../icons/relay.dark.svg' },
		group: ['output'],
		version: [1],
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Create, track, list and cancel Relay deliveries, and get delivery prices',
		defaults: { name: 'Relay' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [{ name: 'relayApi', required: true }],
		properties: [
			resourceProperty,
			deliveryOperations,
			pricingOperations,
			...deliveryFields,
			...pricingFields,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const credentials = await getRelayCredentials.call(this);
		const kind = keyKind(credentials.apiKey);

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				let result: IDataObject | IDataObject[] = {};

				if (resource === 'delivery' && operation === 'create') {
					const req = buildCreateRequest(kind, {
						orderId: String(this.getNodeParameter('orderId', i)).trim(),
						clientName: this.getNodeParameter('clientName', i) as string,
						clientPhone: this.getNodeParameter('clientPhone', i) as string,
						deliveryAddress: this.getNodeParameter('deliveryAddress', i) as string,
						additional: this.getNodeParameter('additionalFields', i, {}) as IDataObject,
					});
					const data = await relayApiRequest.call(this, 'POST', '/packages', {
						body: req.body,
						headers: req.headers,
					});
					result = { key_type: kind, ...data };
					if (req.dropped.length) result.ignored_fields = req.dropped;
				} else if (resource === 'delivery' && operation === 'get') {
					const tracking = String(this.getNodeParameter('trackingCode', i)).trim();
					const simplify = this.getNodeParameter('simplify', i, true) as boolean;
					const data = await relayApiRequest.call(
						this,
						'GET',
						`/packages/${encodeURIComponent(tracking)}`,
					);
					result = simplify ? normalizePackage(kind, data) : data;
				} else if (resource === 'delivery' && operation === 'cancel') {
					const tracking = String(this.getNodeParameter('trackingCode', i)).trim();
					const reason = this.getNodeParameter('reason', i, '') as string;
					const data = await relayApiRequest.call(
						this,
						'PATCH',
						`/packages/${encodeURIComponent(tracking)}/cancel`,
						{ body: buildCancelBody(kind, reason) },
					);
					result = { key_type: kind, tracking_code: tracking, ...data };
				} else if (resource === 'delivery' && operation === 'getAll') {
					const returnAll = this.getNodeParameter('returnAll', i) as boolean;
					const limit = returnAll ? Infinity : (this.getNodeParameter('limit', i) as number);
					const simplify = this.getNodeParameter('simplify', i, true) as boolean;
					const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
					const rows: IDataObject[] = [];
					let offset = 0;
					// The API pages by 100 at most.
					while (rows.length < limit) {
						const pageSize = Math.min(100, limit - rows.length);
						const data = await relayApiRequest.call(this, 'GET', '/packages', {
							qs: {
								limit: pageSize,
								offset,
								...(filters.status ? { status: filters.status } : {}),
							},
						});
						const page = packagesFromList(data);
						rows.push(...page);
						offset += page.length;
						const total = Number(data.total ?? 0);
						if (page.length < pageSize || (total && offset >= total)) break;
					}
					result = rows.map((r) => (simplify ? normalizePackage(kind, r) : r));
				} else if (resource === 'pricing' && operation === 'estimate') {
					const f = this.getNodeParameter('estimateFields', i, {}) as IDataObject;
					let qs: IDataObject;
					try {
						qs = buildEstimateQuery(kind, {
							deliveryLat: this.getNodeParameter('deliveryLat', i) as number,
							deliveryLng: this.getNodeParameter('deliveryLng', i) as number,
							pickupLat: f.pickupLat as number | undefined,
							pickupLng: f.pickupLng as number | undefined,
							deliveryAddress: f.deliveryAddress as string | undefined,
							weightKg: f.weightKg as number | undefined,
							deliveryType: f.deliveryType as string | undefined,
						});
					} catch (e) {
						throw new NodeOperationError(this.getNode(), (e as Error).message, { itemIndex: i });
					}
					const data = await relayApiRequest.call(this, 'GET', '/pricing/estimate', { qs });
					result = { key_type: kind, ...data };
				} else {
					throw new NodeOperationError(
						this.getNode(),
						`Unsupported operation "${operation}" for "${resource}"`,
						{ itemIndex: i },
					);
				}

				const list = Array.isArray(result) ? result : [result];
				for (const json of list) returnData.push({ json, pairedItem: { item: i } });
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				if (error instanceof NodeApiError) {
					throw new NodeApiError(this.getNode(), (error.errorResponse ?? {}) as JsonObject, {
						message: error.message,
						description: error.description ?? undefined,
						httpCode: error.httpCode ?? undefined,
						itemIndex: i,
					});
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
