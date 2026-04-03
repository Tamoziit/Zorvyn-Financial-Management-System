import express from "express";
import verifyToken from "../middlewares/auth.middleware";
import requireAdminRole from "../middlewares/admin.middleware";
import { createUserAccount, getAccountDetailsById, getMyAccounts, getUserAccounts } from "../controllers/account.controller";

const router = express.Router();

router.get("/user/:id", verifyToken, requireAdminRole, getUserAccounts);
router.get("/my-accounts", verifyToken, getMyAccounts);
router.get("/:id", verifyToken, getAccountDetailsById);
router.post("/create-account/:id", verifyToken, requireAdminRole, createUserAccount);

export default router;