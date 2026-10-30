import type { INodePropertyOptions, INodeProperties } from 'n8n-workflow';

/** Package statuses as Relay reports them (filters, trigger). */
export const STATUS_OPTIONS: INodePropertyOptions[] = [
	{ name: 'Assigned to a Driver', value: 'driver_assigned' },
	{ name: 'Awaiting Driver', value: 'awaiting_driver' },
	{ name: 'Awaiting Pickup', value: 'awaiting_pickup' },
	{ name: 'Cancelled', value: 'cancelled' },
	{ name: 'Delivered', value: 'delivered' },
	{ name: 'Driver on the Way to Pickup', value: 'en_route_to_pickup' },
	{ name: 'In Transit', value: 'in_transit' },
	{ name: 'On Hold', value: 'on_hold' },
	{ name: 'Out for Delivery', value: 'out_for_delivery' },
	{ name: 'Pending', value: 'pending' },
	{ name: 'Picked Up', value: 'picked_up' },
	{ name: 'Problem', value: 'problem' },
	{ name: 'Registered', value: 'registered' },
	{ name: 'Returned', value: 'returned' },
	{ name: 'Returning', value: 'returning' },
];

export const resourceProperty: INodeProperties = {
	displayName: 'Resource',
	name: 'resource',
	type: 'options',
	noDataExpression: true,
	options: [
		{ name: 'Delivery', value: 'delivery' },
		{ name: 'Pricing', value: 'pricing' },
	],
	default: 'delivery',
};

export const deliveryOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['delivery'] } },
	options: [
		{
			name: 'Cancel',
			value: 'cancel',
			description: 'Cancel a delivery before pickup',
			action: 'Cancel a delivery',
		},
		{
			name: 'Create',
			value: 'create',
			description: 'Create a delivery for an order',
			action: 'Create a delivery',
		},
		{
			name: 'Get',
			value: 'get',
			description: 'Get a delivery by tracking code',
			action: 'Get a delivery',
		},
		{
			name: 'Get Many',
			value: 'getAll',
			description: 'List deliveries, newest first',
			action: 'Get many deliveries',
		},
	],
	default: 'create',
};

export const pricingOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['pricing'] } },
	options: [
		{
			name: 'Estimate',
			value: 'estimate',
			description: 'Get the delivery price for a destination before creating the delivery',
			action: 'Estimate a delivery price',
		},
	],
	default: 'estimate',
};

const show = (operation: string[], resource = 'delivery') => ({
	show: { resource: [resource], operation },
});

export const deliveryFields: INodeProperties[] = [
	// ── Create ──────────────────────────────────────────────────────────────
	{
		displayName: 'Order ID',
		name: 'orderId',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. 1042',
		description:
			'Your order number. Sending the same order ID again returns the existing delivery instead of creating a second one.',
		displayOptions: show(['create']),
	},
	{
		displayName: 'Recipient Name',
		name: 'clientName',
		type: 'string',
		required: true,
		default: '',
		displayOptions: show(['create']),
	},
	{
		displayName: 'Recipient Phone',
		name: 'clientPhone',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. +229 01 97 00 00 00',
		displayOptions: show(['create']),
	},
	{
		displayName: 'Delivery Address',
		name: 'deliveryAddress',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. Rue 12.045, Fidjrossè, Cotonou',
		description:
			'Written address (area, street, landmark). Agency keys need at least 10 characters.',
		displayOptions: show(['create']),
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: show(['create']),
		options: [
			{
				displayName: 'Assignment Mode (Agency Keys)',
				name: 'assignment_mode',
				type: 'options',
				options: [
					{ name: 'Own Fleet', value: 'own_fleet' },
					{ name: 'Relay Drivers', value: 'platform_open' },
					{ name: 'Hybrid', value: 'hybrid' },
				],
				default: 'platform_open',
			},
			{
				displayName: 'Cash on Delivery (Agency Keys)',
				name: 'is_cod',
				type: 'boolean',
				default: false,
			},
			{
				displayName: 'Delivery Latitude',
				name: 'delivery_latitude',
				type: 'number',
				typeOptions: { numberPrecision: 7 },
				default: 0,
			},
			{
				displayName: 'Delivery Longitude',
				name: 'delivery_longitude',
				type: 'number',
				typeOptions: { numberPrecision: 7 },
				default: 0,
			},
			{
				displayName: 'Delivery Payer (Shop Keys)',
				name: 'delivery_payer',
				type: 'options',
				options: [
					{ name: 'Merchant', value: 'merchant' },
					{ name: 'Recipient', value: 'recipient' },
				],
				default: 'merchant',
			},
			{
				displayName: 'Delivery Type',
				name: 'delivery_type',
				type: 'options',
				options: [
					{ name: 'Standard', value: 'standard' },
					{ name: 'Express', value: 'express' },
					{ name: 'Scheduled', value: 'scheduled' },
				],
				default: 'standard',
			},
			{
				displayName: 'Description',
				name: 'description',
				type: 'string',
				default: '',
				description: 'What is in the package',
			},
			{
				displayName: 'Dry Run (Shop Keys)',
				name: 'test',
				type: 'boolean',
				default: false,
				description: 'Whether to only check the request and the price without creating a delivery',
			},
			{
				displayName: 'Fragile',
				name: 'is_fragile',
				type: 'boolean',
				default: false,
			},
			{
				displayName: 'Metadata (Shop Keys)',
				name: 'metadata',
				type: 'json',
				default: '{}',
				description: 'Free JSON object stored with the delivery and sent back in webhooks',
			},
			{
				displayName: 'Pickup Address',
				name: 'pickup_address',
				type: 'string',
				default: '',
				description: 'Leave empty to use the pickup point saved on Relay',
			},
			{
				displayName: 'Pickup Latitude',
				name: 'pickup_latitude',
				type: 'number',
				typeOptions: { numberPrecision: 7 },
				default: 0,
			},
			{
				displayName: 'Pickup Longitude',
				name: 'pickup_longitude',
				type: 'number',
				typeOptions: { numberPrecision: 7 },
				default: 0,
			},
			{
				displayName: 'Quote ID (Shop Keys)',
				name: 'quote_id',
				type: 'string',
				default: '',
				description: 'The quote_id from a Pricing › Estimate call, to lock that price',
			},
			{
				displayName: 'Recipient Email',
				name: 'client_email',
				type: 'string',
				placeholder: 'name@email.com',
				default: '',
			},
			{
				displayName: 'Special Instructions',
				name: 'special_instructions',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Value (FCFA)',
				name: 'value_fcfa',
				type: 'number',
				default: 0,
				description: 'Declared value of the goods',
			},
			{
				displayName: 'Weight (Kg)',
				name: 'weight_kg',
				type: 'number',
				typeOptions: { numberPrecision: 2 },
				default: 1,
			},
		],
	},

	// ── Get / Cancel ────────────────────────────────────────────────────────
	{
		displayName: 'Tracking Code',
		name: 'trackingCode',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. RB042917',
		displayOptions: show(['get', 'cancel']),
	},
	{
		displayName: 'Reason',
		name: 'reason',
		type: 'string',
		default: '',
		placeholder: 'e.g. Order cancelled by the customer',
		displayOptions: show(['cancel']),
	},

	// ── Get / Get Many: output shape ────────────────────────────────────────
	{
		displayName: 'Simplify',
		name: 'simplify',
		type: 'boolean',
		default: true,
		description:
			'Whether to return the same flat shape for shop and agency keys (tracking_code, status and order_id at the top level)',
		displayOptions: show(['get', 'getAll']),
	},

	// ── Get Many ────────────────────────────────────────────────────────────
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: show(['getAll']),
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		description: 'Max number of results to return',
		displayOptions: { show: { resource: ['delivery'], operation: ['getAll'], returnAll: [false] } },
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: show(['getAll']),
		options: [
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				options: STATUS_OPTIONS,
				default: 'delivered',
			},
		],
	},
];

export const pricingFields: INodeProperties[] = [
	{
		displayName: 'Delivery Latitude',
		name: 'deliveryLat',
		description: 'Shop keys can leave the coordinates at 0 and send a Delivery Address instead',
		type: 'number',
		typeOptions: { numberPrecision: 7 },
		default: 0,
		displayOptions: show(['estimate'], 'pricing'),
	},
	{
		displayName: 'Delivery Longitude',
		name: 'deliveryLng',
		type: 'number',
		typeOptions: { numberPrecision: 7 },
		default: 0,
		displayOptions: show(['estimate'], 'pricing'),
	},
	{
		displayName: 'Additional Fields',
		name: 'estimateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: show(['estimate'], 'pricing'),
		options: [
			{
				displayName: 'Delivery Address (Shop Keys)',
				name: 'deliveryAddress',
				type: 'string',
				default: '',
				placeholder: 'e.g. Haie Vive, rue 12.045, Cotonou',
				description:
					'Used when no delivery coordinates are given: Relay finds the point from the address',
			},
			{
				displayName: 'Delivery Type',
				name: 'deliveryType',
				type: 'options',
				options: [
					{ name: 'Standard', value: 'standard' },
					{ name: 'Express', value: 'express' },
				],
				default: 'standard',
			},
			{
				displayName: 'Pickup Latitude',
				name: 'pickupLat',
				type: 'number',
				typeOptions: { numberPrecision: 7 },
				default: 0,
				description:
					'Required with agency keys. Shop keys use their saved pickup point when empty.',
			},
			{
				displayName: 'Pickup Longitude',
				name: 'pickupLng',
				type: 'number',
				typeOptions: { numberPrecision: 7 },
				default: 0,
				description:
					'Required with agency keys. Shop keys use their saved pickup point when empty.',
			},
			{
				displayName: 'Weight (Kg)',
				name: 'weightKg',
				type: 'number',
				typeOptions: { numberPrecision: 2 },
				default: 1,
			},
		],
	},
];
