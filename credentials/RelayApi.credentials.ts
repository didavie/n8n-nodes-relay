import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class RelayApi implements ICredentialType {
	name = 'relayApi';

	displayName = 'Relay API';

	icon: Icon = { light: 'file:../icons/relay.svg', dark: 'file:../icons/relay.dark.svg' };

	documentationUrl = 'https://relaypartner.didavie.com/en/developers';

	properties: INodeProperties[] = [
		{
			displayName:
				'Testing? Create a free account on <a href="https://relaysandbox.didavie.com" target="_blank">relaysandbox.didavie.com</a> and paste its key here (rb_sbx_… or relay_pk_sbx_…). Sandbox keys go to the API sandbox automatically: fake deliveries, no URL to change.',
			name: 'sandboxNotice',
			type: 'notice',
			default: '',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'A shop key (rb_live_…, from Partners › Shop › Connect my website) or an agency key (relay_pk_…, from the Developers page of the agency dashboard). Sandbox keys (rb_sbx_…, relay_pk_sbx_…, from relaysandbox.didavie.com) always use the API sandbox.',
		},
		{
			displayName: 'Environment',
			name: 'environment',
			type: 'options',
			options: [
				{
					name: 'Automatic (From the Key)',
					value: 'auto',
					description:
						'Sandbox keys (rb_sbx_, relay_pk_sbx_) use relaysandbox.didavie.com; live keys use relaypartner.didavie.com',
				},
				{
					name: 'Production',
					value: 'production',
					description: 'https://relaypartner.didavie.com (live keys)',
				},
				{
					name: 'API Sandbox',
					value: 'sandbox',
					description:
						'https://relaysandbox.didavie.com (fake deliveries; rb_sbx_ and relay_pk_sbx_ keys)',
				},
				{
					name: 'Custom URL',
					value: 'custom',
					description: 'Only when Relay gives you another API address',
				},
			],
			default: 'auto',
		},
		{
			displayName: 'Base URL',
			name: 'customBaseUrl',
			type: 'string',
			default: '',
			placeholder: 'https://example.com/api/v1',
			description:
				'Full https address of the API, ending in /api/v1. Sandbox keys still use the sandbox.',
			displayOptions: { show: { environment: ['custom'] } },
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL:
				'={{ $credentials.environment === "sandbox" || String($credentials.apiKey).startsWith("rb_sbx_") || String($credentials.apiKey).startsWith("relay_pk_sbx_") ? "https://relaysandbox.didavie.com/api/v1" : $credentials.environment === "custom" && String($credentials.customBaseUrl || "").startsWith("https://") ? String($credentials.customBaseUrl).replace(/\\/+$/, "") : "https://relaypartner.didavie.com/api/v1" }}',
			url: '/me',
			method: 'GET',
		},
	};
}
