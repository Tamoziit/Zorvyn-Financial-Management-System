import { Request, Response } from "express";
import { SendEmailTestProps } from "../types";
import sendEmail from "../utils/resendUtils";

export const sendEmailTest = async (req: Request, res: Response) => {
    try {
        const { to, subject, message }: SendEmailTestProps = req.body;

        if (!to || !subject || !message) {
            res.status(400).json({ error: "All fields required" });
            return;
        }

        const response = await sendEmail({
            to,
            subject,
            html: `<p>${message}</p>`,
        });

        res.status(200).json({
            success: true,
            response,
        });
    } catch (error) {
        console.log("Error in sendEmailTest controller", error);
        res.status(500).json({ error: "Internal Server error" });
    }
}