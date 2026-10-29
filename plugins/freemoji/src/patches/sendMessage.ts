import { findByProps } from "@vendetta/metro";
import { before } from "@vendetta/patcher";
import modifyIfNeeded from "../msgProcessor";

const messageModule = findByProps("sendMessage", "receiveMessage");
const uploadModule = findByProps("uploadLocalFiles");

export default [
	...(messageModule ? [before("sendMessage", messageModule, (args) => modifyIfNeeded(args[1]))] : []),
	// since 284, uploadModule doesn't exist
	...(uploadModule ? [before("uploadLocalFiles", uploadModule, (args) => modifyIfNeeded(args[0]?.parsedMessage))] : []),
];
