// Emoji lock checks on current Discord builds (all plain writable functions, found with the probe).
// Each one can be switched off in the plugin settings (storage key: unlock_<name>), which makes
// it possible to find out which one breaks the emoji picker without redeploying.
export const UNLOCK_NAMES = [
	"isEmojiPremiumLocked",
	"isEmojiCategoryNitroLocked",
	"isEmojiFilteredOrLocked",
	"isEmojiFiltered",
	"isEmojiDisabled",
	"getEmojiUnavailableReasons",
];

// TEMPORARY DEBUG: watched (call + return value recorded) but never changed.
export const OBSERVE_NAMES = [
	"getEmojiUnavailableReason",
	"filterUnsupportedEmojis",
	"isUnusableRoleSubscriptionEmoji",
	"isEmojiEmpty",
];

export const unlockKey = (name: string) => `unlock_${name}`;
