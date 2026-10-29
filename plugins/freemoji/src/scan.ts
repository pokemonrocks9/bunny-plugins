import { clipboard } from "@vendetta/metro/common";
import { showConfirmationAlert } from "@vendetta/ui/alerts";
import { showToast } from "@vendetta/ui/toasts";

// TEMPORARY DEBUG: lists emoji picker related hooks/helpers in loaded modules.
const NAME_RE = /(^use.*emoji)|(emoji.*(categor|section|picker|row|cell|grid|premium|lock|upsell))/i;
const isObj = (x: any) => x && (typeof x === "object" || typeof x === "function");

function flagsOf(holder: any, k: string): string {
	try {
		const d = Object.getOwnPropertyDescriptor(holder, k);
		if (!d) return "inherited";
		if (d.get) return d.configurable ? "getter(cfg)" : "getter(locked)";
		return d.writable ? "writable" : d.configurable ? "readonly(cfg)" : "FROZEN";
	} catch { return "?"; }
}

export function runScan() {
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

		const lines = [...found.entries()]
			.sort((a, b) => a[0].localeCompare(b[0]))
			.map(([k, e]) => `${k} x${e.n} ${[...e.flags].join("/")}`);

		const full = lines.join("\n");
		const shown = `${lines.slice(0, 45).join("\n")}${lines.length > 45 ? `\n...+${lines.length - 45} more (tap Copy all)` : ""}`;

		showConfirmationAlert({
			title: `Emoji scan (${lines.length} found)`,
			content: shown,
			confirmText: "Copy all",
			cancelText: "Close",
			onConfirm: () => {
				try { clipboard.setString(full); showToast("Copied"); } catch { showToast("Copy failed"); }
			},
		});
	} catch (e: any) {
		try { showToast(`Scan failed: ${e?.message ?? e}`); } catch {}
	}
}
