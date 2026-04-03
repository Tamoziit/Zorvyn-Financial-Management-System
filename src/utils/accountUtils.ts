import crypto from "crypto";

export const generateAccountNumber = (): string => {
    const randomPart = crypto.randomInt(100000, 999999); // 6 digits
    const timestampPart = Date.now().toString().slice(-6); // 6 digits

    return `${timestampPart}${randomPart}`; // 12 digits
};

export const generateIFSC = (): string => {
    const prefix = "ZNFM";

    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    let branchCode = "";
    const bytes = crypto.randomBytes(5);

    for (let i = 0; i < 5; i++) {
        branchCode += chars[bytes[i] % chars.length];
    }

    return `${prefix}0${branchCode}`;
};