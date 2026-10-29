import { findByProps } from "@vendetta/metro";
import { instead } from "@vendetta/patcher";

const nitroInfo = findByProps("canUseEmojisEverywhere");

// Only patch functions that actually exist in this Discord build.
// Patching a missing one throws and would kill the whole plugin on load.
export default ["canUseEmojisEverywhere", "canUseAnimatedEmojis"]
	.filter(name => typeof nitroInfo?.[name] === "function")
	.map(name => instead(name, nitroInfo, () => true));
