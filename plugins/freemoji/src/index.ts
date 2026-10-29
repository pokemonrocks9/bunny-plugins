import { storage } from "@vendetta/plugin";
import { showConfirmationAlert } from "@vendetta/ui/alerts";
import { showToast } from "@vendetta/ui/toasts";
import nitroChecks from "./patches/nitroChecks";
import sendMessage from "./patches/sendMessage";

storage.emojiSize ??= 48;
storage.hyperlink ??= true;
storage.forceMoji ??= false;
storage.customHyperLinkString ??= "";
if (typeof storage.emojiSize === "string") storage.emojiSize = parseInt(storage.emojiSize);

function report(stage: string, e: any) {
	try {
		showConfirmationAlert({
			title: `Freemoji: ${stage} failed`,
			content: String(e?.stack ?? e),
			confirmText: "OK",
			onConfirm: () => {},
		});
	} catch {}
}

const patches: (() => void)[] = [];
for (const [name, apply] of [["nitroChecks", nitroChecks], ["sendMessage", sendMessage]] as const) {
	try { patches.push(...apply()); } catch (e) { report(name, e); }
}

try { showToast(`Freemoji loaded (${patches.length} patches)`); } catch {}

export const onUnload = () => patches.forEach(p => p());
export { default as settings } from "./Settings";
