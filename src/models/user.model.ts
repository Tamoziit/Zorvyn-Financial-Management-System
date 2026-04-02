import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
    role: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Role",
        required: true,
        index: true
    },
    status: {
        type: String,
        enum: ["active", "inactive"],
        default: "active",
        index: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        index: true
    },
    password: {
        type: String,
        min: 6,
        required: true
    },
    mobileNo: {
        type: String,
        min: 10,
        max: 10,
        required: true
    },
    profilePic: {
        type: String
    },
    gender: {
        type: String,
        enum: ["M", "F", "O"],
        required: true
    },
    address: {
        addressLine1: {
            type: String,
            required: true
        },
        addressLine2: {
            type: String
        },
        VTC: {
            type: String,
            required: true
        },
        district: {
            type: String,
            required: true
        },
        state: {
            type: String,
            required: true
        },
        country: {
            type: String,
            required: true
        },
        pincode: {
            type: String,
            required: true
        }
    }
}, { timestamps: true });

const User = mongoose.model("User", UserSchema);
export default User;