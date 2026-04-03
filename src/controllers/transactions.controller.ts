import { Request, Response } from "express";
import Account from "../models/account.model";
import { AccountTransactionFilter, PopulatedTransaction, RoleDocument, TransactionRecordCreationProps } from "../types";
import Transaction from "../models/transaction.model";
import DeletedTransaction from "../models/deletedTransaction.model";
import buildTransactionFilter from "../utils/buildTransactionFilter";

export const createTransactionRecord = async (req: Request, res: Response) => {
    try {
        const id = req.params.id;
        const { amount, type, category, note }: TransactionRecordCreationProps = req.body;

        const account = await Account.findById(id);
        if (!account) {
            res.status(400).json({ error: "Cannot find account with this ID" });
            return;
        }

        if (!amount || !type || !category) {
            res.status(400).json({ error: "All fields are required" });
            return;
        }
        if (amount <= 0) {
            res.status(400).json({ error: "Enter a valid Transaction amount" });
            return;
        }
        if (type !== "expense" && type !== "income") {
            res.status(400).json({ error: "Enter a valid Transaction type" });
            return;
        }
        if (
            category !== "salary" &&
            category !== "essentials" &&
            category !== "loan" &&
            category !== "luxury" &&
            category !== "rent" &&
            category !== "tax" &&
            category !== "others"
        ) {
            res.status(400).json({ error: "Enter a valid Transaction category" });
            return;
        }
        if (type === "expense" && amount > account.balance) {
            res.status(400).json({ error: "Insufficient Balance" });
            return;
        }

        const newTransaction = new Transaction({
            accountId: account._id,
            amount,
            type,
            category,
            note,
            createdBy: req.user?._id
        });

        if (newTransaction) {
            account.transactions.push(newTransaction._id);
            account.balance =
                type === "expense"
                    ? account.balance - amount
                    : account.balance + amount;

            await Promise.all([newTransaction.save(), account.save()]);
            res.status(201).json(newTransaction);
        } else {
            res.status(400).json({ error: "Error in creating Transaction Record" });
        }
    } catch (error) {
        console.log("Error in createTransactionRecord controller", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

export const getMyTransactions = async (req: Request, res: Response) => {
    try {
        const page = Math.max(1, parseInt(req.query.page as string) || 1);
        const limit = Math.max(1, parseInt(req.query.limit as string) || 10);
        const skip = (page - 1) * limit;

        // Resolving every account that belongs to the requesting user
        const accounts = await Account.find({ userId: req.user?._id }).select("_id");
        if (!accounts.length) {
            res.status(200).json({
                transactions: [],
                currentPage: page,
                totalPages: 0,
                totalTransactions: 0
            });
            return;
        }

        const filter: AccountTransactionFilter = {
            accountId: { $in: accounts.map(a => a._id) },
            ...buildTransactionFilter(req.query)
        };

        const [transactions, totalTransactions] = await Promise.all([
            Transaction.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate("accountId", "_id userId"),
            Transaction.countDocuments(filter)
        ]);

        res.status(200).json({
            transactions,
            currentPage: page,
            totalPages: Math.ceil(totalTransactions / limit),
            totalTransactions
        });
    } catch (error) {
        console.log("Error in getMyTransactions controller", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

export const getRecordById = async (req: Request, res: Response) => {
    try {
        const id = req.params.id;

        const transaction = await Transaction.findById(id)
            .populate("accountId", "_id userId") as PopulatedTransaction | null;

        if (!transaction) {
            res.status(400).json({ error: "Cannot find Transaction with this ID" });
            return;
        }

        const role = req.user?.role as RoleDocument;
        const roleName = role.name;
        if (
            (roleName === "viewer" || roleName === "analyst") &&
            req.user?._id.toString() !== transaction.accountId.userId.toString()
        ) {
            res.status(403).json({
                error: "Forbidden - You are not allowed to view any other transaction other than yours"
            });
            return;
        }

        res.status(200).json(transaction);
    } catch (error) {
        console.log("Error in getRecordById controller", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

export const getUserTransactionRecords = async (req: Request, res: Response) => {
    try {
        const id = req.params.id;
        const page = Math.max(1, parseInt(req.query.page as string) || 1);
        const limit = Math.max(1, parseInt(req.query.limit as string) || 10);
        const skip = (page - 1) * limit;

        // Resolve every account belonging to the target user
        const accounts = await Account.find({ userId: id }).select("_id");
        if (!accounts.length) {
            res.status(200).json({
                transactions: [],
                currentPage: page,
                totalPages: 0,
                totalTransactions: 0
            });
            return;
        }

        const filter: AccountTransactionFilter = {
            accountId: { $in: accounts.map(a => a._id) },
            ...buildTransactionFilter(req.query)
        };

        const [transactions, totalTransactions] = await Promise.all([
            Transaction.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate("accountId", "_id userId"),
            Transaction.countDocuments(filter)
        ]);

        res.status(200).json({
            transactions,
            currentPage: page,
            totalPages: Math.ceil(totalTransactions / limit),
            totalTransactions
        });
    } catch (error) {
        console.log("Error in getUserTransactionRecords controller", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

export const getAllTransactionRecords = async (req: Request, res: Response) => {
    try {
        const page = Math.max(1, parseInt(req.query.page as string) || 1);
        const limit = Math.max(1, parseInt(req.query.limit as string) || 10);
        const skip = (page - 1) * limit;

        const filter = buildTransactionFilter(req.query);

        const [transactions, totalTransactions] = await Promise.all([
            Transaction.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate("accountId", "_id userId"),
            Transaction.countDocuments(filter)
        ]);

        res.status(200).json({
            transactions,
            currentPage: page,
            totalPages: Math.ceil(totalTransactions / limit),
            totalTransactions
        });
    } catch (error) {
        console.log("Error in getAllTransactionRecords controller", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

export const updateRecord = async (req: Request, res: Response) => {
    try {
        const transactionId = req.params.id;

        const existing = await Transaction.findById(transactionId);
        if (!existing) {
            res.status(400).json({ error: "Transaction not found" });
            return;
        }

        const {
            accountId: newAccountId,
            amount: newAmount,
            type: newType,
            category: newCategory,
            note: newNote
        } = req.body;

        const finalAccountId = newAccountId ?? existing.accountId.toString();
        const finalAmount    = newAmount    ?? existing.amount;
        const finalType      = newType      ?? existing.type;
        const finalCategory  = newCategory  ?? existing.category;

        if (newAmount !== undefined && newAmount <= 0) {
            res.status(400).json({ error: "Enter a valid Transaction amount" });
            return;
        }
        if (newType !== undefined && newType !== "income" && newType !== "expense") {
            res.status(400).json({ error: "Enter a valid Transaction type" });
            return;
        }

        const oldAccount = await Account.findById(existing.accountId);
        if (!oldAccount) {
            res.status(400).json({ error: "Original account not found" });
            return;
        }

        const accountChanged = finalAccountId !== existing.accountId.toString();

        if (accountChanged) {
            const newAccount = await Account.findById(finalAccountId);
            if (!newAccount) {
                res.status(400).json({ error: "New account not found" });
                return;
            }

            // Guard: the new account must belong to the same user as the old one
            if (oldAccount.userId.toString() !== newAccount.userId.toString()) {
                res.status(403).json({ error: "Cannot move a transaction to another user's account" });
                return;
            }

            // Reversing the original transaction on the OLD account
            const oldAccountNewBalance =
                existing.type === "expense"
                    ? oldAccount.balance + existing.amount
                    : oldAccount.balance - existing.amount;

            if (oldAccountNewBalance < 0) {
                // Edge case: reversing an income that was partially spent
                res.status(400).json({ error: "Reverting this transaction would cause a negative balance on the original account" });
                return;
            }

            if (finalType === "expense" && finalAmount > newAccount.balance) {
                res.status(400).json({ error: "Insufficient balance in the target account" });
                return;
            }
            const newAccountNewBalance =
                finalType === "expense"
                    ? newAccount.balance - finalAmount
                    : newAccount.balance + finalAmount;

            oldAccount.balance     = oldAccountNewBalance;
            oldAccount.transactions = oldAccount.transactions.filter(
                t => t.toString() !== transactionId
            );

            newAccount.balance = newAccountNewBalance;
            newAccount.transactions.push(existing._id);

            existing.accountId = finalAccountId;
            existing.amount    = finalAmount;
            existing.type      = finalType;
            existing.category  = finalCategory;
            if (newNote !== undefined) existing.note = newNote;

            await Promise.all([existing.save(), oldAccount.save(), newAccount.save()]);
        } else {
            const reversedBalance =
                existing.type === "expense"
                    ? oldAccount.balance + existing.amount
                    : oldAccount.balance - existing.amount;

            if (finalType === "expense" && finalAmount > reversedBalance) {
                res.status(400).json({ error: "Insufficient Balance" });
                return;
            }

            oldAccount.balance =
                finalType === "expense"
                    ? reversedBalance - finalAmount
                    : reversedBalance + finalAmount;

            existing.amount   = finalAmount;
            existing.type     = finalType;
            existing.category = finalCategory;
            if (newNote !== undefined) existing.note = newNote;

            await Promise.all([existing.save(), oldAccount.save()]);
        }

        res.status(200).json({ message: "Transaction updated successfully", transaction: existing });
    } catch (error) {
        console.log("Error in updateRecord controller", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

export const deleteTransaction = async (req: Request, res: Response) => {
    try {
        const id = req.params.id;
        if (!id) {
            res.status(400).json({ error: "Transaction ID is required" });
            return;
        }

        const transaction = await Transaction.findById(id);
        if (!transaction) {
            res.status(400).json({ error: "Transaction not found" });
            return;
        }

        const account = await Account.findById(transaction.accountId);
        if (!account) {
            res.status(400).json({ error: "Associated account not found" });
            return;
        }

        const newDeletedTransaction = new DeletedTransaction({
            _id: transaction._id,
            accountId: transaction.accountId,
            amount: transaction.amount,
            type: transaction.type,
            category: transaction.category,
            note: transaction.note,
            createdBy: transaction.createdBy,
            deletedBy: req.user?._id,
        });

        if (newDeletedTransaction) {
            // Revert balance in the associated account
            const revertedBalance =
                transaction.type === "expense"
                    ? account.balance + transaction.amount // Give money back if it was an expense
                    : account.balance - transaction.amount; // Take money out if it was an income

            // Only guard if reverting income causes negative balance
            if (transaction.type === "income" && revertedBalance < 0) {
                res.status(400).json({ error: "Cannot delete this income transaction: it would result in a negative account balance." });
                return;
            }

            account.balance = revertedBalance;

            // Remove transaction reference from the account
            account.transactions = account.transactions.filter(
                (tId) => tId.toString() !== id
            );

            await Promise.all([
                newDeletedTransaction.save(),
                Transaction.findByIdAndDelete(id),
                account.save()
            ]);

            res.status(200).json({
                message: "Transaction deleted successfully",
                transaction: newDeletedTransaction
            });
        } else {
            res.status(400).json({ error: "Error in deleting transaction" });
        }
    } catch (error) {
        console.log("Error in deleteTransaction controller", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};