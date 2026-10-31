
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

let transporter;
let warnedMissingSmtp = false;

export const sendEmail = async ({ to, subject, html, messageId }) => {
    try {
        const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
        if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
            if (!warnedMissingSmtp) {
                console.warn("SMTP is not fully configured; email notifications will be skipped.");
                warnedMissingSmtp = true;
            }
            return false;
        }

        if (!transporter) {
            const port = Number(process.env.SMTP_PORT) || 587;
            transporter = nodemailer.createTransport({
                host: SMTP_HOST,
                port,
                secure: port === 465,
                auth: {
                    user: SMTP_USER,
                    pass: SMTP_PASS,
                },
            });
        }

        await transporter.sendMail({
            from: process.env.SMTP_FROM || process.env.EMAIL_FROM || SMTP_USER,
            to,
            subject,
            html,
            messageId,
        });
        return true;
    } catch (error) {
        console.error("Email delivery error:", error.message);
        return false;
    }
};
