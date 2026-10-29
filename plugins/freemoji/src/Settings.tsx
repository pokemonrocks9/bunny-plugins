import { ReactNative as RN } from "@vendetta/metro/common";
import { Forms } from "@vendetta/ui/components";
import { useProxy } from "@vendetta/storage";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { storage } from "@vendetta/plugin";

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
