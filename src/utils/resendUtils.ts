import resend from "../services/resend";
import { SendEmailParams } from "../types";

export const sendEmail = async ({ to, subject, html }: SendEmailParams) => {
    return await resend.emails.send({
        from: "onboarding@resend.dev", // default test sender
        to,
        subject,
        html,
    });
}

export default sendEmail;