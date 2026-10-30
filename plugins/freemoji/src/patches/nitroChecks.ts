import { findByProps, findByPropsAll, findByStoreName } from "@vendetta/metro";
import { storage } from "@vendetta/plugin";
import { instead, after } from "@vendetta/patcher";
import { setRealPremiumType, clearRealPremiumType } from "../premium";

type Fn = (...a: any[]) => any;

const SPOOFED_TYPE = 2;
const SelectedGuildStore = findByStoreName("SelectedGuildStore");

// Older Discord builds expose these; newer ones freeze them, in which case forceTrue does nothing.
const CAN_USE_NAMES = ["canUseEmojisEverywhere", "canUseAnimatedEmojis"];

// Plain boolean/array lock checks. The current emoji picker doesn't call these directly,
// but other Discord builds and screens do, so they stay patched.
const SIMPLE_UNLOCKS = [
	"isEmojiPremiumLocked",
	"isEmojiCategoryNitroLocked",
	"isEmojiFilteredOrLocked",
	"isEmojiFiltered",
	"isEmojiDisabled",
];

// Booleans become false, arrays become empty, anything else is returned untouched.
function unlockResult(ret: any) {
	if (typeof ret === "boolean") return false;
	if (Array.isArray(ret)) return [];
	return ret;
}

// The tap-time check doesn't always pass guildId, so fall back to the channel or the open server.
// An explicit null (DMs) is kept as null.
function guildOf(arg: any) {
	if (arg?.guildId !== undefined) return arg.guildId;
	return arg?.channel?.guild_id
		?? arg?.channel?.guildId
		?? SelectedGuildStore?.getGuildId?.();
}

// Copy of the emoji that looks like a normal static emoji from the current server.
// Calling Discord's own checks with this gives their natural "usable" answer.
function asLocalEmoji(emoji: any, guildId: any) {
	if (!emoji || typeof emoji !== "object") return emoji;
	return { ...emoji, guildId, animated: false };
}

// "Empty" version of a value of the same kind, or the value itself if we don't recognise it.
function emptyLike(v: any) {
	if (typeof v === "boolean") return false;
	if (typeof v === "number") return 0;
	if (Array.isArray(v)) return [];
	if (v instanceof Set) return new Set();
	if (v instanceof Map) return new Map();
	if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) return {};
	return v;
}

// Fallback for when disguising the emoji didn't unlock them (DMs have no server to disguise
// them as part of): if the result still says locked, clear the lock fields directly.
function neutralize(r: any) {
	if (!r || typeof r !== "object") return r;
	const stillLocked = r.emojiNitroLocked === true
		|| (typeof r.emojisPremiumLockedCount === "number" && r.emojisPremiumLockedCount > 0);
	if (!stillLocked) return r;

	const o: any = { ...r };
	if ("emojiNitroLocked" in o) o.emojiNitroLocked = false;
	if ("emojisPremiumLockedCount" in o) o.emojisPremiumLockedCount = emptyLike(o.emojisPremiumLockedCount);
	if ("emojisDisabled" in o) o.emojisDisabled = emptyLike(o.emojisDisabled);
	return o;
}

// Called by the emoji picker as ({ categoryEmojis, channel, guildId, intention }); returns an object
// { emojisDisabled, emojisUnfiltered, emojisPremiumLockedCount, emojiNitroLocked }.
// Ask Discord again with the custom emoji disguised as local ones, swap the real emoji objects
// back into the answer, and clear any lock fields that are still set.
function reasonsPlural(args: any[], orig: Fn) {
	const ret = orig(...args);

	try {
		const arg = args[0];
		const emojis = arg?.categoryEmojis;
		if (!Array.isArray(emojis)) return neutralize(ret);

		const originals = new Map<any, any>();
		const guildId = guildOf(arg);
		const fakes = emojis.map((e: any) => {
			if (!e || typeof e !== "object" || e.id == null) return e; // unicode emoji: leave alone
			originals.set(e.id, e);
			return asLocalEmoji(e, guildId);
		});

		const fakeRet = orig({ ...arg, categoryEmojis: fakes });
		if (!fakeRet || typeof fakeRet !== "object") return neutralize(ret);

		const restore = (v: any) =>
			Array.isArray(v) ? v.map((x: any) => (x && x.id != null && originals.get(x.id)) || x) : v;

		const restored: any = {};
		for (const k of Object.keys(fakeRet)) restored[k] = restore(fakeRet[k]);

		return neutralize(restored);
	} catch {
		return ret;
	}
}

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

// Called when an emoji is tapped, as ({ emoji, channel, intention, guildId }).
// Returns a reason code (2 = premium locked) or Discord's "no reason" value.
function reasonSingular(args: any[], orig: Fn) {
	const ret = orig(...args);
	if (ret == null) { noneValue = ret; haveNone = true; return ret; }

	try {
		const arg = args[0];
		if (arg?.emoji && typeof arg.emoji === "object") {
			const guildId = guildOf(arg);
			const fakeRet = orig({ ...arg, guildId, emoji: asLocalEmoji(arg.emoji, guildId) });
			if (fakeRet == null) return fakeRet;
			// Still blocked: report "no reason" the way Discord itself does
			return learnNone(arg, orig);
		}
	} catch {}
	return ret;
}

const CUSTOM: Record<string, (args: any[], orig: Fn) => any> = {
	getEmojiUnavailableReasons: reasonsPlural,
	getEmojiUnavailableReason: reasonSingular,
};

function unlockEmojiChecks(diag: string[]): (() => void)[] {
	const out: (() => void)[] = [];
	if (storage.unlockPicker === false) return out; // switched off in settings

	for (const name of [...Object.keys(CUSTOM), ...SIMPLE_UNLOCKS]) {
		try {
			const mod = findByProps(name);
			if (typeof mod?.[name] !== "function") { diag.push(`${name} not found`); continue; }
			const handler = CUSTOM[name] ?? ((args: any[], orig: Fn) => unlockResult(orig(...args)));
			out.push(instead(name, mod, handler));
		} catch (e: any) {
			diag.push(`${name}: ${e?.message ?? e}`);
		}
	}
	return out;
}

// Older Discord builds: force the canUse* functions to return true.
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

	for (const name of CAN_USE_NAMES) {
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
