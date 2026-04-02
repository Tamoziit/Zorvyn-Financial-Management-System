import mongoose from "mongoose";
import { PERMISSIONS } from "../constants/permissions";

const RoleSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        enum: ["viewer", "analyst", "admin"]
    },
    permissions: [
        {
            type: String,
            enum: Object.values(PERMISSIONS)
        }
    ]
}, { timestamps: true });

const Role = mongoose.model("Role", RoleSchema);
export default Role;