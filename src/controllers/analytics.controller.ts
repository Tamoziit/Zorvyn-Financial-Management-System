import { Request, Response } from "express";
import Transaction from "../models/transaction.model";
import Account from "../models/account.model";
import { RoleDocument, TransactionFilter } from "../types";
import mongoose from "mongoose";
import buildTransactionFilter from "../utils/buildTransactionFilter";

export const getMySummary = async (req: Request, res: Response) => {
    try {
        const accounts = await Account.find({ userId: req.user?._id });
        const accountIds = accounts.map(a => a._id);

        const netBalance = accounts.reduce((acc, account) => acc + account.balance, 0);

        const transactions = await Transaction.aggregate([
            { $match: { accountId: { $in: accountIds } } },
            {
                $group: {
                    _id: "$type",
                    totalAmount: { $sum: "$amount" }
                }
            }
        ]);

        let totalIncome = 0;
        let totalExpenses = 0;

        transactions.forEach(t => {
            if (t._id === "income") totalIncome = t.totalAmount;
            if (t._id === "expense") totalExpenses = t.totalAmount;
        });

        res.status(200).json({
            totalIncome,
            totalExpenses,
            netBalance
        });
    } catch (error) {
        console.log("Error in getSummary controller", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

export const getAccountSummary = async (req: Request, res: Response) => {
    try {
        const role = req.user?.role as RoleDocument;
        const roleName = role.name;
        const accountId = req.params.id;

        const account = await Account.findById(accountId);
        if (!account) {
            res.status(400).json({ error: "Account not found" });
            return;
        }

        if (roleName === "viewer" && account.userId.toString() !== req.user?._id.toString()) {
            res.status(403).json({ error: "Forbidden - You can only view summary for your own account" });
            return;
        }

        const transactions = await Transaction.aggregate([
            { $match: { accountId: account._id } },
            {
                $group: {
                    _id: "$type",
                    totalAmount: { $sum: "$amount" }
                }
            }
        ]);

        let totalIncome = 0;
        let totalExpenses = 0;

        transactions.forEach(t => {
            if (t._id === "income") totalIncome = t.totalAmount;
            if (t._id === "expense") totalExpenses = t.totalAmount;
        });

        res.status(200).json({
            totalIncome,
            totalExpenses,
            netBalance: account.balance
        });
    } catch (error) {
        console.log("Error in getAccountSummary controller", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

export const getCategorySummary = async (req: Request, res: Response) => {
    try {
        const { accountId } = req.query;

        const matchStage: TransactionFilter & { accountId?: mongoose.Types.ObjectId } = buildTransactionFilter(req.query);

        if (accountId) {
            matchStage.accountId = new mongoose.Types.ObjectId(accountId as string);
        }

        const summary = await Transaction.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: "$category",
                    income: {
                        $sum: { $cond: [{ $eq: ["$type", "income"] }, "$amount", 0] }
                    },
                    expense: {
                        $sum: { $cond: [{ $eq: ["$type", "expense"] }, "$amount", 0] }
                    },
                    total: { $sum: "$amount" }
                }
            },
            {
                $project: {
                    category: "$_id",
                    income: 1,
                    expense: 1,
                    total: 1,
                    _id: 0
                }
            },
            { $sort: { total: -1 } }
        ]);

        res.status(200).json({ summary });
    } catch (error) {
        console.log("Error in getCategorySummary controller", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

export const getTrends = async (req: Request, res: Response) => {
    try {
        const period = req.query.period as "yearly" | "monthly";
        const isYearly = period === "yearly";

        const matchStage: TransactionFilter = buildTransactionFilter(req.query);

        const groupBy: any = isYearly
            ? { year: { $year: "$createdAt" } }
            : { month: { $month: "$createdAt" }, year: { $year: "$createdAt" } };

        const trends = await Transaction.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: groupBy,
                    income: { $sum: { $cond: [{ $eq: ["$type", "income"] }, "$amount", 0] } },
                    expense: { $sum: { $cond: [{ $eq: ["$type", "expense"] }, "$amount", 0] } }
                }
            },
            {
                $sort: isYearly ? { "_id.year": 1 } : { "_id.year": 1, "_id.month": 1 }
            }
        ]);

        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

        const formattedTrends = trends.map(t => {
            if (isYearly) {
                return {
                    year: t._id.year.toString(),
                    income: t.income,
                    expense: t.expense
                };
            } else {
                return {
                    month: monthNames[t._id.month - 1],
                    year: t._id.year,
                    income: t.income,
                    expense: t.expense
                };
            }
        });

        res.status(200).json(formattedTrends);
    } catch (error) {
        console.log("Error in getTrends controller", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

export const getRecentActivities = async (req: Request, res: Response) => {
    try {
        const matchStage: TransactionFilter = buildTransactionFilter(req.query);

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        if (!matchStage.createdAt) {
            matchStage.createdAt = {};
        }

        if (!matchStage.createdAt.$gte) {
            matchStage.createdAt.$gte = sevenDaysAgo;
        }

        const recent = await Transaction.find(matchStage).sort({ createdAt: -1 });

        res.status(200).json(recent);
    } catch (error) {
        console.log("Error in getRecentActivities controller", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};