
/*
 * CSWDO MIS - Shared Authentication Session
 *
 * TEMPORARY FRONTEND DEMO ONLY.
 * Replace demo authentication with the backend API later.
 */

(function (window) {
    "use strict";

    const storageKey = "cswdoUserSession";

    const allowedRoles = ["CLIENT", "EMPLOYEE", "ADMIN"];

    // Temporary credentials for frontend testing only.
    const demoAccounts = {
        admin: {
            password: "admin",
            user: {
                userId: null,
                username: "admin",
                displayName: "CSWDO Administrator",
                role: "ADMIN",
                avatarUrl: null
            }
        },

        client: {
            password: "client",
            user: {
                userId: null,
                username: "client",
                displayName: "Demo Client",
                role: "CLIENT",
                avatarUrl: null
            }
        }
    };

    function normalizeUser(user) {
        if (!user) {
            return null;
        }

        // Accept either frontend camelCase or database/API snake_case.
        const username = String(
            user.username ?? ""
        ).trim();

        const role = String(
            user.role ?? ""
        ).toUpperCase();

        if (!username || !allowedRoles.includes(role)) {
            return null;
        }

        return {
            userId: user.userId ?? user.user_id ?? null,

            username: username,

            displayName:
                user.displayName ??
                user.display_name ??
                [user.first_name, user.last_name]
                    .filter(Boolean)
                    .join(" ") ??
                username,

            role: role,

            avatarUrl:
                user.avatarUrl ??
                user.avatar_url ??
                null
        };
    }

    function saveUserSession(user) {
        const normalizedUser = normalizeUser(user);

        if (!normalizedUser) {
            return null;
        }

        try {
            sessionStorage.setItem(
                storageKey,
                JSON.stringify(normalizedUser)
            );

            return normalizedUser;
        } catch (error) {
            console.error("Unable to save the demo session.", error);
            return null;
        }
    }

    function getCurrentUser() {
        try {
            const storedUser = sessionStorage.getItem(storageKey);

            if (!storedUser) {
                return null;
            }

            return normalizeUser(JSON.parse(storedUser));
        } catch (error) {
            sessionStorage.removeItem(storageKey);
            return null;
        }
    }

    function authenticateDemoCredentials(username, password) {
        const accountKey = String(username).trim().toLowerCase();
        const account = demoAccounts[accountKey];

        if (!account || account.password !== password) {
            return null;
        }

        return saveUserSession(account.user);
    }

    function clearUserSession() {
        sessionStorage.removeItem(storageKey);
    }

    window.CswdoAuthSession = {
        getCurrentUser,
        saveUserSession,
        authenticateDemoCredentials,
        clearUserSession
    };

})(window);