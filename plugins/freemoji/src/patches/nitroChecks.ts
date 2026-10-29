import { findByProps, findByPropsAll, findByStoreName } from "@vendetta/metro";
import { instead, after } from "@vendetta/patcher";
import { setRealPremiumType, clearRealPremiumType } from "../premium";

const NAMES = ["canUseEmojisEverywhere", "canUseAnimatedEmojis"];
const SPOOFED_TYPE = 2;

// What the emoji picker / validation actually consult on current Discord builds.
// Found with the probe: these are all plain writable functions, unlike the frozen canUse* ones.
const EMOJI_UNLOCKS: Record<string, () => any> = {
	isEmojiPremiumLocked: () => false,
	isEmojiCategoryNitroLocked: () => false,
	isEmojiFilteredOrLocked: () => false,
	isEmojiFiltered: () => false,
	isEmojiDisabled: () => false,
	getEmojiUnavailableReasons: () => [],
	getEmojiUnavailableReason: () => null,
};

function unlockEmojiChecks(): (() => void)[] {
	const out: (() => void)[] = [];
	for (const [name, value] of Object.entries(EMOJI_UNLOCKS)) {
		try {
			const mod = findByProps(name);
			if (typeof mod?.[name] !== "function") continue;
			out.push(instead(name, mod, value));
		} catch {}
	}
	return out;
}

// Older Discord builds: force the canUse* functions to return true.
// Newer builds freeze these exports (writable=false configurable=false), so this just does nothing there.
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
	const patches: (() => void)[] = [...unlockEmojiChecks()];
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

	try {
		const undo = spoofPremiumType();
		if (undo) patches.push(undo);
		else diag.push("user spoof unavailable");
	} catch (e: any) {
		diag.push(`spoof error: ${e?.message ?? e}`);
	}

	if (!patches.length) {
		throw new Error(`Couldn't patch any emoji/Nitro checks. ${diag.join(" | ")}`);
	}

	return patches;
}
