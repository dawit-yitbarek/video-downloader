import path from "path";

const ATTEMPT_LIMIT = 15;
const DOWNLOAD_LIMIT = 10;
const WINDOW_SECONDS = 60 * 60 * 24;
const COOKIE_PATH = path.resolve("./bin/cookies.txt");

export { ATTEMPT_LIMIT, DOWNLOAD_LIMIT, WINDOW_SECONDS, COOKIE_PATH }