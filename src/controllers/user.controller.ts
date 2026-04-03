import { Request, Response } from "express";
import User from "../models/user.model";
import Role from "../models/role.model";
import client from "../redis/client";
import { RoleDocument, UpdateUserStateProps } from "../types";
import DeletedUser from "../models/deletedUser.model";

export const getAllUsers = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const status = req.query.status as "active" | "inactive";
        const role = req.query.role as string;

        const filter: UpdateUserStateProps = {};

        if (status) {
            filter.status = status;
        }

        if (role) {
            const roleDoc = await Role.findOne({ name: role });
            if (roleDoc) {
                filter.role = roleDoc._id;
            } else {
                res.status(200).json({
                    users: [],
                    currentPage: page,
                    totalPages: 0,
                    totalUsers: 0
                });
                return;
            }
        }

        const skip = (page - 1) * limit;

        const [users, totalUsers] = await Promise.all([
            User.find(filter)
                .select("-password")
                .populate("role", "name")
                .skip(skip)
                .limit(limit)
                .sort({ createdAt: -1 }),
            User.countDocuments(filter)
        ]);

        res.status(200).json({
            users,
            currentPage: page,
            totalPages: Math.ceil(totalUsers / limit),
            totalUsers
        });
    } catch (error) {
        console.log("Error in getAllUsers controller", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
}

export const getUserById = async (req: Request, res: Response) => {
    try {
        const id = req.params.id;

        const user = await User.findById(id)
            .select("-password")
            .populate("role", "name");
        if (!user) {
            res.status(400).json({ error: "User not found" });
            return;
        }

        res.status(200).json(user);
    } catch (error) {
        console.log("Error in getUserById controller", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
}

export const updateUserRoleAndStatus = async (req: Request, res: Response) => {
    try {
        const userId = req.params.id;
        const { roleName, status } = req.body;

        const updateData: UpdateUserStateProps = {};
        if (status) {
            updateData.status = status;
        }

        let newRole: RoleDocument | null = null;
        if (roleName) {
            newRole = await Role.findOne({ name: roleName });
            if (!newRole) {
                res.status(400).json({ error: "Role not found" });
                return;
            }
            updateData.role = newRole._id;
        }

        const user = await User.findByIdAndUpdate(userId, updateData, {
            new: true,
            runValidators: true
        }).select("-password");

        if (!user) {
            res.status(400).json({ error: "User not found" });
            return;
        }

        if (newRole) {
            const redisPayloadString = await client.get(`ZN-user:${userId}`);
            if (redisPayloadString) {
                const redisPayload = JSON.parse(redisPayloadString);
                redisPayload.role = newRole;
                await client.set(`ZN-user:${userId}`, JSON.stringify(redisPayload));
                await client.expire(`ZN-user:${userId}`, 30 * 24 * 60 * 60);
            }
        }

        res.status(200).json({ message: "User updated successfully", user });
    } catch (error) {
        console.log("Error in updateUserRole controller", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
}

export const deleteUser = async (req: Request, res: Response) => {
    try {
        const id = req.params.id;
        if (!id) {
            res.status(400).json({ error: "User ID is required" });
            return;
        }

        const user = await User.findById(id);
        if (!user) {
            res.status(400).json({ error: "User not found" });
            return;
        }

        const newDeletedUser = new DeletedUser({
            _id: user._id,
            role: user.role,
            name: user.name,
            email: user.email,
            password: user.password,
            mobileNo: user.mobileNo,
            gender: user.gender,
            address: user.address,
            deletedBy: req.user?._id,
        });

        if (newDeletedUser) {
            await Promise.all([newDeletedUser.save(), User.findByIdAndDelete(id)]);

            res.status(200).json({
                message: "User deleted successfully",
                user: newDeletedUser
            });
        } else {
            res.status(400).json({ error: "Error in deleting user" });
            return;
        }
    } catch (error) {
        console.log("Error in deleteUser controller", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
}