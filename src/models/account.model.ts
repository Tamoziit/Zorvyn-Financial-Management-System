import mongoose from "mongoose";

const AccountSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
    },
    accountNo: {
        type: String,
        min: 12,
        max: 12,
        unique: true,
        required: true
    },
    IFSC: {
        type: String,
        min: 10,
        max: 10,
        unique: true,
        required: true
    },
    balance: {
        type: Number,
        required: true,
        default: 2000
    },
    transactions: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Transaction",
            required: true
        }
    ]
}, { timestamps: true });

const Account = mongoose.model("Account", AccountSchema);
export default Account;