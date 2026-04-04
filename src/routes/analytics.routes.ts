import express from "express";
import verifyToken from "../middlewares/auth.middleware";
import { getAccountSummary, getCategorySummary, getMySummary, getTrends, getRecentActivities } from "../controllers/analytics.controller";
import requireAnalyst from "../middlewares/analyst.middleware";

const router = express.Router();

router.get("/my-summary", verifyToken, getMySummary);
router.get("/summary/account/:id", verifyToken, getAccountSummary);
router.get("/summary/categories", verifyToken, requireAnalyst, getCategorySummary);
router.get("/trends", verifyToken, requireAnalyst, getTrends);
router.get("/recent", verifyToken, requireAnalyst, getRecentActivities);

export default router;