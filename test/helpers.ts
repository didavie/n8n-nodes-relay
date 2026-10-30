import type { IDataObject, IHttpRequestOptions, INode } from 'n8n-workflow';

export interface Captured {
	credentialType: string;
	options: IHttpRequestOptions;
}

export type Responder = (options: IHttpRequestOptions) => { statusCode: number; body: unknown };

const NODE: INode = {
	id: 'test',
	name: 'Relay',
	type: 'n8n-nodes-relay.relay',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

/**
 * A minimal IExecuteFunctions / IPollFunctions stand-in: parameters come from
 * a plain object, HTTP goes to `responder` (mock) and every call is captured.
 */
export function fakeContext(opts: {
	credentials: IDataObject;
	params: IDataObject | IDataObject[];
	responder: Responder;
	mode?: 'manual' | 'trigger';
	staticData?: IDataObject;
	continueOnFail?: boolean;
}) {
	const calls: Captured[] = [];
	const paramsFor = (i: number) => (Array.isArray(opts.params) ? opts.params[i] : opts.params);
	const items = Array.isArray(opts.params) ? opts.params.map(() => ({ json: {} })) : [{ json: {} }];
	const staticData = opts.staticData ?? {};

	const ctx = {
		getInputData: () => items,
		getNode: () => NODE,
		getMode: () => opts.mode ?? 'trigger',
		continueOnFail: () => opts.continueOnFail === true,
		getCredentials: async () => opts.credentials,
		getWorkflowStaticData: () => staticData,
		getNodeParameter: (name: string, a?: unknown, b?: unknown) => {
			// execute: (name, itemIndex, fallback); poll: (name, fallback)
			const index = typeof a === 'number' ? a : 0;
			const fallback = typeof a === 'number' ? b : a;
			const p = paramsFor(index) ?? {};
			return name in p ? p[name] : fallback;
		},
		helpers: {
			httpRequestWithAuthentication: async function (
				credentialType: string,
				options: IHttpRequestOptions,
			) {
				calls.push({ credentialType, options });
				return opts.responder(options);
			},
			returnJsonArray: (data: IDataObject[]) => data.map((json) => ({ json })),
		},
	};
	return { ctx, calls, staticData };
}

export const ok = (data: unknown, statusCode = 200) => ({
	statusCode,
	body: { success: true, data },
});
