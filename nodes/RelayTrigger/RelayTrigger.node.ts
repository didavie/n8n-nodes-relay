import type {
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IPollFunctions,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

import { STATUS_OPTIONS } from '../Relay/descriptions';
import {
	getRelayCredentials,
	keyKind,
	normalizePackage,
	packagesFromList,
	relayApiRequest,
} from '../Relay/GenericFunctions';
import { diffStatuses, sinceParam, type StatusMemory } from './poll';

/**
 * Polls GET /packages and emits one item per delivery whose status changed
 * since the last poll (deduplicated on tracking code + status).
 *
 * Relay pushes signed webhooks too, but the webhook URL is set by hand on the
 * Boutique / Developers page (there is no subscribe endpoint), so a polling
 * trigger is the one that works without extra setup.
 */
export class RelayTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Relay Trigger',
		name: 'relayTrigger',
		icon: { light: 'file:../../icons/relay.svg', dark: 'file:../../icons/relay.dark.svg' },
		group: ['trigger'],
		version: [1],
		subtitle: 'Delivery status changed',
		description: 'Starts the workflow when a Relay delivery changes status',
		defaults: { name: 'Relay Trigger' },
		polling: true,
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'relayApi', required: true }],
		properties: [
			{
				displayName: 'Statuses',
				name: 'statuses',
				type: 'multiOptions',
				options: STATUS_OPTIONS,
				default: [],
				description: 'Only trigger for these new statuses. Leave empty for every status change.',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Include New Deliveries',
						name: 'includeNew',
						type: 'boolean',
						default: false,
						description:
							'Whether to also trigger when a delivery appears for the first time (created after the trigger was activated)',
					},
					{
						displayName: 'Deliveries Checked per Poll',
						name: 'scanLimit',
						type: 'number',
						typeOptions: { minValue: 10, maxValue: 1000 },
						default: 200,
						description:
							'Agency keys: how many of the most recent deliveries are compared on each poll (older ones are not watched). Shop keys: the most deliveries changed since the last poll that are read per poll.',
					},
				],
			},
		],
	};

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const credentials = await getRelayCredentials.call(this);
		const kind = keyKind(credentials.apiKey);
		const statuses = this.getNodeParameter('statuses', []) as string[];
		const options = this.getNodeParameter('options', {}) as IDataObject;
		const scanLimit = Math.max(10, Math.min(1000, Number(options.scanLimit ?? 200)));
		const isManual = this.getMode() === 'manual';

		const staticData = this.getWorkflowStaticData('node') as {
			statuses?: StatusMemory;
			lastPollAt?: string;
		};
		const pollStartedAt = new Date();
		// Shop keys: only the deliveries changed since the last poll (2 min overlap for clock
		// skew; the memory dedupes). Agency keys: the most recent deliveries.
		const since = sinceParam(
			kind,
			staticData.statuses !== undefined && !isManual,
			staticData.lastPollAt,
		);

		const rows: IDataObject[] = [];
		let offset = 0;
		while (rows.length < scanLimit) {
			const pageSize = Math.min(100, scanLimit - rows.length);
			const data = await relayApiRequest.call(this, 'GET', '/packages', {
				qs: { limit: pageSize, offset, ...(since ? { updated_since: since } : {}) },
			});
			const page = packagesFromList(data);
			rows.push(...page);
			offset += page.length;
			if (page.length < pageSize) break;
		}
		const packages = rows.map((r) => normalizePackage(kind, r));

		const { changed, memory } = diffStatuses(staticData.statuses, packages, {
			includeNew: options.includeNew === true,
			statuses,
			createdBefore: since ? staticData.lastPollAt : undefined,
		});

		if (isManual) {
			// "Fetch test event": show the newest matching delivery without moving the memory.
			const sample = packages.find((p) => !statuses.length || statuses.includes(String(p.status)));
			return sample ? [this.helpers.returnJsonArray([sample])] : null;
		}

		staticData.statuses = memory;
		staticData.lastPollAt = pollStartedAt.toISOString();
		if (!changed.length) return null;
		return [this.helpers.returnJsonArray(changed)];
	}
}
