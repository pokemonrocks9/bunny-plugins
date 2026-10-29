import { findByProps, findByPropsAll } from "@vendetta/metro";
import { instead } from "@vendetta/patcher";

const NAMES = ["canUseEmojisEverywhere", "canUseAnimatedEmojis"];

// Force obj[name] to return true. Newer Discord builds export these as read-only,
// which makes the normal patcher throw "Cannot assign to read-only property".
function forceTrue(obj: any, name: string): (() => void) | null {
	if (typeof obj?.[name] !== "function") return null;
	const desc = Object.getOwnPropertyDescriptor(obj, name);

	// Normal case: plain writable property, regular patcher works
	if (!desc || desc.writable) {
		try { return instead(name, obj, () => true); } catch {}
	}

	// Read-only or getter-only, but configurable: redefine it
	if (desc?.configurable) {
		try {
			Object.defineProperty(obj, name, {
				value: () => true,
				writable: true,
				configurable: true,
				enumerable: desc.enumerable,
			});
			return () => { try { Object.defineProperty(obj, name, desc); } catch {} };
		} catch {}
	}

	return null;
}

export default function apply() {
	const patches: (() => void)[] = [];
	const diag: string[] = [];

	for (const name of NAMES) {
		const mods = [findByProps(name), ...((findByPropsAll?.(name) as any[]) ?? [])].filter(Boolean);
		const seen = new Set<any>();

		for (const mod of mods) {
			if (seen.has(mod)) continue;
			seen.add(mod);

			const undo = forceTrue(mod, name);
			if (undo) {
				patches.push(undo);
			} else if (typeof mod?.[name] === "function") {
				const d = Object.getOwnPropertyDescriptor(mod, name);
				diag.push(`${name}: ${d
					? `writable=${d.writable} configurable=${d.configurable} getter=${!!d.get}`
					: "no own descriptor (inherited?)"}`);
			}
		}
	}

	// Zero patches = the Nitro spoof isn't possible on this Discord build.
	// Throw so index.ts shows exactly why.
	if (!patches.length) {
		throw new Error(`Couldn't patch any Nitro check. ${diag.join(" | ") || "Functions not found."}`);
	}

	return patches;
}
