// Auth types
export interface User {
    id: number;
    name: string;
    email: string;
    role: "ADMIN" | "STAFF" | "CUSTOMER";
    created_at?: string;
}

export interface AuthContextType {
    user: User | null;
    loading: boolean;
    login: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    refreshUser: () => Promise<void>;
}

export interface LoginPayload {
    email: string;
    password: string;
}

export interface RegisterPayload {
    name: string;
    email: string;
    password: string;
}
