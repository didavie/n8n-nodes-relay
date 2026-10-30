import type { IDataObject } from 'n8n-workflow';

/** tracking code → last status seen. Kept in the workflow static data. */
export type StatusMemory = Record<string, string>;

/** Hard cap so the static data stays small. */
export const MEMORY_CAP = 2000;

/**
 * Compares the current packages with what the last poll saw.
 *  - First poll (no memory): records everything, emits nothing.
 *  - A tracking code whose status differs from memory: emitted once
 *    (dedupe on tracking + status), with previous_status.
 *  - A tracking code not in memory: emitted only when includeNew is on.
 * The memory keeps the latest packages first and drops the oldest past the cap.
 */
export function diffStatuses(
	previous: StatusMemory | undefined,
	packages: IDataObject[],
	opts: {
		includeNew: boolean;
		statuses: string[];
		/**
		 * With updated_since, an older delivery the baseline never saw can show up when it
		 * changes. One created before this time is a status change (previous unknown), not new.
		 */
		createdBefore?: string;
	},
): { changed: IDataObject[]; memory: StatusMemory } {
	const cutoff = opts.createdBefore ? Date.parse(opts.createdBefore) : NaN;
	const first = previous === undefined;
	const prev = previous ?? {};
	const changed: IDataObject[] = [];
	const memory: StatusMemory = {};

	for (const p of packages) {
		const tracking = String(p.tracking_code ?? '');
		const status = String(p.status ?? '');
		if (!tracking || !status || tracking in memory) continue;
		memory[tracking] = status;
		if (first) continue;
		const before = prev[tracking];
		const matches = !opts.statuses.length || opts.statuses.includes(status);
		if (before === undefined) {
			const created = Date.parse(String(p.created_at ?? ''));
			const old = Number.isFinite(cutoff) && Number.isFinite(created) && created < cutoff;
			if (old && matches) changed.push({ ...p, previous_status: null, event: 'status_changed' });
			else if (!old && opts.includeNew && matches) {
				changed.push({ ...p, previous_status: null, event: 'created' });
			}
		} else if (before !== status && matches) {
			changed.push({ ...p, previous_status: before, event: 'status_changed' });
		}
	}

	// Keep what is no longer in the scan window (still dedupes if it comes back), up to the cap.
	let size = Object.keys(memory).length;
	for (const [tracking, status] of Object.entries(prev)) {
		if (size >= MEMORY_CAP) break;
		if (!(tracking in memory)) {
			memory[tracking] = status;
			size++;
		}
	}

	return { changed, memory };
}

/** Overlap with the previous poll, for clock differences between n8n and Relay. */
export const SINCE_OVERLAP_MS = 2 * 60 * 1000;

/**
 * updated_since for GET /packages: shop keys only (agency lists do not filter on it),
 * never on the first poll (it records the baseline) or without a previous poll time.
 */
export function sinceParam(
	kind: 'shop' | 'agency',
	hasMemory: boolean,
	lastPollAt: string | undefined,
): string | undefined {
	if (kind !== 'shop' || !hasMemory || !lastPollAt) return undefined;
	const t = Date.parse(lastPollAt);
	if (!Number.isFinite(t)) return undefined;
	return new Date(t - SINCE_OVERLAP_MS).toISOString();
}
