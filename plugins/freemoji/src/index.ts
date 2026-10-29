import { storage } from "@vendetta/plugin";
import { showConfirmationAlert } from "@vendetta/ui/alerts";
import { showToast } from "@vendetta/ui/toasts";
import nitroChecks from "./patches/nitroChecks";
import sendMessage from "./patches/sendMessage";
import { runProbe } from "./probe";

storage.emojiSize ??= 48;
storage.hyperlink ??= true;
storage.forceMoji ??= false;
storage.customHyperLinkString ??= "";
if (typeof storage.emojiSize === "string") storage.emojiSize = parseInt(storage.emojiSize);

function report(stage: string, e: any) {
	try {
		showConfirmationAlert({
			title: `Freemoji: ${stage} failed`,
			content: String(e?.message ?? e),
			confirmText: "OK",
			onConfirm: () => {},
		});
	} catch {}
}

const patches: (() => void)[] = [];
const counts: Record<string, number> = {};

for (const [name, apply] of [["nitroChecks", nitroChecks], ["sendMessage", sendMessage]] as const) {
	try {
		const applied = apply();
		patches.push(...applied);
		counts[name] = applied.length;
	} catch (e) {
		counts[name] = 0;
		report(name, e);
	}
}

try { showToast(`Freemoji: nitro ${counts.nitroChecks}, send ${counts.sendMessage}`); } catch {}

// TEMPORARY: remove together with probe.ts once the picker lock is fixed
try { setTimeout(runProbe, 4000); } catch {}

export const onUnload = () => patches.forEach(p => p());
export { default as settings } from "./Settings";
