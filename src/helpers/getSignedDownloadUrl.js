import axios from "axios";
import { authorizeB2 } from "./b2Client.js";
import {
    B2_BUCKET_ID,
    B2_BUCKET_NAME,
    B2_KEY_ID,
    B2_APP_KEY,
} from "../config/env.js";

export async function getSignedDownloadUrl(fileName, expiresIn = 86400) {
    try {
        // 1️⃣ Authorize
        const authData = await authorizeB2(B2_KEY_ID, B2_APP_KEY);

        const {
            apiUrl,
            authorizationToken,
            downloadUrl,
        } = authData;

        // 2️⃣ Get download authorization
        const res = await axios.post(
            `${apiUrl}/b2api/v2/b2_get_download_authorization`,
            {
                bucketId: B2_BUCKET_ID,
                fileNamePrefix: fileName,
                validDurationInSeconds: expiresIn,
            },
            {
                headers: {
                    Authorization: authorizationToken,
                },
            }
        );

        const { authorizationToken: downloadAuthToken } = res.data;

        // 3️⃣ Final signed URL
        return `${downloadUrl}/file/${B2_BUCKET_NAME}/${fileName}?Authorization=${downloadAuthToken}`;

    } catch (error) {
        console.error("B2 Error Details:", error.response?.data || error.message);
        throw error;
    }
}