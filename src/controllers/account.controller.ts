import { Request, Response } from "express";
import User from "../models/user.model";
import { generateAccountNumber, generateIFSC } from "../utils/accountUtils";
import { AccountCreationProps, RoleDocument } from "../types";
import Account from "../models/account.model";

export const createUserAccount = async (req: Request, res: Response) => {
    try {
        const id = req.params.id;
        const { balance }: AccountCreationProps = req.body || {};

        const user = await User.findById(id).select("-password");
        if (!user) {
            res.status(400).json({ error: "User not found" });
            return;
        }

        const accountNo = generateAccountNumber();
        const IFSC = generateIFSC();

        const newAccount = new Account({
            userId: user._id,
            accountNo,
            IFSC,
            ...(req.body && balance !== undefined && { balance })
        });

        if (newAccount) {
            await newAccount.save();
            res.status(201).json(newAccount);
        } else {
            res.status(400).json({ error: "Error in creating Account" });
            return;
        }
    } catch (error) {
        console.log("Error in createUserAccount controller", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
}

export const getUserAccounts = async (req: Request, res: Response) => {
    try {
        const id = req.params.id;

        const accounts = await Account.find({ userId: id });
        if (!accounts || !Array.isArray(accounts)) {
            res.status(400).json({ error: "Cannot find Accounts for this User ID" });
            return;
        }

        res.status(200).json(accounts);
    } catch (error) {
        console.log("Error in getAccountDetailsById controller", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
}

export const getMyAccounts = async (req: Request, res: Response) => {
    try {
        const accounts = await Account.find({ userId: req.user?._id });
        if (!accounts || !Array.isArray(accounts)) {
            res.status(400).json({ error: "Cannot find Accounts. Try again later." });
            return;
        }

        res.status(200).json(accounts);
    } catch (error) {
        console.log("Error in getAccountDetailsById controller", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
}

export const getAccountDetailsById = async (req: Request, res: Response) => {
    try {
        const id = req.params.id;

        const account = await Account.findById(id);
        if (!account) {
            res.status(400).json({ error: "Cannot find Account with this ID" });
            return;
        }

        const role = req.user?.role as RoleDocument;
        const roleName = role.name;
        if ((roleName === "viewer" || roleName === "analyst") && req.user?._id.toString() !== account.userId.toString()) {
            res.status(403).json({ error: "Forbidden - You are not allowed to view any other account other than yours" });
            return;
        }

        res.status(200).json(account);
    } catch (error) {
        console.log("Error in getAccountDetailsById controller", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
}