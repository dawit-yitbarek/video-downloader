import IORedis from "ioredis";
import { REDIS_URL } from "../config/env.js";

export const redis = new IORedis(REDIS_URL);