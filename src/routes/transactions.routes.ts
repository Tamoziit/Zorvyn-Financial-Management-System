import express from "express";
import verifyToken from "../middlewares/auth.middleware";
import requireAdminRole from "../middlewares/admin.middleware";
import { createTransactionRecord, deleteTransaction, getAllTransactionRecords, getMyTransactions, getRecordById, getUserTransactionRecords, updateRecord } from "../controllers/transactions.controller";

const router = express.Router();

router.post("/create-record/:id", verifyToken, requireAdminRole, createTransactionRecord);
router.get("/my-transactions", verifyToken, getMyTransactions);
router.get("/user/:id", verifyToken, requireAdminRole, getUserTransactionRecords);
router.get("/", verifyToken, requireAdminRole, getAllTransactionRecords);
router.get("/:id", verifyToken, getRecordById);
router.patch("/update/:id", verifyToken, requireAdminRole, updateRecord);
router.delete("/delete/:id", verifyToken, requireAdminRole, deleteTransaction);

export default router;