import { findByStoreName } from "@vendetta/metro";
import { storage } from "@vendetta/plugin";
import type { Message } from "./def";
import { hasRealNitro } from "./premium";

const EmojiStore = findByStoreName("EmojiStore");
const SelectedGuildStore = findByStoreName("SelectedGuildStore");

// https://github.com/luimu64/nitro-spoof/blob/1bb75a2471c39669d590bfbabeb7b922672929f5/index.js#L25
const emojiRegex = /<a?:(\w+):(\d+)>/gi;

function convertUnusableEmojis(content: string, size: number): string {
	const currentGuildId = SelectedGuildStore?.getGuildId?.();

	return content.replace(emojiRegex, (full: string, name: string, id: string) => {
		const animated = full.startsWith("<a:");
		const emoji = EmojiStore?.getCustomEmojiById?.(id);

		// Usable without Nitro: a static emoji from the server you're in
		if (emoji && !animated && emoji.guildId == currentGuildId) return full;

		// Emoji objects no longer carry a url, so build the CDN one by hand
		let url = `https://cdn.discordapp.com/emojis/${id}.webp?size=${size}&quality=lossless&name=${name}`;
		if (animated) url += "&animated=true";

		if (!storage.hyperlink) return url;
		return `[${storage.customHyperLinkString || name}](${url})`;
	});
}

export default function modifyIfNeeded(msg?: Message) {
	if (!msg?.content) return;
	if (!storage.forceMoji && hasRealNitro()) return;

	const newContent = convertUnusableEmojis(msg.content, storage.emojiSize).trim();
	if (newContent === msg.content.trim()) return;

	msg.content = newContent;
	// Stops Discord from complaining about emoji you "can't" use
	msg.invalidEmojis = [];
}
