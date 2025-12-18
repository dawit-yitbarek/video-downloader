import axios from "axios";

export async function authorizeB2(keyId, appKey) {
    const auth = Buffer.from(`${keyId}:${appKey}`).toString("base64");

    try {
        const res = await axios.get(
            "https://api.backblazeb2.com/b2api/v2/b2_authorize_account",
            {
                headers: {
                    Authorization: `Basic ${auth}`,
                },
            }
        );

        return res.data;
    } catch (err) {
        console.error("Error authorizing B2:", err);
        throw err;
    }
}