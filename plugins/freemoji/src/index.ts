import { storage } from "@vendetta/plugin";
import { logger } from "@vendetta/utils";
import nitroChecks from "./patches/nitroChecks";
import sendMessage from "./patches/sendMessage";

storage.emojiSize ??= 48;
storage.hyperlink ??= true;
storage.forceMoji ??= false;
storage.customHyperLinkString ??= "";
if (typeof storage.emojiSize === "string") storage.emojiSize = parseInt(storage.emojiSize);

const patches = [...nitroChecks, ...sendMessage];
logger.log(`Freemoji loaded with ${patches.length} patches`);

export const onUnload = () => patches.forEach(p => p());
export { default as settings } from "./Settings";
