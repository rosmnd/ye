/* =========================================================
   CSWDO MIS — REGISTRATION STEP NAVIGATION
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("registrationForm");

    if (!form) return;

    const panels = Array.from(
        form.querySelectorAll(".registrationSection")
    );

    const tabs = Array.from(
        form.querySelectorAll(".registrationTab")
    );

    const progressBar = document.getElementById(
        "registrationProgressBar"
    );

    const progressFill = document.getElementById(
        "registrationProgressFill"
    );

    const stepLabel = document.getElementById(
        "registrationStepLabel"
    );

    const progressPercent = document.getElementById(
        "registrationProgressPercent"
    );

    const previousButton = document.getElementById(
        "previousStepButton"
    );

    const nextButton = document.getElementById(
        "nextStepButton"
    );

    const submitButton = document.getElementById(
        "createAccountButton"
    );

    if (
        panels.length !== 3 ||
        tabs.length !== panels.length ||
        !previousButton ||
        !nextButton ||
        !submitButton
    ) {
        console.error(
            "Registration tabs could not initialize. Check the step IDs."
        );
        return;
    }

    let activeStep = 0;
    let highestReachedStep = 0;

    function renderStep(index, focusPanel = false) {
        activeStep = Math.max(
            0,
            Math.min(index, panels.length - 1)
        );

        panels.forEach((panel, panelIndex) => {
            const isActive = panelIndex === activeStep;

            panel.hidden = !isActive;
            panel.setAttribute(
                "aria-hidden",
                String(!isActive)
            );
        });

        tabs.forEach((tab, tabIndex) => {
            const isActive = tabIndex === activeStep;
            const isComplete = tabIndex < activeStep;

            tab.classList.toggle("isActive", isActive);
            tab.classList.toggle("isComplete", isComplete);

            tab.setAttribute(
                "aria-selected",
                String(isActive)
            );

            tab.tabIndex = isActive ? 0 : -1;

            // Future steps become available after using Continue.
            tab.disabled = tabIndex > highestReachedStep;
        });

        const stepNumber = activeStep + 1;
        const percentage = Math.round(
            (stepNumber / panels.length) * 100
        );

        if (stepLabel) {
            stepLabel.textContent =
                `Step ${stepNumber} of ${panels.length}`;
        }

        if (progressPercent) {
            progressPercent.textContent =
                `${percentage}% complete`;
        }

        if (progressFill) {
            progressFill.style.width = `${percentage}%`;
        }

        if (progressBar) {
            progressBar.setAttribute(
                "aria-valuenow",
                String(stepNumber)
            );
        }

        previousButton.hidden = activeStep === 0;
        nextButton.hidden = activeStep === panels.length - 1;
        submitButton.hidden = activeStep !== panels.length - 1;

        if (focusPanel) {
            panels[activeStep].focus();
        }
    }

    function validateCurrentStep() {
        const currentPanel = panels[activeStep];

        const fields = Array.from(
            currentPanel.querySelectorAll(
                "input, select, textarea"
            )
        );

        for (const field of fields) {
            if (
                field.disabled ||
                !field.willValidate ||
                field.closest(".isHidden")
            ) {
                continue;
            }

            if (!field.checkValidity()) {
                field.reportValidity();
                field.focus();
                return false;
            }
        }

        return true;
    }

    nextButton.addEventListener("click", () => {
        if (!validateCurrentStep()) return;

        highestReachedStep = Math.max(
            highestReachedStep,
            activeStep + 1
        );

        renderStep(activeStep + 1, true);
    });

    previousButton.addEventListener("click", () => {
        renderStep(activeStep - 1, true);
    });

    tabs.forEach((tab, index) => {
        tab.addEventListener("click", () => {
            if (tab.disabled) return;

            renderStep(index, true);
        });

        tab.addEventListener("keydown", (event) => {
            let targetIndex = null;

            if (event.key === "ArrowRight") {
                targetIndex = Math.min(
                    index + 1,
                    highestReachedStep
                );
            } else if (event.key === "ArrowLeft") {
                targetIndex = Math.max(index - 1, 0);
            } else if (event.key === "Home") {
                targetIndex = 0;
            } else if (event.key === "End") {
                targetIndex = highestReachedStep;
            }

            if (
                targetIndex !== null &&
                targetIndex !== index
            ) {
                event.preventDefault();
                renderStep(targetIndex);
                tabs[targetIndex].focus();
            }
        });
    });

    // The main validation handler uses this when it finds
    // an error in a step that is currently hidden.
    window.CswdoRegistrationTabs = {
        showForElement(element) {
            const targetIndex = panels.findIndex(
                (panel) => panel.contains(element)
            );

            if (targetIndex < 0) return;

            highestReachedStep = Math.max(
                highestReachedStep,
                targetIndex
            );

            renderStep(targetIndex);
        }
    };

    renderStep(0);
});