import { findByStoreName } from "@vendetta/metro";

const UserStore = findByStoreName("UserStore");

// While the Nitro spoof is active the live premiumType reads 2, so the real value is kept here.
let real: { type: number | undefined } | null = null;

export const setRealPremiumType = (type: number | undefined) => { real = { type }; };
export const clearRealPremiumType = () => { real = null; };

// premiumType: 1 = Nitro Classic, 2 = Nitro, 3 = Nitro Basic. Basic can't use external emoji.
export function hasRealNitro(): boolean {
	const type = real ? real.type : UserStore?.getCurrentUser?.()?.premiumType;
	return type === 1 || type === 2;
}
