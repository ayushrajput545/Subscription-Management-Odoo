"use client";

import Link from "next/link";
import { ShieldOff } from "lucide-react";

export default function UnauthorizedPage() {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-950 p-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-red-900/30 border border-red-700/40 flex items-center justify-center mb-6">
                <ShieldOff className="w-8 h-8 text-red-400" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Access Denied</h1>
            <p className="text-gray-400 mb-8 max-w-md">
                You don&apos;t have permission to view this page.
                Please contact your administrator if you believe this is an error.
            </p>
            <Link
                href="/"
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition"
            >
                Go to Dashboard
            </Link>
        </div>
    );
}
