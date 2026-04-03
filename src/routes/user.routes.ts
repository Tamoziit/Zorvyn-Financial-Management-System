import express from "express";
import verifyToken from "../middlewares/auth.middleware";
import requireAdminRole from "../middlewares/admin.middleware";
import { deleteUser, getAllUsers, getUserById, updateUserRoleAndStatus } from "../controllers/user.controller";

const router = express.Router();

router.get("/", verifyToken, requireAdminRole, getAllUsers);
router.get("/:id", verifyToken, requireAdminRole, getUserById);
router.patch("/update-user-state/:id", verifyToken, requireAdminRole, updateUserRoleAndStatus);
router.delete("/delete-user/:id", verifyToken, requireAdminRole, deleteUser);

export default router;