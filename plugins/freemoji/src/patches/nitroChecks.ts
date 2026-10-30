import { findByProps, findByPropsAll, findByStoreName } from "@vendetta/metro";
import { storage } from "@vendetta/plugin";
import { instead, after } from "@vendetta/patcher";
import { setRealPremiumType, clearRealPremiumType } from "../premium";
import { UNLOCK_NAMES, OBSERVE_NAMES, unlockKey } from "../unlocks";
import { record } from "../stats";

const NAMES = ["canUseEmojisEverywhere", "canUseAnimatedEmojis"];
const SPOOFED_TYPE = 2;

// Keep the shape Discord expects: booleans become false, arrays become empty,
// anything else is returned untouched.
function unlockResult(ret: any) {
	if (typeof ret === "boolean") return false;
	if (Array.isArray(ret)) return [];
	return ret;
}

type Fn = (...a: any[]) => any;

const SelectedGuildStore = findByStoreName("SelectedGuildStore");

// The tap-time check doesn't always pass guildId, so fall back to the channel or the open server.
function guildOf(arg: any) {
	return arg?.guildId
		?? arg?.channel?.guild_id
		?? arg?.channel?.guildId
		?? SelectedGuildStore?.getGuildId?.();
}

// Return a copy of the emoji that looks like a normal static emoji from the current server.
// Calling Discord's own checks with this gives their natural "usable" answer.
function asLocalEmoji(emoji: any, guildId: any) {
	if (!emoji || typeof emoji !== "object") return emoji;
	return { ...emoji, guildId, animated: false };
}

// Called as ({ categoryEmojis, channel, guildId, intention }) and returns an object like
// { emojisDisabled, emojisUnfiltered, emojisPremiumLockedCount, emojiNitroLocked }.
// Instead of guessing what each field means, ask Discord again with the custom emoji
// disguised as local ones, then swap the real emoji objects back into the answer.
function reasonsPlural(args: any[], orig: Fn) {
	const ret = orig(...args);
	try { record("getEmojiUnavailableReasons", args, ret); } catch {}

	try {
		const arg = args[0];
		const emojis = arg?.categoryEmojis;
		if (!Array.isArray(emojis)) return ret;

		const originals = new Map<any, any>();
		const fakes = emojis.map((e: any) => {
			if (!e || typeof e !== "object" || e.id == null) return e; // unicode emoji: leave alone
			originals.set(e.id, e);
			return asLocalEmoji(e, guildOf(arg));
		});

		const fakeRet = orig({ ...arg, categoryEmojis: fakes });
		if (!fakeRet || typeof fakeRet !== "object") return ret;

		const restore = (v: any) =>
			Array.isArray(v) ? v.map((x: any) => (x && x.id != null && originals.get(x.id)) || x) : v;

		const out: any = {};
		for (const k of Object.keys(fakeRet)) out[k] = restore(fakeRet[k]);
		try { record("getEmojiUnavailableReasons -> out", args, out); } catch {}
		return out;
	} catch {
		return ret;
	}
}

// Called as ({ emoji, channel, intention, guildId }) when an emoji is tapped.
// Returns a reason code (2 = premium locked) or Discord's "no reason" value.
let noneValue: any = null;
let haveNone = false;

// Ask about a plain unicode emoji (always usable) to learn what "no reason" looks like
// in this Discord build (null vs undefined), then reuse it.
function learnNone(arg: any, orig: Fn) {
	if (haveNone) return noneValue;
	try {
		const r = orig({ ...arg, emoji: { name: "grinning", surrogates: "\u{1F600}" } });
		if (r == null) { noneValue = r; haveNone = true; }
	} catch {}
	return noneValue;
}

function reasonSingular(args: any[], orig: Fn) {
	const ret = orig(...args);
	try { record("getEmojiUnavailableReason", args, ret); } catch {}
	if (ret == null) { noneValue = ret; haveNone = true; return ret; }

	try {
		const arg = args[0];
		if (arg?.emoji && typeof arg.emoji === "object") {
			const guildId = guildOf(arg);
			const fakeRet = orig({ ...arg, guildId, emoji: asLocalEmoji(arg.emoji, guildId) });
			if (fakeRet == null) {
				try { record("getEmojiUnavailableReason -> out", args, fakeRet); } catch {}
				return fakeRet;
			}
			// Still blocked for some reason: report "no reason" the way Discord itself does
			const none = learnNone(arg, orig);
			try { record("getEmojiUnavailableReason -> none", args, none); } catch {}
			return none;
		}
	} catch {}
	return ret;
}

const CUSTOM: Record<string, (args: any[], orig: Fn) => any> = {
	getEmojiUnavailableReasons: reasonsPlural,
	getEmojiUnavailableReason: reasonSingular,
};

// Generic fallback for the plain boolean checks (the picker doesn't seem to call these directly).
function unlockEmojiChecks(diag: string[]): (() => void)[] {
	const out: (() => void)[] = [];
	for (const name of UNLOCK_NAMES) {
		if (storage[unlockKey(name)] === false) continue; // switched off in settings
		try {
			const mod = findByProps(name);
			if (typeof mod?.[name] !== "function") { diag.push(`${name} not found`); continue; }
			const handler = CUSTOM[name] ?? ((args: any[], orig: Fn) => {
				const ret = orig(...args);
				try { record(name, args, ret); } catch {}
				return unlockResult(ret);
			});
			out.push(instead(name, mod, handler));
		} catch (e: any) {
			diag.push(`${name}: ${e?.message ?? e}`);
		}
	}
	return out;
}

// TEMPORARY DEBUG: watch these without changing what they return.
function observeFunctions(): (() => void)[] {
	const out: (() => void)[] = [];
	for (const name of OBSERVE_NAMES) {
		try {
			const mods = [...((findByPropsAll?.(name) as any[]) ?? [])];
			for (const mod of mods) {
				if (typeof mod?.[name] !== "function") continue;
				out.push(instead(name, mod, (args: any[], orig: (...a: any[]) => any) => {
					const ret = orig(...args);
					try { record(name, args, ret); } catch {}
					return ret;
				}));
			}
		} catch {}
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
	const observers = observeFunctions();

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

	return [...patches, ...observers];
}
