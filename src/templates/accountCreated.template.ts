export const getAccountCreatedTemplate = (name: string, email: string, password: string) => {
    return `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
            <h2 style="color: #2c3e50;">Welcome to Zorvyn Finance Management!</h2>
            <p>Hi <strong>${name}</strong>,</p>
            <p>Your account has been successfully created by the administrator. Below are your login credentials:</p>
            <div style="background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0; border: 1px solid #e9ecef;">
                <p style="margin: 0 0 10px 0;"><strong>Email:</strong> ${email}</p>
                <p style="margin: 0;"><strong>Password:</strong> ${password}</p>
            </div>
            <p style="color: #dc3545; font-size: 0.9em;"><em>For security reasons, please log in and change your password immediately.</em></p>
            <p style="margin-top: 30px;">Best regards,<br/><strong>The Zorvyn Team</strong></p>
        </div>
    `;
};
