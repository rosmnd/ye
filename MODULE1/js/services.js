/* =========================================================
   SERVICE PAGES — LIVE DATE & TIME
   Behavior for the gov header on the landing pages:
   medical / financial / burial / balik probinsya.
   Mirrors the homepage implementation so both stay
   consistent.
   ========================================================= */

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
   (mirrors the homepage implementation)
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
   SHARED ACCOUNT PROFILE
   Used by Medical, Financial, Burial, and Balik Probinsya
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

    const serviceSignInLinks = document.querySelectorAll(
        ".serviceSignInCta"
    );

    // Fail safely if the shared session helper is unavailable.
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
            return (
                parts[0][0] +
                parts[parts.length - 1][0]
            ).toUpperCase();
        }

        return (parts[0] || "U")
            .slice(0, 2)
            .toUpperCase();
    }

    function closeProfileDropdown() {
        profileDropdown.hidden = true;

        profileButton.setAttribute(
            "aria-expanded",
            "false"
        );
    }

    function renderAccount() {
        const user = auth.getCurrentUser();

        closeProfileDropdown();

        if (!user) {
            signInLink.hidden = false;
            profileContainer.hidden = true;

            serviceSignInLinks.forEach((link) => {
                link.hidden = false;
            });

            return;
        }

        // The Sign In link is replaced by the profile control.
        signInLink.hidden = true;
        profileContainer.hidden = false;

        // Reflect the current user's session information.
        profileUsername.textContent = user.username;

        profileDropdownName.textContent =
            user.displayName || user.username;

        profileRole.textContent = user.role;

        // Show an avatar image if one is supplied.
        // Otherwise, display initials.
        if (user.avatarUrl && profileAvatarImage) {

            profileAvatarImage.onerror = () => {
                profileAvatarImage.hidden = true;
                profileAvatarImage.removeAttribute("src");

                if (profileInitials) {
                    profileInitials.textContent = getInitials(
                        user.displayName || user.username
                    );

                    profileInitials.hidden = false;
                }
            };

            profileAvatarImage.src = user.avatarUrl;
            profileAvatarImage.hidden = false;

            if (profileInitials) {
                profileInitials.hidden = true;
            }

        } else if (profileInitials) {

            if (profileAvatarImage) {
                profileAvatarImage.hidden = true;
                profileAvatarImage.removeAttribute("src");
            }

            profileInitials.textContent = getInitials(
                user.displayName || user.username
            );

            profileInitials.hidden = false;
        }

        // Hide lower Sign In prompts while already authenticated.
        serviceSignInLinks.forEach((link) => {
            link.hidden = true;
        });
    }

    // Open and close the account dropdown.
    profileButton.addEventListener("click", (event) => {

        event.stopPropagation();

        const willOpen = profileDropdown.hidden;

        profileDropdown.hidden = !willOpen;

        profileButton.setAttribute(
            "aria-expanded",
            String(willOpen)
        );
    });

    // Close when the user clicks outside the profile menu.
    document.addEventListener("click", (event) => {

        if (!profileContainer.contains(event.target)) {
            closeProfileDropdown();
        }
    });

    // Close the dropdown using Escape.
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

            auth.clearUserSession();
            renderAccount();
        });
    }

    // Load the current session on page entry.
    renderAccount();
});
