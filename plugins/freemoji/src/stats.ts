// TEMPORARY DEBUG: records which emoji functions Discord calls and what they return,
// so we can see what the emoji picker actually depends on. Shown in plugin settings.

type Stat = { calls: number; orig: Record<string, number>; arg0?: string };
export const stats: Record<string, Stat> = {};

function short(v: any): string {
	if (v === null) return "null";
	if (v === undefined) return "undef";
	if (Array.isArray(v)) return `[${v.length}]`;
	if (typeof v === "object") return "{..}";
	if (typeof v === "string") return "str";
	return String(v);
}

export function describe(v: any): string {
	if (v === null) return "null";
	if (v === undefined) return "undefined";
	if (Array.isArray(v)) return `array(${v.length})`;
	if (typeof v === "object") {
		const parts: string[] = [];
		for (const k of Object.keys(v).slice(0, 8)) {
			let val: any;
			try { val = v[k]; } catch { val = "?"; }
			parts.push(`${k}:${short(val)}`);
		}
		return `{${parts.join(",")}}`;
	}
	return `${typeof v}:${String(v).slice(0, 16)}`;
}

export function record(name: string, args: any[], ret: any) {
	const s = (stats[name] ??= { calls: 0, orig: {} });
	s.calls++;
	const d = describe(ret);
	if (d in s.orig || Object.keys(s.orig).length < 6) s.orig[d] = (s.orig[d] ?? 0) + 1;
	if (s.arg0 === undefined) s.arg0 = describe(args?.[0]);
}

export function resetStats() {
	for (const k of Object.keys(stats)) delete stats[k];
}
