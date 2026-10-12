document.addEventListener("DOMContentLoaded", () => {

    const dateDisplay = document.getElementById("dateDisplay");
    const timeDisplay = document.getElementById("timeDisplay");

    if (!dateDisplay || !timeDisplay) {
        return;
    }

    const updateDateTime = () => {

        const now = new Date();

        const dateFormatter = new Intl.DateTimeFormat("en-PH", {
            timeZone: "Asia/Manila",
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric"
        });

        const timeFormatter = new Intl.DateTimeFormat("en-PH", {
            timeZone: "Asia/Manila",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: true
        });

        dateDisplay.textContent = dateFormatter.format(now);
        timeDisplay.textContent = timeFormatter.format(now);
    };

    updateDateTime();

    setInterval(updateDateTime, 1000);
});
/* =========================================================
   BACK TO TOP - floating button, appears after scrolling
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    const backToTop = document.getElementById("backToTop");

    if (!backToTop) {
        return;
    }

    const toggleBackToTop = () => {
        backToTop.classList.toggle("is-visible", window.scrollY > 400);
    };

    window.addEventListener("scroll", toggleBackToTop, { passive: true });
    toggleBackToTop();

    backToTop.addEventListener("click", () => {
        window.scrollTo({ top: 0, behavior: "smooth" });
    });
});


/* =========================================================
   ACCOUNT PROFILE - SIGN IN / PROFILE / SIGN OUT
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    const auth = window.CswdoAuthSession;

    const signInLink = document.getElementById("signInLink");
    const profileContainer = document.getElementById("profileContainer");
    const profileButton = document.getElementById("profileButton");
    const profileDropdown = document.getElementById("profileDropdown");
    const profileUsername = document.getElementById("profileUsername");
    const profileDropdownName = document.getElementById("profileDropdownName");
    const profileRole = document.getElementById("profileRole");
    const profileAvatarImage = document.getElementById("profileAvatarImage");
    const profileInitials = document.getElementById("profileInitials");
    const logoutButton = document.getElementById("logoutButton");

    if (
        !auth ||
        !signInLink ||
        !profileContainer ||
        !profileButton ||
        !profileDropdown
    ) {
        return;
    }

    function getInitials(name) {
        const parts = String(name || "U")
            .trim()
            .split(/\s+/)
            .filter(Boolean);

        if (parts.length >= 2) {
            return (parts[0][0] + parts[parts.length - 1][0])
                .toUpperCase();
        }

        return (parts[0] || "U").slice(0, 2).toUpperCase();
    }

    function closeProfileDropdown() {
        profileDropdown.hidden = true;
        profileButton.setAttribute("aria-expanded", "false");
    }

    async function renderAccount() {
        let user = null;
        try {
            user = await auth.getCurrentUser();
        } catch (error) {
            console.error("Unable to check the account session.", error);
        }

        closeProfileDropdown();

        if (!user) {
            signInLink.hidden = false;
            profileContainer.hidden = true;
            return;
        }

        signInLink.hidden = true;
        profileContainer.hidden = false;

        // The visible navigation label is the account's username.
        profileUsername.textContent = user.username;

        profileDropdownName.textContent =
            user.displayName || user.username;

        profileRole.textContent = user.role;

        // Use the uploaded/stored profile image if the backend provides one.
        if (user.avatarUrl) {
            profileAvatarImage.onerror = () => {
                profileAvatarImage.hidden = true;
                profileAvatarImage.removeAttribute("src");
                profileInitials.hidden = false;
            };

            profileAvatarImage.src = user.avatarUrl;
            profileAvatarImage.hidden = false;
            profileInitials.hidden = true;
        } else {
            profileAvatarImage.hidden = true;
            profileAvatarImage.removeAttribute("src");

            profileInitials.textContent =
                getInitials(user.displayName || user.username);

            profileInitials.hidden = false;
        }
    }

    profileButton.addEventListener("click", (event) => {
        event.stopPropagation();

        const willOpen = profileDropdown.hidden;

        profileDropdown.hidden = !willOpen;
        profileButton.setAttribute(
            "aria-expanded",
            String(willOpen)
        );
    });

    document.addEventListener("click", (event) => {
        if (!profileContainer.contains(event.target)) {
            closeProfileDropdown();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeProfileDropdown();
        }
    });

    
    /* Sign out only after confirmation */
    if (logoutButton) {
        logoutButton.addEventListener("click", async () => {

            const confirmed = window.CswdoLogoutModal
                ? await window.CswdoLogoutModal.confirm()
                : window.confirm(
                    "Are you sure you want to sign out of your CSWDO MIS account?"
                );

            // Cancel means the session remains active.
            if (!confirmed) {
                return;
            }

            try {
                await auth.logout();
                await renderAccount();
            } catch (error) {
                window.alert(error.message || "Sign-out could not be completed.");
            }
        });
    }

    renderAccount();
});
