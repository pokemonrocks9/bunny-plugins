import { findByStoreName } from "@vendetta/metro";

const UserStore = findByStoreName("UserStore");

// premiumType: 0/undefined = none, 1 = Nitro Classic, 2 = Nitro, 3 = Nitro Basic.
// When the Nitro spoof is active the live value reads as 2, so the real value is
// captured before spoofing and kept here.
let captured = false;
let capturedType: number | undefined;

export function setRealPremiumType(t: number | undefined) {
	captured = true;
	capturedType = t;
}

export function clearRealPremiumType() {
	captured = false;
	capturedType = undefined;
}

export function getRealPremiumType(): number | undefined {
	return captured ? capturedType : UserStore?.getCurrentUser?.()?.premiumType;
}

// Basic (3) can't use external emoji, so only Classic (1) and full Nitro (2) count.
export function hasRealNitro(): boolean {
	const t = getRealPremiumType();
	return t === 1 || t === 2;
}
