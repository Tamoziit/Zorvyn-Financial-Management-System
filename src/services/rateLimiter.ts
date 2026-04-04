import rateLimit from 'express-rate-limit';
import RedisStore, { RedisReply } from 'rate-limit-redis';
import client from '../redis/client';

const createLimiter = (windowMs: number, max: number, prefix: string, message: string) =>
    rateLimit({
        windowMs,
        max,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        message: { success: false, message },
        store: new RedisStore({
            sendCommand: (...args: string[]) =>
                client.call(...(args as [string, ...string[]])) as Promise<RedisReply>,
            prefix: `ZN-rl:${prefix}:`,
        }),
    });

export default createLimiter;