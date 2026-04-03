import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";

const MASTER_PASSWORD = process.env.MASTER_PASSWORD;

const verifyMaster = (req: Request, res: Response, next: NextFunction) => {
	try {
		const authHeader = req.headers.authorization;
		if (!authHeader || !authHeader.startsWith("Bearer ")) {
			res.status(401).json({ message: "Unauthorized: No token provided" });
			return;
		}

		const token = authHeader.split(" ")[1];
		const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload & { masterPassword: string };
		if (!decoded || !decoded.masterPassword) {
			res.status(401).json({ message: "Unauthorized: Invalid token" });
			return;
		}

		if (decoded.masterPassword !== MASTER_PASSWORD) {
			res.status(403).json({ message: "Forbidden: Invalid admin password" });
			return;
		}

		next();
	} catch (error) {
		console.error("Error verifyAdmin middleware", error);
		res.status(500).json({ error: "Internal Server Error" });
	}
};

export default verifyMaster;