
/* =========================================================
   PASIG CITY CSWDO — SIGN-OUT CONFIRMATION MODAL
   Shared by homepage and assistance service pages
   ========================================================= */

(() => {
    "use strict";

    function confirmSignOut() {
        // Prevent multiple confirmation dialogs.
        if (document.querySelector(".logoutModalOverlay")) {
            return Promise.resolve(false);
        }

        return new Promise((resolve) => {
            const previousFocus = document.activeElement;
            const previousOverflow = document.body.style.overflow;

            const overlay = document.createElement("div");
            overlay.className = "logoutModalOverlay";

            overlay.innerHTML = `
                <section
                    class="logoutModalDialog"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="logoutModalTitle"
                    aria-describedby="logoutModalDescription"
                    tabindex="-1"
                >
                    <header class="logoutModalHeader">

                        <div class="logoutModalBrand">
                            <img
                                src="../assets/pasigLogo1.png"
                                class="logoutModalSeal"
                                alt=""
                            >

                            <div class="logoutModalBrandText">
                                <p class="logoutModalBrandCity">
                                    PASIG CITY GOVERNMENT
                                </p>

                                <p class="logoutModalBrandOffice">
                                    City Social Welfare and Development Office
                                </p>
                            </div>
                        </div>

                        <button
                            type="button"
                            class="logoutModalClose"
                            aria-label="Close dialog"
                        >
                            <svg
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                aria-hidden="true"
                            >
                                <path d="M18 6 6 18"></path>
                                <path d="m6 6 12 12"></path>
                            </svg>
                        </button>

                    </header>

                    <div class="logoutModalBody">

                        <div
                            class="logoutModalIcon"
                            aria-hidden="true"
                        >
                            <svg
                                width="25"
                                height="25"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="1.8"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            >
                                <path d="M10 17l5-5-5-5"></path>
                                <path d="M15 12H3"></path>
                                <path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"></path>
                            </svg>
                        </div>

                        <p
                            class="logoutModalSectionLabel"
                            data-en="ACCOUNT SECURITY"
                            data-tl="KALIGTASAN NG ACCOUNT"
                        >
                            ACCOUNT SECURITY
                        </p>

                        <h2
                            class="logoutModalTitle"
                            id="logoutModalTitle"
                            data-en="Sign out of your account?"
                            data-tl="Mag-sign out sa iyong account?"
                        >
                            Sign out of your account?
                        </h2>

                        <p
                            class="logoutModalDescription"
                            id="logoutModalDescription"
                            data-en="You are about to sign out of the Pasig City CSWDO Management Information System."
                            data-tl="Mag-si-sign out ka sa Pasig City CSWDO Management Information System."
                        >
                            You are about to sign out of the Pasig City
                            CSWDO Management Information System.
                        </p>

                        <div class="logoutModalNotice">
                            <svg
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="1.8"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                aria-hidden="true"
                            >
                                <circle cx="12" cy="12" r="10"></circle>
                                <path d="M12 16v-4"></path>
                                <path d="M12 8h.01"></path>
                            </svg>

                            <span
                                data-en="Your current session will end on this browser."
                                data-tl="Magtatapos ang iyong kasalukuyang session sa browser na ito."
                            >
                                Your current session will end on this browser.
                            </span>
                        </div>

                    </div>

                    <footer class="logoutModalFooter">

                        <button
                            type="button"
                            class="logoutModalCancel"
                            data-en="Stay signed in"
                            data-tl="Manatiling naka-sign in"
                        >
                            Stay signed in
                        </button>

                        <button
                            type="button"
                            class="logoutModalConfirm"
                        >
                            <span
                                data-en="Sign out"
                                data-tl="Mag-sign out"
                            >
                                Sign out
                            </span>

                            <svg
                                width="17"
                                height="17"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                aria-hidden="true"
                            >
                                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                                <path d="M16 17l5-5-5-5"></path>
                                <path d="M21 12H9"></path>
                            </svg>
                        </button>

                    </footer>
                </section>
            `;

            // Follow the language currently selected on the page.
            const activeLanguage =
                document.querySelector(".langBtn.is-active")
                    ?.dataset.lang === "tl"
                    ? "tl"
                    : "en";

            overlay.querySelectorAll("[data-en][data-tl]").forEach((element) => {
                element.textContent =
                    activeLanguage === "tl"
                        ? element.dataset.tl
                        : element.dataset.en;
            });

            const dialog = overlay.querySelector(".logoutModalDialog");
            const closeButton = overlay.querySelector(".logoutModalClose");
            const cancelButton = overlay.querySelector(".logoutModalCancel");
            const confirmButton = overlay.querySelector(".logoutModalConfirm");

            closeButton.setAttribute(
                "aria-label",
                activeLanguage === "tl" ? "Isara ang dialog" : "Close dialog"
            );

            let isFinished = false;

            function finish(confirmed) {
                if (isFinished) return;

                isFinished = true;

                document.removeEventListener("keydown", handleKeydown);

                document.body.style.overflow = previousOverflow;
                overlay.remove();

                // Return keyboard focus to the control that opened the dialog.
                if (
                    previousFocus &&
                    typeof previousFocus.focus === "function" &&
                    document.contains(previousFocus)
                ) {
                    previousFocus.focus();
                }

                resolve(confirmed);
            }

            function handleKeydown(event) {
                if (event.key === "Escape") {
                    event.preventDefault();
                    finish(false);
                    return;
                }

                if (event.key !== "Tab") return;

                const focusableElements = Array.from(
                    dialog.querySelectorAll(
                        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
                    )
                ).filter((element) => !element.hidden);

                if (focusableElements.length === 0) {
                    event.preventDefault();
                    dialog.focus();
                    return;
                }

                const firstElement = focusableElements[0];
                const lastElement =
                    focusableElements[focusableElements.length - 1];

                if (
                    event.shiftKey &&
                    document.activeElement === firstElement
                ) {
                    event.preventDefault();
                    lastElement.focus();
                } else if (
                    !event.shiftKey &&
                    document.activeElement === lastElement
                ) {
                    event.preventDefault();
                    firstElement.focus();
                }
            }

            cancelButton.addEventListener("click", () => {
                finish(false);
            });

            closeButton.addEventListener("click", () => {
                finish(false);
            });

            confirmButton.addEventListener("click", () => {
                finish(true);
            });

            // Clicking the backdrop cancels the action.
            overlay.addEventListener("click", (event) => {
                if (event.target === overlay) {
                    finish(false);
                }
            });

            document.addEventListener("keydown", handleKeydown);

            document.body.appendChild(overlay);
            document.body.style.overflow = "hidden";

            // Default focus is on the safer action.
            cancelButton.focus();
        });
    }

    window.CswdoLogoutModal = {
        confirm: confirmSignOut
    };
})();