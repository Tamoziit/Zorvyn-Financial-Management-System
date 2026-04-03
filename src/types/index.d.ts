import { Types } from "mongoose";
import { Request } from "express";

export interface MasterToken {
    password: string
}

export interface UserSignupBody {
    roleName?: "viewer" | "analyst" | "admin";
    name: string;
    email: string;
    password: string;
    mobileNo: string;
    gender: "M" | "F" | "O";
    addressLine1: string;
    addressLine2?: string | null;
    VTC: string;
    district: string;
    state: string;
    country: string;
    pincode: string;
}

export interface UserLoginBody {
    email: string;
    password: string;
}

export interface RoleDocument {
    _id: Types.ObjectId;
    name: "viewer" | "analyst" | "admin";
    permissions: string[];
}

export interface User {
    _id: Types.ObjectId;
    role: Types.ObjectId | RoleDocument;
    status: "active" | "inactive";
    name: string;
    email: string;
    password: string;
    mobileNo: string;
    gender: "M" | "F" | "O";
    address?: {
        addressLine1: string;
        addressLine2?: string | null;
        VTC: string;
        district: string;
        state: string;
        country: string;
        pincode: string;
    } | null;
}

declare module "express" {
    export interface Request {
        user?: User;
    }
}

export interface SendEmailParams {
    to: string;
    subject: string;
    html: string;
};

export interface SendEmailTestProps {
    to: string;
    subject: string;
    message: string;
}

export interface UpdateUserStateProps {
    role?: Types.ObjectId;
    status?: "active" | "inactive";
}