import { findByStoreName } from "@vendetta/metro";
import { clipboard } from "@vendetta/metro/common";
import { showConfirmationAlert } from "@vendetta/ui/alerts";
import { showToast } from "@vendetta/ui/toasts";

// TEMPORARY DIAGNOSTIC: lists emoji/lock/premium-related functions in Discord's
// loaded modules so we can find what the emoji picker actually checks.
// Delete this file and its call in index.ts once the picker is fixed.

const WORDS = "disab|lock|unavail|filter|premium|nitro|canuse|usable|reason|avail";
const NAME_RE = new RegExp(`(emoji.*(${WORDS}))|((${WORDS}).*emoji)|^(canUse|isPremium|hasPremium|isEmoji)`, "i");

const isObj = (x: any) => x && (typeof x === "object" || typeof x === "function");

function flagsOf(holder: any, k: string): string {
	try {
		const d = Object.getOwnPropertyDescriptor(holder, k);
		if (!d) return "inherited";
		if (d.get) return d.configurable ? "getter(cfg)" : "getter(locked)";
		return d.writable ? "writable" : d.configurable ? "readonly(cfg)" : "FROZEN";
	} catch { return "?"; }
}

export function runProbe() {
	try {
		const reg = (globalThis as any).modules;
		const found = new Map<string, { n: number; flags: Set<string> }>();

		if (reg) {
			for (const id in reg) {
				const m = reg[id];
				if (!m?.isInitialized) continue;
				let ex: any;
				try { ex = m.publicModule?.exports; } catch { continue; }

				for (const holder of [ex, ex?.default]) {
					if (!isObj(holder)) continue;
					let keys: string[];
					try { keys = Object.getOwnPropertyNames(holder); } catch { continue; }

					for (const k of keys) {
						if (!NAME_RE.test(k)) continue;
						let v: any;
						try { v = holder[k]; } catch { continue; }
						if (typeof v !== "function") continue;

						const e = found.get(k) ?? { n: 0, flags: new Set<string>() };
						e.n++;
						e.flags.add(flagsOf(holder, k));
						found.set(k, e);
					}
				}
			}
		}

		const user: any = findByStoreName("UserStore")?.getCurrentUser?.();
		const userInfo = user
			? Object.getOwnPropertyNames(user).filter(k => /premium|nitro/i.test(k)).map(k => `${k}=${String(user[k])}`).join(", ")
			: "no user";

		const lines = [...found.entries()]
			.sort((a, b) => a[0].localeCompare(b[0]))
			.map(([k, e]) => `${k} x${e.n} ${[...e.flags].join("/")}`);

		const full = `user: ${userInfo}\n${lines.join("\n")}`;
		const shown = `user: ${userInfo}\n${lines.slice(0, 40).join("\n")}${lines.length > 40 ? `\n...+${lines.length - 40} more (tap Copy all)` : ""}`;

		showConfirmationAlert({
			title: `Freemoji probe (${lines.length} found)`,
			content: shown,
			confirmText: "Copy all",
			cancelText: "Close",
			onConfirm: () => {
				try { clipboard.setString(full); showToast("Copied"); } catch { showToast("Copy failed"); }
			},
		});
	} catch (e: any) {
		try { showToast(`Probe failed: ${e?.message ?? e}`); } catch {}
	}
}
