import express from 'express';
import { addAdmin, getToken } from '../controllers/master.controller';
import verifyMaster from '../middlewares/master.middleware';

const router = express.Router();

router.post("/get-token", getToken);
router.post("/add-admin", verifyMaster, addAdmin);

export default router;