import { storage } from "@vendetta/plugin";
import nitroChecks from "./patches/nitroChecks";
import sendMessage from "./patches/sendMessage";

// Default settings
storage.emojiSize ??= 48;
storage.hyperlink ??= true;
storage.forceMoji ??= false;
storage.customHyperLinkString ??= "";

// Migration code, used to be string containing a number but is now just a number
if (typeof storage.emojiSize === "string") storage.emojiSize = parseInt(storage.emojiSize);

// NOTE: `storage.haveNitro` is intentionally gone. It used to be computed once with a
// broken check (premiumType !== null) and persisted, so it stuck at `true` for non-Nitro
// users and the plugin silently did nothing. Nitro status is now checked live in msgProcessor.
// Any leftover `haveNitro` key in old storage is simply ignored.

const patches = [
    ...nitroChecks,
    ...sendMessage,
];

export const onUnload = () => patches.forEach(p => p());
export { default as settings } from "./Settings";
