"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, Loader2, Zap, CheckCircle } from "lucide-react";
import api from "@/lib/api";
import axios from "axios";

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [sent, setSent] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        if (!email.trim()) return setError("Email is required");

        setLoading(true);
        try {
            await api.post("/auth/forgot-password", { email: email.trim() });
            setSent(true);
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                setError(err.response?.data?.message || "Request failed");
            } else {
                setError("An unexpected error occurred");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex bg-gray-950 items-center justify-center p-6">
            <div className="w-full max-w-md">
                <div className="flex items-center gap-2 mb-10">
                    <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center">
                        <Zap className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-white font-bold text-xl">SubsTrack</span>
                </div>

                {sent ? (
                    <div className="text-center">
                        <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
                        <h2 className="text-2xl font-bold text-white mb-2">Check your email</h2>
                        <p className="text-gray-400 mb-6">
                            If an account with that email exists, we&apos;ve sent a password reset link. It expires in 15 minutes.
                        </p>
                        <Link href="/login" className="text-indigo-400 hover:text-indigo-300 transition font-medium">
                            Back to sign in
                        </Link>
                    </div>
                ) : (
                    <>
                        <h2 className="text-3xl font-bold text-white mb-2">Forgot password?</h2>
                        <p className="text-gray-400 mb-8">
                            Enter your email and we&apos;ll send you a reset link.
                        </p>

                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1.5">Email address</label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="you@example.com"
                                        className="w-full pl-10 pr-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                                        autoComplete="email"
                                    />
                                </div>
                            </div>

                            {error && (
                                <div className="rounded-xl bg-red-900/40 border border-red-700/50 px-4 py-3 text-red-300 text-sm">
                                    {error}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition flex items-center justify-center gap-2"
                            >
                                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                                {loading ? "Sending…" : "Send reset link"}
                            </button>
                        </form>

                        <p className="mt-6 text-center text-gray-400 text-sm">
                            <Link href="/login" className="text-indigo-400 hover:text-indigo-300 font-medium transition">
                                Back to sign in
                            </Link>
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}
