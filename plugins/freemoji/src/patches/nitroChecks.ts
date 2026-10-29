import { findByProps, findByPropsAll, findByStoreName } from "@vendetta/metro";
import { storage } from "@vendetta/plugin";
import { instead, after } from "@vendetta/patcher";
import { setRealPremiumType, clearRealPremiumType } from "../premium";
import { UNLOCK_NAMES, unlockKey } from "../unlocks";

const NAMES = ["canUseEmojisEverywhere", "canUseAnimatedEmojis"];
const SPOOFED_TYPE = 2;

// Keep the shape Discord expects: booleans become false, arrays become empty,
// anything else is returned untouched.
function unlockResult(ret: any) {
	if (typeof ret === "boolean") return false;
	if (Array.isArray(ret)) return [];
	return ret;
}

function unlockEmojiChecks(diag: string[]): (() => void)[] {
	const out: (() => void)[] = [];
	for (const name of UNLOCK_NAMES) {
		if (storage[unlockKey(name)] === false) continue; // switched off in settings
		try {
			const mod = findByProps(name);
			if (typeof mod?.[name] !== "function") { diag.push(`${name} not found`); continue; }
			out.push(instead(name, mod, (args: any[], orig: (...a: any[]) => any) => unlockResult(orig(...args))));
		} catch (e: any) {
			diag.push(`${name}: ${e?.message ?? e}`);
		}
	}
	return out;
}

// Older Discord builds: force the canUse* functions to return true.
// Newer builds freeze these exports (writable=false configurable=false), so this does nothing there.
function forceTrue(obj: any, name: string): (() => void) | null {
	if (typeof obj?.[name] !== "function") return null;
	const desc = Object.getOwnPropertyDescriptor(obj, name);

	if (!desc || desc.writable) {
		try { return instead(name, obj, () => true); } catch {}
	}

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

// Make the client believe the current user has Nitro (quiets the upsell UI).
function spoofPremiumType(): (() => void) | null {
	const UserStore = findByStoreName("UserStore");
	const user = UserStore?.getCurrentUser?.();
	if (!user) return null;

	const real = user.premiumType;
	if (real === 1 || real === 2) return () => {}; // real Nitro, nothing to spoof

	setRealPremiumType(real);

	const touched = new Set<any>();
	const setType = (u: any) => {
		if (u && typeof u === "object" && u.premiumType !== SPOOFED_TYPE) {
			try { u.premiumType = SPOOFED_TYPE; touched.add(u); } catch {}
		}
	};

	setType(user);
	if (user.premiumType !== SPOOFED_TYPE) {
		clearRealPremiumType();
		return null;
	}

	// Discord may replace the user record later; re-apply to whatever it returns
	const unpatch = after("getCurrentUser", UserStore, (_args: any, ret: any) => {
		setType(ret);
		return ret;
	});

	return () => {
		unpatch();
		for (const u of touched) { try { u.premiumType = real; } catch {} }
		clearRealPremiumType();
	};
}

export default function apply() {
	const diag: string[] = [];
	const patches: (() => void)[] = [...unlockEmojiChecks(diag)];

	for (const name of NAMES) {
		const mods = [findByProps(name), ...((findByPropsAll?.(name) as any[]) ?? [])].filter(Boolean);
		const seen = new Set<any>();

		for (const mod of mods) {
			if (seen.has(mod)) continue;
			seen.add(mod);

			const undo = forceTrue(mod, name);
			if (undo) patches.push(undo);
		}
	}

	if (storage.spoofNitro !== false) {
		try {
			const undo = spoofPremiumType();
			if (undo) patches.push(undo);
			else diag.push("user spoof unavailable");
		} catch (e: any) {
			diag.push(`spoof error: ${e?.message ?? e}`);
		}
	}

	if (!patches.length && diag.length) {
		throw new Error(`Couldn't patch any emoji/Nitro checks. ${diag.join(" | ")}`);
	}
	return patches;
}
