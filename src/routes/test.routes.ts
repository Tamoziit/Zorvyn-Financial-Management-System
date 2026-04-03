import express from "express";
import { sendEmailTest } from "../controllers/test.controller";

const router = express.Router();

router.post("/send-email", sendEmailTest);

export default router;