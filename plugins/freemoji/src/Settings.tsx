import { ReactNative as RN } from "@vendetta/metro/common";
import { Forms } from "@vendetta/ui/components";
import { useProxy } from "@vendetta/storage";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { storage } from "@vendetta/plugin";
import { UNLOCK_NAMES, unlockKey } from "./unlocks";

const sizeOptions = {
    Tiny: 16,
    Small: 32,
    Medium: 48,
    Big: 56,
    Large: 64,
    Huge: 96,
    Jumbo: 128,
};

const previewUri = "https://cdn.discordapp.com/emojis/926602689213767680.webp";

export default () => {
    useProxy(storage);

    // Looked up at render time so a missing Forms export can't break plugin load
    const { FormSection, FormRadioRow, FormSwitchRow, FormRow, FormInput, FormIcon } = (Forms ?? {}) as any;

    return (
        <RN.ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 38 }}>
            <FormSection title="Settings" titleStyleType="no_border">
                <FormSwitchRow
                    label="Force Freemoji"
                    subLabel="Explicitly force Freemoji even if you have nitro (useful for testing)"
                    leading={<FormIcon source={getAssetIDByName("img_nitro_emojis")} />}
                    value={storage.forceMoji}
                    onValueChange={() => { storage.forceMoji = !storage.forceMoji; }}
                    note=""
                />
                <FormSwitchRow
                    label="Hyperlink emoji"
                    subLabel="Hyperlinks emoji link to be less distractive"
                    leading={<FormIcon source={getAssetIDByName("ic_link")} />}
                    value={storage.hyperlink}
                    onValueChange={() => { storage.hyperlink = !storage.hyperlink; }}
                    note=""
                />
                <FormRow
                    label="Custom Hyperlink text"
                    leading={<FormIcon source={getAssetIDByName("ic_link")} />}
                />
                <FormInput
                    title=""
                    placeholder="Put text here. Leave empty to use emoji's name."
                    value={storage.customHyperLinkString}
                    onChange={(x: string) => { storage.customHyperLinkString = x; }}
                    style={{ marginTop: -25, marginHorizontal: 12 }}
                />
            </FormSection>
            <FormSection title="Emoji Size">
                {Object.entries(sizeOptions).map(([name, size]) => (
                    <FormRadioRow
                        key={name}
                        label={name}
                        subLabel={String(size)}
                        selected={storage.emojiSize === size}
                        onPress={() => { storage.emojiSize = size; }}
                    />
                ))}
            </FormSection>
            <FormSection title="Advanced (turn the plugin off and on after changing)">
                <FormSwitchRow
                    label="Spoof Nitro on your account"
                    subLabel="Client-side only. Quiets the Nitro upsell UI."
                    leading={<FormIcon source={getAssetIDByName("img_nitro_emojis")} />}
                    value={storage.spoofNitro !== false}
                    onValueChange={(v: boolean) => { storage.spoofNitro = v; }}
                    note=""
                />
                {UNLOCK_NAMES.map(name => (
                    <FormSwitchRow
                        key={name}
                        label={name}
                        subLabel="Emoji unlock patch. Turn off if the emoji picker crashes."
                        leading={<FormIcon source={getAssetIDByName("img_nitro_emojis")} />}
                        value={storage[unlockKey(name)] !== false}
                        onValueChange={(v: boolean) => { storage[unlockKey(name)] = v; }}
                        note=""
                    />
                ))}
            </FormSection>
            <FormSection title="Preview">
                <RN.Image
                    source={{
                        uri: `${previewUri}?size=${storage.emojiSize}`,
                        width: storage.emojiSize,
                        height: storage.emojiSize,
                    }}
                />
            </FormSection>
        </RN.ScrollView>
    );
};
