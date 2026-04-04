import { Request, Response, NextFunction } from "express";

export const docsCspOverride = (req: Request, res: Response, next: NextFunction) => {
    res.setHeader(
        "Content-Security-Policy",
        [
            "default-src 'self'",
            "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
            "img-src 'self' data: https://firm-emerald-aompjj2hlz.edgeone.app",
            "font-src 'self' https://cdnjs.cloudflare.com",
            "script-src 'none'",
        ].join("; ")
    );
    next();
};