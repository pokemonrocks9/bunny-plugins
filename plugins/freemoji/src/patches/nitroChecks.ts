import { findByProps, findByPropsAll, findByStoreName } from "@vendetta/metro";
import { instead, after } from "@vendetta/patcher";
import { setRealPremiumType, clearRealPremiumType } from "../premium";

const NAMES = ["canUseEmojisEverywhere", "canUseAnimatedEmojis"];
const SPOOFED_TYPE = 2;

// Attempt 1: force the Nitro check functions to return true.
// Newer Discord builds freeze these exports (writable=false configurable=false),
// in which case this fails and we fall back to spoofing the user record instead.
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

// Attempt 2: make the client believe the current user has Nitro.
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
	const patches: (() => void)[] = [];
	const diag: string[] = [];

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
	if (patches.length) return patches;

	try {
		const undo = spoofPremiumType();
		if (undo) return [undo];
	} catch (e: any) {
		diag.push(`spoof error: ${e?.message ?? e}`);
	}

	const user = findByStoreName("UserStore")?.getCurrentUser?.();
	const d = user && Object.getOwnPropertyDescriptor(user, "premiumType");
	diag.push(`premiumType: ${d
		? `writable=${d.writable} configurable=${d.configurable} getter=${!!d.get}`
		: "no own descriptor"}`);

	throw new Error(`Couldn't patch Nitro checks or spoof Nitro. ${diag.join(" | ")}`);
}
