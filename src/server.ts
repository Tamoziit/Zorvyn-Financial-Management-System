import dotenv from 'dotenv';
dotenv.config();
import express, { Request, Response } from 'express';
import cors from "cors";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import morgan from "morgan";

import connecToMongoDB from './db/connectToMongoDB';
import client from './redis/client';
import { analyticsLimiter, authLimiter, globalLimiter, masterLimiter } from './utils/rateLimiterUtils';

import { serveDocs } from './controllers/root.controller';
import masterRoutes from './routes/master.routes';
import authRoutes from './routes/auth.routes';
import testRoutes from './routes/test.routes';
import userRoutes from './routes/user.routes';
import accountRoutes from './routes/account.routes';
import transactionRoutes from './routes/transactions.routes';
import analyticsRoutes from './routes/analytics.routes';
import { docsCspOverride } from './middlewares/docsCSPOverride.middleware';

const PORT = process.env.PORT || 3000;

const app = express();
const corsOpts = {
    origin: '*',
    methods: [
        'GET',
        'POST',
        'PUT',
        'DELETE',
        'PATCH',
        'OPTIONS'
    ],
    allowHeaders: [
        'Content-Type',
        'Authorization',
        'Accept'
    ],
    credentials: true
};

app.use(cors(corsOpts));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
app.use(helmet());
app.use(helmet.crossOriginResourcePolicy({ policy: "cross-origin" }));
app.use(morgan("common"));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(globalLimiter);
app.set('trust proxy', 1); // trust 1st proxy hop

app.get("/", docsCspOverride, serveDocs);

app.get('/api/v1', (req: Request, res: Response) => {
    res.send('Server Up & Running!');
});

app.use('/api/v1/master', masterLimiter, masterRoutes);
app.use('/api/v1/test', testRoutes);

app.use('/api/v1/auth', authLimiter, authRoutes);
app.use('/api/v1/user', userRoutes);
app.use('/api/v1/account', accountRoutes);
app.use('/api/v1/transactions', transactionRoutes);
app.use('/api/v1/analytics', analyticsLimiter, analyticsRoutes);

app.listen(PORT, () => {
    console.log(`🚀 Server is running on PORT: ${PORT}`);
    connecToMongoDB();

    if (client) {
        console.log("📦 Connected to Redis");
    } else {
        console.log("❌ Error in connecting to Redis");
    }
});