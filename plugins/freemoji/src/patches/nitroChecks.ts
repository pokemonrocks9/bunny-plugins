import { findByProps } from "@vendetta/metro";
import { instead } from "@vendetta/patcher";

export default function apply() {
	const nitroInfo = findByProps("canUseEmojisEverywhere");
	return ["canUseEmojisEverywhere", "canUseAnimatedEmojis"]
		.filter(name => typeof nitroInfo?.[name] === "function")
		.map(name => instead(name, nitroInfo, () => true));
}
