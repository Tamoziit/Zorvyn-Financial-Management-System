import { TransactionFilter, TransactionFilterQuery } from "../types";

function buildTransactionFilter(query: TransactionFilterQuery): TransactionFilter {
    const filter: TransactionFilter = {};

    if (query.type) {
        filter.type = query.type;
    }

    if (query.category) {
        filter.category = query.category;
    }

    if (query.startDate || query.endDate) {
        filter.createdAt = {};

        if (query.startDate) {
            filter.createdAt.$gte = new Date(query.startDate);
        }

        if (query.endDate) {
            const end = new Date(query.endDate);
            end.setUTCHours(23, 59, 59, 999);
            filter.createdAt.$lte = end;
        }
    }

    return filter;
}

export default buildTransactionFilter;