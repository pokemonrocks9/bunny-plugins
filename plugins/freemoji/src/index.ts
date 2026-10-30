import { storage } from "@vendetta/plugin";
import { showConfirmationAlert } from "@vendetta/ui/alerts";
import nitroChecks from "./patches/nitroChecks";
import sendMessage from "./patches/sendMessage";

storage.emojiSize ??= 48;
storage.hyperlink ??= true;
storage.forceMoji ??= false;
storage.customHyperLinkString ??= "";

// emojiSize used to be a string containing a number
if (typeof storage.emojiSize === "string") storage.emojiSize = parseInt(storage.emojiSize);

// Mobile has no easy log viewer, so surface load failures on screen
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

// A failing patch group must not stop the others from loading
for (const [name, apply] of [["nitroChecks", nitroChecks], ["sendMessage", sendMessage]] as const) {
	try {
		patches.push(...apply());
	} catch (e) {
		report(name, e);
	}
}

export const onUnload = () => patches.forEach(p => p());
export { default as settings } from "./Settings";
