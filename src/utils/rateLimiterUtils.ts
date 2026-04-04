import createLimiter from "../services/rateLimiter";

// Global limiter — applied to all routes
export const globalLimiter = createLimiter(
    15 * 60 * 1000,  // 15 minutes
    200,              // 200 requests per window
    'global',
    'Too many requests, please try again later.'
);

// Auth routes (login, signup)
export const authLimiter = createLimiter(
    15 * 60 * 1000,  // 15 minutes
    10,               // 10 attempts per window
    'auth',
    'Too many login attempts, please try again in 15 minutes.'
);

// Master route
export const masterLimiter = createLimiter(
    60 * 60 * 1000,  // 1 hour
    5,
    'master',
    'Master route access limit exceeded.'
);

// Analytics
export const analyticsLimiter = createLimiter(
    5 * 60 * 1000,   // 5 minutes
    30,
    'analytics',
    'Analytics request limit reached, please slow down.'
);