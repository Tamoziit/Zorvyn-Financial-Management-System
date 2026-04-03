import mongoose from "mongoose";

const TransactionSchema = new mongoose.Schema({
    accountId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Account",
        required: true,
        index: true
    },
    amount: {
        type: Number,
        required: true
    },
    type: {
        type: String,
        enum: ["income", "expense"],
        required: true,
        index: true
    },
    category: {
        type: String,
        enum: [
            "salary",
            "rent",
            "luxury",
            "essentials",
            "loan",
            "tax",
            "others"
        ],
        required: true,
        index: true
    },
    note: {
        type: String,
        trim: true,
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    }
}, { timestamps: true });

const Transaction = mongoose.model("Transaction", TransactionSchema);
export default Transaction;