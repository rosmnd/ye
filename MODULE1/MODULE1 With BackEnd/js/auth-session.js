
(function (window) {
    "use strict";

    const allowedRoles = ["CLIENT", "EMPLOYEE", "ADMIN"];
    const scriptUrl = document.currentScript?.src || window.location.href;
    const appRoot = new URL("../", scriptUrl);
    let csrfToken = "";

    function normalizeUser(user) {
        if (!user) return null;

        const username = String(user.username ?? "").trim();
        const role = String(user.role ?? "").toUpperCase();
        if (!username || !allowedRoles.includes(role)) return null;

        return {
            userId: user.userId ?? null,
            username,
            displayName: String(user.displayName || username),
            role,
            avatarUrl: user.avatarUrl || null
        };
    }

    function endpoint(path) {
        return new URL(path, appRoot).toString();
    }

    async function requestJson(path, options = {}) {
        let response;
        try {
            response = await fetch(endpoint(path), {
                credentials: "same-origin",
                cache: "no-store",
                ...options
            });
        } catch (error) {
            throw new Error("The server could not be reached. Check that Apache is running.");
        }

        const result = await response.json().catch(() => null);
        if (!response.ok || !result || result.success !== true) {
            throw new Error(
                result?.message || "The request could not be completed."
            );
        }
        return result.data || {};
    }

    async function getCurrentUser() {
        const data = await requestJson("backend/auth/me.php");
        csrfToken = String(data.csrfToken || "");
        return normalizeUser(data.user);
    }

    async function getCsrfToken() {
        if (!csrfToken) {
            await getCurrentUser();
        }
        if (!csrfToken) {
            throw new Error("Your session could not be verified. Refresh the page and try again.");
        }
        return csrfToken;
    }

    async function login(username, password) {
        const token = await getCsrfToken();
        const data = await requestJson("backend/auth/login.php", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-CSRF-Token": token
            },
            body: JSON.stringify({ username, password })
        });
        csrfToken = String(data.csrfToken || "");
        return normalizeUser(data.user);
    }

    async function logout() {
        const token = await getCsrfToken();
        await requestJson("backend/auth/logout.php", {
            method: "POST",
            headers: { "X-CSRF-Token": token }
        });
        csrfToken = "";
    }

    window.CswdoAuthSession = {
        getCurrentUser,
        getCsrfToken,
        login,
        logout
    };
})(window);