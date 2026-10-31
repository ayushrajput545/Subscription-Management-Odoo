
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";

import pool from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import catalogRoutes from "./routes/catalogRoutes.js";
import subscriptionRoutes from "./routes/subscriptionRoutes.js";
import invoiceRoutes from "./routes/invoiceRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import billingRoutes from "./routes/billingRoutes.js";
import { startRecurringBillingJob } from "./jobs/recurringBillingJob.js";
import reportRoutes from "./routes/reportRoutes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// ─── Middleware ────────────────────────────────────────────────────────────────

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get("/api/v1/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── API Routes ───────────────────────────────────────────────────────────────

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1", catalogRoutes);
app.use("/api/v1", subscriptionRoutes);
app.use("/api/v1", paymentRoutes);
app.use("/api/v1", billingRoutes);
app.use("/api/v1", reportRoutes);
app.use("/api/v1", invoiceRoutes);

// ─── 404 Fallback ─────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// ─── Centralized Error Handler ────────────────────────────────────────────────

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(err.status || 500).json({
    message: err.message || "Internal server error",
  });
});

// ─── Start Server ─────────────────────────────────────────────────────────────

const startServer = async () => {
  try {
    await pool.query("SELECT 1");
    console.log("PostgreSQL connected");
    startRecurringBillingJob();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Database connection failed:", error);
    process.exit(1);
  }
};

startServer();