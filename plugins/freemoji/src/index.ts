import { storage } from "@vendetta/plugin";
import { showConfirmationAlert } from "@vendetta/ui/alerts";
import nitroChecks from "./patches/nitroChecks";
import sendMessage from "./patches/sendMessage";

storage.emojiSize ??= 48;
storage.hyperlink ??= true;
storage.forceMoji ??= false;
storage.customHyperLinkString ??= "";

// Migration code, used to be string containing a number but is now just a number
if (typeof storage.emojiSize === "string") storage.emojiSize = parseInt(storage.emojiSize);

// NOTE: `storage.haveNitro` is gone. It used to be computed once with a broken check and persisted,
// so it stuck at `true` for non-Nitro users. Nitro status is now checked live (see premium.ts).
// Any leftover `haveNitro` key in old storage is simply ignored.

// Show on-screen what failed instead of silently doing nothing (there's no log viewer on mobile)
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

// One failing patch group must not stop the others (or the plugin) from loading
for (const [name, apply] of [["nitroChecks", nitroChecks], ["sendMessage", sendMessage]] as const) {
	try {
		patches.push(...apply());
	} catch (e) {
		report(name, e);
	}
}

export const onUnload = () => patches.forEach(p => p());
export { default as settings } from "./Settings";
