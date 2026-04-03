import { Request, Response, NextFunction } from "express";
import { RoleDocument } from "../types";

const requireAnalyst = (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.user || !req.user.role) {
            res.status(401).json({ message: "Unauthorized - Role not found" });
            return;
        }
        
        const role = req.user.role as RoleDocument;
        const roleName = role.name;
        
        // Allowed roles: analyst, admin
        if (["analyst", "admin"].includes(roleName)) {
            next();
        } else {
            res.status(403).json({ message: "Forbidden - Requires Analyst role" });
        }
    } catch (error) {
        console.error("Error in requireAnalyst middleware", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

export default requireAnalyst;
