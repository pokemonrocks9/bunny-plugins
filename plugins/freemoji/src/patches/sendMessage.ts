import { findByProps } from "@vendetta/metro";
import { before } from "@vendetta/patcher";
import modifyIfNeeded from "../msgProcessor";

// Fallback lookup: try finding them together, or fall back to just finding sendMessage
const messageModule = findByProps("sendMessage", "receiveMessage") || findByProps("sendMessage");

// Safe handling for upload module since it's deprecated/removed in newer builds
const uploadModule = findByProps("uploadLocalFiles");

const patches = [];

if (messageModule && messageModule.sendMessage) {
    patches.push(
        before("sendMessage", messageModule, (args) => {
            if (args[1]) modifyIfNeeded(args[1]);
        })
    );
} else {
    console.error("[Freemoji] Failed to find sendMessage module!");
}

if (uploadModule && uploadModule.uploadLocalFiles) {
    patches.push(
        before("uploadLocalFiles", uploadModule, (args) => {
            if (args[0]?.parsedMessage) modifyIfNeeded(args[0].parsedMessage);
        })
    );
}

export default patches; 
