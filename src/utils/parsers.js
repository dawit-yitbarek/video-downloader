function parseTikTokInfo(info) {
    const format = info.requested_downloads?.[0] || info.formats.find(f => f.url);
    return {
        platform: "tiktok",
        id: info.id,
        title: info.title || info.fulltitle,
        uploader: info.uploader,
        thumbnail: info.thumbnail || (info.thumbnails?.[0]?.url ?? null),
        video: {
            url: format?.url,
            width: format?.width,
            height: format?.height,
            filesize: format?.filesize ?? format?.filesize_approx,
            ext: format?.ext,
        },
    };
}

function parseInstagramInfo(info) {
    if (!info) return null;
    const format = info.requested_downloads?.[0] ||
        info.formats.find(f => f.format_id === "8") ||
        info.formats.find(f => f.ext === "mp4");

    let filesize = format?.filesize ?? format?.filesize_approx ?? null;
    if (!filesize && format?.width && format?.height) {
        const sameResFormat = info.formats.find(
            f => f.width === format.width && f.height === format.height && (f.filesize || f.filesize_approx)
        );
        if (sameResFormat) filesize = sameResFormat.filesize ?? sameResFormat.filesize_approx;
    }

    return {
        platform: "instagram",
        id: info.id,
        title: info.title || info.fulltitle,
        uploader: info.uploader,
        thumbnail: info.thumbnail || (info.thumbnails?.[0]?.url ?? null),
        video: { url: format?.url, width: format?.width, height: format?.height, filesize, ext: format?.ext },
    };
}

function parseYouTubeInfo(info) {
    const format = info.formats.find(f => f.ext === "mp4" && f.vcodec !== "none" && f.acodec !== "none")
        || info.formats.find(f => f.ext === "mp4");
    return {
        platform: "youtube",
        id: info.id,
        title: info.title || info.fulltitle,
        uploader: info.uploader,
        thumbnail: info.thumbnail || (info.thumbnails?.[0]?.url ?? null),
        video: { url: format?.url, width: format?.width, height: format?.height, filesize: format?.filesize ?? format?.filesize_approx, ext: format?.ext },
    };
}

export function parseVideoInfo(info) {
    switch (info.extractor_key?.toLowerCase()) {
        case "tiktok": return parseTikTokInfo(info);
        case "instagram": return parseInstagramInfo(info);
        case "youtube": return parseYouTubeInfo(info);
        default: return null;
    }
}