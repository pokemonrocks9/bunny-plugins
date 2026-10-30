import { findByProps, findByStoreName } from "@vendetta/metro";
import { storage } from "@vendetta/plugin";
import { instead, after } from "@vendetta/patcher";
import { setRealPremiumType, clearRealPremiumType } from "../premium";

type Fn = (...a: any[]) => any;

const SPOOFED_PREMIUM_TYPE = 2;
const CHAT_INTENTION = 3;

const SelectedGuildStore = findByStoreName("SelectedGuildStore");
const UserStore = findByStoreName("UserStore");
function guildOf(arg: any) {
	if (arg?.guildId !== undefined) return arg.guildId;
	return arg?.channel?.guild_id
		?? arg?.channel?.guildId
		?? SelectedGuildStore?.getGuildId?.();
}

function asLocalEmoji(emoji: any, guildId: any) {
	if (!emoji || typeof emoji !== "object") return emoji;
	return { ...emoji, guildId, animated: false };
}

function emptyLike(v: any) {
	if (typeof v === "boolean") return false;
	if (typeof v === "number") return 0;
	if (Array.isArray(v)) return [];
	if (v instanceof Set) return new Set();
	if (v instanceof Map) return new Map();
	if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) return {};
	return v;

function neutralize(r: any) {
	if (!r || typeof r !== "object") return r;
	const locked = r.emojiNitroLocked === true
		|| (typeof r.emojisPremiumLockedCount === "number" && r.emojisPremiumLockedCount > 0);
	if (!locked) return r;

	const out: any = { ...r };
	if ("emojiNitroLocked" in out) out.emojiNitroLocked = false;
	if ("emojisPremiumLockedCount" in out) out.emojisPremiumLockedCount = emptyLike(out.emojisPremiumLockedCount);
	if ("emojisDisabled" in out) out.emojisDisabled = emptyLike(out.emojisDisabled);
	return out;
}

function reasonsPlural(args: any[], orig: Fn) {
	const ret = orig(...args);
	if (args[0]?.intention !== CHAT_INTENTION) return ret;

	try {
		const arg = args[0];
		if (!Array.isArray(arg.categoryEmojis)) return neutralize(ret);

		const originals = new Map<any, any>();
		const guildId = guildOf(arg);
		const fakes = arg.categoryEmojis.map((e: any) => {
			if (!e || typeof e !== "object" || e.id == null) return e; // unicode emoji
			originals.set(e.id, e);
			return asLocalEmoji(e, guildId);
		});

		const fakeRet = orig({ ...arg, categoryEmojis: fakes });
		if (!fakeRet || typeof fakeRet !== "object") return neutralize(ret);

		const restored: any = {};
		for (const k of Object.keys(fakeRet)) {
			const v = fakeRet[k];
			restored[k] = Array.isArray(v) ? v.map((x: any) => (x && x.id != null && originals.get(x.id)) || x) : v;
		}
		return neutralize(restored);
	} catch {
		return ret;
	}
}

// Whether "no reason" is null or undefined differs between builds, so learn it from Discord.
let noneValue: any = null;
let haveNone = false;

function learnNone(arg: any, orig: Fn) {
	if (haveNone) return noneValue;
	try {
		// A plain unicode emoji is always usable
		const r = orig({ ...arg, emoji: { name: "grinning", surrogates: "\u{1F600}" } });
		if (r == null) { noneValue = r; haveNone = true; }
	} catch {}
	return noneValue;
}

function reasonSingular(args: any[], orig: Fn) {
	const ret = orig(...args);
	if (ret == null) { noneValue = ret; haveNone = true; return ret; }
	if (args[0]?.intention !== CHAT_INTENTION) return ret;

	try {
		const arg = args[0];
		if (arg?.emoji && typeof arg.emoji === "object") {
			const guildId = guildOf(arg);
			const fakeRet = orig({ ...arg, guildId, emoji: asLocalEmoji(arg.emoji, guildId) });
			return fakeRet == null ? fakeRet : learnNone(arg, orig);
		}
	} catch {}
	return ret;
}

const PICKER_PATCHES: Record<string, (args: any[], orig: Fn) => any> = {
	getEmojiUnavailableReasons: reasonsPlural,
	getEmojiUnavailableReason: reasonSingular,
};

function unlockPicker(diag: string[]): (() => void)[] {
	const out: (() => void)[] = [];
	if (storage.unlockPicker === false) return out;

	for (const [name, handler] of Object.entries(PICKER_PATCHES)) {
		try {
			const mod = findByProps(name);
			if (typeof mod?.[name] !== "function") { diag.push(`${name} not found`); continue; }
			out.push(instead(name, mod, handler));
		} catch (e: any) {
			diag.push(`${name}: ${e?.message ?? e}`);
		}
	}
	return out;
}

function forceTrue(name: string): (() => void) | null {
	const mod = findByProps(name);
	if (typeof mod?.[name] !== "function") return null;
	try { return instead(name, mod, () => true); } catch { return null; }
}

function spoofNitro(): (() => void) | null {
	const user = UserStore?.getCurrentUser?.();
	if (!user) return null;

	const real = user.premiumType;
	if (real === 1 || real === 2) return () => {}; // already has Nitro

	setRealPremiumType(real);

	const touched = new Set<any>();
	const spoof = (u: any) => {
		if (u && typeof u === "object" && u.premiumType !== SPOOFED_PREMIUM_TYPE) {
			try { u.premiumType = SPOOFED_PREMIUM_TYPE; touched.add(u); } catch {}
		}
	};

	spoof(user);
	if (user.premiumType !== SPOOFED_PREMIUM_TYPE) {
		clearRealPremiumType();
		return null;
	}

	const unpatch = after("getCurrentUser", UserStore, (_args: any, ret: any) => {
		spoof(ret);
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
	const patches = unlockPicker(diag);

	for (const name of ["canUseEmojisEverywhere", "canUseAnimatedEmojis"]) {
		const undo = forceTrue(name);
		if (undo) patches.push(undo);
	}

	if (storage.spoofNitro !== false) {
		try {
			const undo = spoofNitro();
			if (undo) patches.push(undo);
			else diag.push("Nitro spoof unavailable");
		} catch (e: any) {
			diag.push(`Nitro spoof: ${e?.message ?? e}`);
		}
	}

	if (!patches.length && diag.length) {
		throw new Error(`Couldn't patch any emoji/Nitro checks. ${diag.join(" | ")}`);
	}

	return patches;
}
