import express from "express";
import axios from "axios";
import { getSignedDownloadUrl } from "../helpers/getSignedDownloadUrl.js";

const router = express.Router();

router.get("/download/:fileName", async (req, res) => {
    const { fileName } = req.params;

    // 🔒 Security: prevent path traversal
    if (!/^[a-zA-Z0-9._-]+\.mp4$/.test(fileName)) {
        return res.status(400).send("Invalid file");
    }

    try {
        const signedUrl = await getSignedDownloadUrl(fileName, 600);

        const response = await axios.get(signedUrl, {
            responseType: "stream",
        });

        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${fileName}"`
        );

        res.setHeader(
            "Content-Type",
            response.headers["content-type"] || "application/octet-stream"
        );

        if (response.headers["content-length"]) {
            res.setHeader("Content-Length", response.headers["content-length"]);
        }

        response.data.pipe(res);

    } catch (err) {
        console.error("Download proxy error:", err.response?.data || err.message);
        res.status(500).send("Failed to download file");
    }
});


export default router;