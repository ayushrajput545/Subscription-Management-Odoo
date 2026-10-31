
/**
 * Role-based authorization middleware factory.
 * Usage: authorizeRoles("ADMIN") or authorizeRoles("ADMIN", "STAFF")
 * Must be used after the `protect` middleware.
 */
export const authorizeRoles = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({
                message: "Forbidden: insufficient permissions",
            });
        }
        next();
    };
};
