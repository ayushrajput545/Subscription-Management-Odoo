
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

/**
 * Sends an email using SMTP credentials from environment variables.
 * Gracefully handles missing SMTP config (logs error, does not throw).
 */
export const sendEmail = async ({ to, subject, html }) => {
    try {
        if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
            console.warn("SMTP not configured — skipping email send.");
            return false;
        }

        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT) || 587,
            secure: Number(process.env.SMTP_PORT) === 465,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });

        await transporter.sendMail({
            from: process.env.EMAIL_FROM || process.env.SMTP_USER,
            to,
            subject,
            html,
        });
        return true;
    } catch (error) {
        // Log but don't expose delivery failures to callers
        console.error("Email delivery error:", error.message);
        return false;
    }
};
