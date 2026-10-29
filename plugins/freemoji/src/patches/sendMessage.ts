import { findByProps } from "@vendetta/metro";
import { before } from "@vendetta/patcher";
import modifyIfNeeded from "../msgProcessor";

export default function apply() {
	const messageModule = findByProps("sendMessage", "receiveMessage");
	const uploadModule = findByProps("uploadLocalFiles");
	return [
		...(messageModule ? [before("sendMessage", messageModule, (args) => modifyIfNeeded(args[1]))] : []),
		...(uploadModule ? [before("uploadLocalFiles", uploadModule, (args) => modifyIfNeeded(args[0]?.parsedMessage))] : []),
	];
}
