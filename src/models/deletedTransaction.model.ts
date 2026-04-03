import mongoose from "mongoose";

/**
 * DeletedTransaction — soft-delete archive for Transaction documents.
 *
 * When a transaction is "deleted", its full document is copied here before
 * being removed from the live `transactions` collection. This preserves a
 * complete audit trail while keeping the active collection clean.
 *
 * The _id is intentionally kept the same as the original transaction _id so
 * that any external reference (logs, exports) can still be cross-referenced.
 */
const DeletedTransactionSchema = new mongoose.Schema({
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
        trim: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    deletedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
    },
    deletedAt: {
        type: Date,
        required: true,
        default: () => new Date()
    }
}, { timestamps: true });

const DeletedTransaction = mongoose.model("DeletedTransaction", DeletedTransactionSchema);
export default DeletedTransaction;
