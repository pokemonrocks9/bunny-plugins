import { findByStoreName } from "@vendetta/metro";
import { storage } from "@vendetta/plugin";
import { Message } from "./def";
import { hasRealNitro } from "./premium";

// Keep the store objects (not destructured methods) so `this` stays intact,
// and so a missing store doesn't throw at plugin load.
const EmojiStore = findByStoreName("EmojiStore");
const SelectedGuildStore = findByStoreName("SelectedGuildStore");

// https://github.com/luimu64/nitro-spoof/blob/1bb75a2471c39669d590bfbabeb7b922672929f5/index.js#L25
const emojiRegex = /<a?:(\w+):(\d+)>/gi;

function convertUnusableEmojis(content: string, size: number): string {
	const currentGuildId = SelectedGuildStore?.getGuildId?.();

	return content.replace(emojiRegex, (full: string, name: string, id: string) => {
		// The markup itself tells us whether it's animated, no store lookup needed
		const animated = full.startsWith("<a:");
		const emoji = EmojiStore?.getCustomEmojiById?.(id);

		// Usable without Nitro: static emoji from the guild you're currently in.
		// If the store doesn't know the emoji at all, treat it as unusable.
		if (emoji && !animated && emoji.guildId == currentGuildId) return full;

		// Someone removed the url property from emoji, so build the CDN url by hand.
		// I dunno if webp works everywhere
		let url = `https://cdn.discordapp.com/emojis/${id}.webp?size=${size}&quality=lossless&name=${name}`;
		if (animated) url += "&animated=true";

		if (!storage.hyperlink) return url;
		const linkText = storage.customHyperLinkString || name;
		return `[${linkText}](${url})`;
	});
}

export default function modifyIfNeeded(msg?: Message) {
	// content can be missing (e.g. uploads, stickers), never assume it exists
	if (!msg?.content) return;
	if (!storage.forceMoji && hasRealNitro()) return;

	const newContent = convertUnusableEmojis(msg.content, storage.emojiSize).trim();
	if (newContent === msg.content.trim()) return;

	msg.content = newContent;

	// Set invalidEmojis to empty to prevent Discord yelling at you about not having nitro
	msg.invalidEmojis = [];
};
