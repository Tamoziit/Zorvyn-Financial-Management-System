import express from 'express';
import { login, logout, signup } from '../controllers/auth.controller';
import verifyToken from '../middlewares/auth.middleware';
import requireAdminRole from '../middlewares/admin.middleware';

const router = express.Router();

router.post("/signup", verifyToken, requireAdminRole, signup);
router.post("/login", login);
router.post("/logout/:id", verifyToken, logout);

export default router;  