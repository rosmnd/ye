/* =========================================================
   CSWDO MIS - REGISTRATION PAGE
   Front-end only + Live Date/Time
   ========================================================= */

(function() {
  'use strict';

  // =====================================================
  // LIVE DATE/TIME - Philippine Time (Asia/Manila)
  // =====================================================
  function updateDateTime() {
    const now = new Date();
    
    // Set timezone to Asia/Manila
    const manilaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
    
    const dateOptions = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    };
    const timeOptions = { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit',
      hour12: true 
    };
    
    const dateDisplay = document.getElementById('dateDisplay');
    const timeDisplay = document.getElementById('timeDisplay');
    
    if (dateDisplay) {
      dateDisplay.textContent = manilaTime.toLocaleDateString('en-US', dateOptions);
    }
    
    if (timeDisplay) {
      timeDisplay.textContent = manilaTime.toLocaleTimeString('en-US', timeOptions);
    }
  }

  // Initialize clock and update every second
  updateDateTime();
  setInterval(updateDateTime, 1000);

  // =====================================================
  // SETUP ON DOM READY
  // =====================================================

  document.addEventListener("DOMContentLoaded", () => {

    const registrationForm =
        document.getElementById("registrationForm");

    const birthDateInput =
        document.getElementById("birthDate");

    const ageInput =
        document.getElementById("age");

    const pwdYes =
        document.getElementById("pwdYes");

    const pwdNo =
        document.getElementById("pwdNo");

    const pwdIdGroup =
        document.getElementById("pwdIdGroup");

    const pwdIdInput =
        document.getElementById("pwdIdNo");

    const housingStatus =
        document.getElementById("housingStatus");

    const monthlyRentGroup =
        document.getElementById("monthlyRentGroup");

    const monthlyRentInput =
        document.getElementById("monthlyRent");

    const cancelButton =
        document.getElementById("cancelButton");

    const passwordInput =
        document.getElementById("password");

    const passwordStrengthMessage =
        document.getElementById(
            "passwordStrengthMessage"
        );

    const contactNumberInput =
        document.getElementById("contactNumber");


    /* =====================================================
       CONTACT NUMBER RESTRICTIONS (FIXED +63 PREFIX)
       Strictly prevent letters, non-digits, & limit to 10 digits
       ===================================================== */

    if (contactNumberInput) {

        contactNumberInput.addEventListener("input", (e) => {
            // Strip any non-digit characters
            let cleaned = e.target.value.replace(/\D/g, "");

            // Enforce 10 digits maximum
            if (cleaned.length > 10) {
                cleaned = cleaned.slice(0, 10);
            }

            e.target.value = cleaned;
        });

        contactNumberInput.addEventListener("keypress", (e) => {
            // Prevent non-numeric key entries
            if (!/\d/.test(e.key) && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
            }
        });

        contactNumberInput.addEventListener("paste", (e) => {
            e.preventDefault();
            const pasted = (e.clipboardData || window.clipboardData).getData("text");
            let cleaned = pasted.replace(/\D/g, "");

            // If user pasted with country code (e.g. 639171234567 or +639171234567)
            if (cleaned.startsWith("63") && cleaned.length === 12) {
                cleaned = cleaned.slice(2);
            } else if (cleaned.startsWith("09") && cleaned.length === 11) {
                cleaned = cleaned.slice(1);
            }

            if (cleaned.length > 10) {
                cleaned = cleaned.slice(0, 10);
            }

            contactNumberInput.value = cleaned;
            contactNumberInput.dispatchEvent(new Event("input"));
        });

    }


    /* =====================================================
       PASSWORD VISIBILITY
       ===================================================== */

    function setupPasswordToggle(toggleId, inputId) {

        const toggleButton =
            document.getElementById(toggleId);

        const input =
            document.getElementById(inputId);

        if (!toggleButton || !input) {
            return;
        }


        toggleButton.addEventListener("click", () => {

            const isHidden =
                input.type === "password";


            input.type =
                isHidden
                    ? "text"
                    : "password";


            const eyeOpen =
                toggleButton.querySelectorAll(
                    ".eyeOpen"
                );

            const eyeClosed =
                toggleButton.querySelectorAll(
                    ".eyeClosed"
                );


            eyeOpen.forEach((element) => {
                element.style.display =
                    isHidden
                        ? "none"
                        : "block";
            });


            eyeClosed.forEach((element) => {
                element.style.display =
                    isHidden
                        ? "block"
                        : "none";
            });


            toggleButton.setAttribute(
                "aria-label",
                isHidden
                    ? "Hide password"
                    : "Show password"
            );


            toggleButton.setAttribute(
                "aria-pressed",
                String(isHidden)
            );

        });

    }


    setupPasswordToggle(
        "togglePassword",
        "password"
    );

    setupPasswordToggle(
        "toggleConfirmPassword",
        "confirmPassword"
    );


    /* =====================================================
       PASSWORD STRENGTH
       ===================================================== */

    const strengthBars =
        document.querySelectorAll(
            ".strengthBar"
        );

    const strengthLabels =
        document.querySelectorAll(
            ".strengthLabel"
        );


    function resetPasswordStrength() {

        strengthBars.forEach((bar) => {
            bar.classList.remove("isActive");
        });


        strengthLabels.forEach((label) => {
            label.classList.remove("isActive");
        });


        if (passwordStrengthMessage) {

            passwordStrengthMessage.textContent =
                "Enter a password to check its strength.";

            passwordStrengthMessage.className =
                "passwordStrengthMessage";

        }

    }


    function evaluatePasswordStrength(password) {

        if (!password) {
            return 0;
        }


        let characterTypes = 0;


        if (/[a-z]/.test(password)) {
            characterTypes++;
        }


        if (/[A-Z]/.test(password)) {
            characterTypes++;
        }


        if (/[0-9]/.test(password)) {
            characterTypes++;
        }


        if (/[^A-Za-z0-9]/.test(password)) {
            characterTypes++;
        }


        /*
         * The strength indicator is intentionally a
         * simple FRONT-END estimate.
         *
         * 1 = Weak
         * 2 = Average
         * 3 = Strong
         * 4 = Secure
         */

        if (
            password.length < 6
        ) {
            return 1;
        }


        if (
            password.length < 8 ||
            characterTypes < 2
        ) {
            return 2;
        }


        if (
            password.length < 12 ||
            characterTypes < 3
        ) {
            return 3;
        }


        if (
            password.length >= 12 &&
            characterTypes === 4
        ) {
            return 4;
        }


        return 3;

    }


    function updatePasswordStrength() {

        if (!passwordInput) {
            return;
        }


        const password =
            passwordInput.value;

        const strength =
            evaluatePasswordStrength(
                password
            );


        resetPasswordStrength();


        if (!strength) {
            return;
        }


        strengthBars.forEach((bar) => {

            const level =
                Number(
                    bar.dataset.level
                );


            if (level <= strength) {
                bar.classList.add(
                    "isActive"
                );
            }

        });


        strengthLabels.forEach((label) => {

            const level =
                Number(
                    label.dataset.level
                );


            if (level === strength) {
                label.classList.add(
                    "isActive"
                );
            }

        });


        if (!passwordStrengthMessage) {
            return;
        }


        if (strength === 1) {

            passwordStrengthMessage.textContent =
                "Weak — add more characters and a mix of character types.";

            passwordStrengthMessage.className =
                "passwordStrengthMessage isWeak";

        }


        if (strength === 2) {

            passwordStrengthMessage.textContent =
                "Average — consider using a longer and more varied password.";

            passwordStrengthMessage.className =
                "passwordStrengthMessage isAverage";

        }


        if (strength === 3) {

            passwordStrengthMessage.textContent =
                "Strong — your password has good length and character variety.";

            passwordStrengthMessage.className =
                "passwordStrengthMessage isStrong";

        }


        if (strength === 4) {

            passwordStrengthMessage.textContent =
                "Secure — your password meets the strongest visual strength level.";

            passwordStrengthMessage.className =
                "passwordStrengthMessage isSecure";

        }

    }


    if (passwordInput) {

        passwordInput.addEventListener(
            "input",
            updatePasswordStrength
        );

    }


    resetPasswordStrength();


    /* =====================================================
       PWD CONDITIONAL FIELD
       ===================================================== */

    function updatePwdField() {

        if (!pwdYes || !pwdIdGroup) {
            return;
        }


        const isPwd =
            pwdYes.checked;


        pwdIdGroup.classList.toggle(
            "isHidden",
            !isPwd
        );


        if (!isPwd && pwdIdInput) {

            pwdIdInput.value = "";

            pwdIdInput.removeAttribute(
                "required"
            );

        }

    }


    if (pwdYes) {

        pwdYes.addEventListener(
            "change",
            updatePwdField
        );

    }


    if (pwdNo) {

        pwdNo.addEventListener(
            "change",
            updatePwdField
        );

    }


    updatePwdField();


    /* =====================================================
       HOUSING / RENT FIELD
       ===================================================== */

    function updateRentField() {

        if (!housingStatus || !monthlyRentGroup) {
            return;
        }


        const isRenter =
            housingStatus.value ===
            "Renter";


        monthlyRentGroup.classList.toggle(
            "isHidden",
            !isRenter
        );


        if (!isRenter && monthlyRentInput) {
            monthlyRentInput.value = "";
        }

    }


    if (housingStatus) {

        housingStatus.addEventListener(
            "change",
            updateRentField
        );

    }


    updateRentField();


    /* =====================================================
       AGE CALCULATION
       ===================================================== */

    function calculateAge() {

        if (!birthDateInput || !ageInput) {
            return;
        }


        if (!birthDateInput.value) {

            ageInput.value = "";

            return;
        }


        const birthDate =
            new Date(
                `${birthDateInput.value}T00:00:00`
            );

        const today =
            new Date();


        let age =
            today.getFullYear() -
            birthDate.getFullYear();


        const monthDifference =
            today.getMonth() -
            birthDate.getMonth();


        if (
            monthDifference < 0 ||
            (
                monthDifference === 0 &&
                today.getDate() <
                    birthDate.getDate()
            )
        ) {
            age--;
        }


        if (age < 0 || age > 150) {

            ageInput.value = "";

            return;
        }


        ageInput.value = age;

    }


    if (birthDateInput) {

        birthDateInput.addEventListener(
            "change",
            calculateAge
        );

        birthDateInput.addEventListener(
            "input",
            calculateAge
        );

    }


    /* =====================================================
       VALIDATION
       ===================================================== */

    function clearValidationErrors() {

        if (!registrationForm) {
            return;
        }


        registrationForm
            .querySelectorAll(".inputError")
            .forEach((input) => {

                input.classList.remove(
                    "inputError"
                );

                input.removeAttribute(
                    "aria-invalid"
                );

            });


        registrationForm
            .querySelectorAll(".errorMessage")
            .forEach((message) => {
                message.remove();
            });

    }


    function showValidationError(
        input,
        message
    ) {

        if (!input) {
            return;
        }


        input.classList.add(
            "inputError"
        );


        input.setAttribute(
            "aria-invalid",
            "true"
        );


        const formGroup =
            input.closest(".formGroup");

        if (!formGroup) {
            return;
        }


        const existingError =
            formGroup.querySelector(
                ".errorMessage"
            );


        if (existingError) {
            existingError.remove();
        }


        const errorMessage =
            document.createElement("small");


        errorMessage.className =
            "errorMessage";


        errorMessage.textContent =
            message;


        // Place error outside input wrappers so buttons/icons are not shifted
        const wrapper =
            input.closest(
                ".passwordInputWrapper, .contactInputWrapper"
            );

        if (wrapper) {
            wrapper.insertAdjacentElement(
                "afterend",
                errorMessage
            );
        } else {
            const formHint =
                formGroup.querySelector(
                    ".formHint"
                );

            if (formHint) {
                formGroup.insertBefore(
                    errorMessage,
                    formHint
                );
            } else {
                input.insertAdjacentElement(
                    "afterend",
                    errorMessage
                );
            }
        }

    }


    function showChoiceError(
        input,
        message
    ) {

        if (!input) {
            return;
        }


        const group =
            input.closest(".termsGroup");


        if (!group) {
            return;
        }


        const existingError =
            group.querySelector(
                ".errorMessage"
            );


        if (existingError) {
            existingError.remove();
        }


        const errorMessage =
            document.createElement("small");


        errorMessage.className =
            "errorMessage";


        errorMessage.textContent =
            message;


        group.appendChild(
            errorMessage
        );

    }


    function removeFieldError(input) {

        if (!input) {
            return;
        }


        input.classList.remove(
            "inputError"
        );


        input.removeAttribute(
            "aria-invalid"
        );


        const formGroup =
            input.closest(".formGroup");

        if (formGroup) {
            const errorMessage =
                formGroup.querySelector(
                    ".errorMessage"
                );

            if (errorMessage) {
                errorMessage.remove();
            }
        }

    }


    if (registrationForm) {

        registrationForm
            .querySelectorAll(
                "input, select, textarea"
            )
            .forEach((input) => {

                input.addEventListener(
                    "input",
                    () => {
                        removeFieldError(input);
                    }
                );


                input.addEventListener(
                    "change",
                    () => {
                        removeFieldError(input);
                    }
                );

            });

    }


    /* =====================================================
       FORM SUBMISSION
       FRONT-END ONLY
       ===================================================== */

    if (registrationForm) {

        registrationForm.addEventListener(
            "submit",
            (event) => {

                event.preventDefault();


                clearValidationErrors();


                let isValid = true;

                let firstError = null;


                const requiredFields =
                    registrationForm.querySelectorAll(
                        "[required]"
                    );


                requiredFields.forEach(
                    (input) => {

                        if (
                            input.disabled ||
                            input.offsetParent === null
                        ) {
                            return;
                        }


                        if (
                            input.type === "checkbox" ||
                            input.type === "radio"
                        ) {
                            return;
                        }

                        // Specific fields handled by specialized validators below
                        if (
                            input.id === "email" ||
                            input.id === "confirmEmail" ||
                            input.id === "contactNumber" ||
                            input.id === "password" ||
                            input.id === "confirmPassword"
                        ) {
                            return;
                        }


                        if (
                            !String(
                                input.value
                            ).trim()
                        ) {

                            isValid = false;


                            showValidationError(
                                input,
                                "This field is required."
                            );


                            if (!firstError) {
                                firstError = input;
                            }

                        }

                    }
                );


                /* -----------------------------------------
                   EMAIL VALIDATION (@ symbol + format)
                   ----------------------------------------- */

                const email =
                    document.getElementById(
                        "email"
                    );

                const confirmEmail =
                    document.getElementById(
                        "confirmEmail"
                    );

                const emailRegex =
                    /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


                if (email) {
                    const emailVal =
                        email.value.trim();

                    if (!emailVal) {
                        isValid = false;
                        showValidationError(
                            email,
                            "This field is required."
                        );
                        if (!firstError) firstError = email;
                    } else if (!emailVal.includes("@")) {
                        isValid = false;
                        showValidationError(
                            email,
                            "Email address must include an '@' symbol."
                        );
                        if (!firstError) firstError = email;
                    } else if (!emailRegex.test(emailVal)) {
                        isValid = false;
                        showValidationError(
                            email,
                            "Enter a valid email address (e.g., name@example.com)."
                        );
                        if (!firstError) firstError = email;
                    }
                }


                if (confirmEmail) {
                    const confirmEmailVal =
                        confirmEmail.value.trim();

                    if (!confirmEmailVal) {
                        isValid = false;
                        showValidationError(
                            confirmEmail,
                            "This field is required."
                        );
                        if (!firstError) firstError = confirmEmail;
                    } else if (!confirmEmailVal.includes("@")) {
                        isValid = false;
                        showValidationError(
                            confirmEmail,
                            "Confirm email must include an '@' symbol."
                        );
                        if (!firstError) firstError = confirmEmail;
                    } else if (!emailRegex.test(confirmEmailVal)) {
                        isValid = false;
                        showValidationError(
                            confirmEmail,
                            "Enter a valid email address."
                        );
                        if (!firstError) firstError = confirmEmail;
                    } else if (
                        email &&
                        email.value.trim() !== confirmEmailVal
                    ) {
                        isValid = false;
                        showValidationError(
                            confirmEmail,
                            "Email addresses do not match."
                        );
                        if (!firstError) firstError = confirmEmail;
                    }
                }


                /* -----------------------------------------
                   CONTACT NUMBER VALIDATION (10 digits starting with 9)
                   ----------------------------------------- */

                const contactNumber =
                    document.getElementById(
                        "contactNumber"
                    );

                if (contactNumber) {
                    const contactVal =
                        contactNumber.value.trim();

                    if (!contactVal) {
                        isValid = false;
                        showValidationError(
                            contactNumber,
                            "This field is required."
                        );
                        if (!firstError) firstError = contactNumber;
                    } else if (!/^9\d{9}$/.test(contactVal)) {
                        isValid = false;
                        if (!contactVal.startsWith("9")) {
                            showValidationError(
                                contactNumber,
                                "Contact number must start with 9."
                            );
                        } else {
                            showValidationError(
                                contactNumber,
                                "Enter a valid 10-digit mobile number (e.g., 9171234567)."
                            );
                        }
                        if (!firstError) firstError = contactNumber;
                    }
                }


                /* -----------------------------------------
                   PASSWORD & CONFIRM PASSWORD
                   ----------------------------------------- */

                const confirmPassword =
                    document.getElementById(
                        "confirmPassword"
                    );


                if (passwordInput) {
                    const passVal =
                        passwordInput.value;

                    if (!passVal) {
                        isValid = false;
                        showValidationError(
                            passwordInput,
                            "This field is required."
                        );
                        if (!firstError) firstError = passwordInput;
                    }
                }


                if (confirmPassword) {
                    const confirmPassVal =
                        confirmPassword.value;

                    if (!confirmPassVal) {
                        isValid = false;
                        showValidationError(
                            confirmPassword,
                            "This field is required."
                        );
                        if (!firstError) firstError = confirmPassword;
                    } else if (
                        passwordInput &&
                        passwordInput.value !== confirmPassVal
                    ) {
                        isValid = false;
                        showValidationError(
                            confirmPassword,
                            "Passwords do not match."
                        );
                        if (!firstError) firstError = confirmPassword;
                    }
                }


                /* -----------------------------------------
                   TERMS
                   ----------------------------------------- */

                const agreeTerms =
                    document.getElementById(
                        "agreeTerms"
                    );

                const agreePrivacy =
                    document.getElementById(
                        "agreePrivacy"
                    );


                if (
                    agreeTerms &&
                    !agreeTerms.checked
                ) {

                    isValid = false;


                    showChoiceError(
                        agreeTerms,
                        "You must agree to the Terms of Service."
                    );

                }


                if (
                    agreePrivacy &&
                    !agreePrivacy.checked
                ) {

                    isValid = false;


                    showChoiceError(
                        agreePrivacy,
                        "You must agree to the Privacy Policy."
                    );

                }


                /* -----------------------------------------
                   VALIDATION RESULT
                   ----------------------------------------- */

                if (!isValid) {

                    if (firstError) {

                        firstError.scrollIntoView({
                            behavior: "smooth",
                            block: "center"
                        });


                        setTimeout(() => {
                            firstError.focus();
                        }, 250);

                    }


                    return;
                }


                /*
                 * Frontend validation succeeded.
                 *
                 * No account is created yet.
                 *
                 * Backend integration will later create:
                 *
                 * users.role = CLIENT
                 *
                 * and the corresponding client_profiles
                 * record.
                 */

                console.log(
                    "Registration form passed frontend validation."
                );

            }
        );

    }


    /* =====================================================
       CANCEL
       ===================================================== */

    if (cancelButton) {

        cancelButton.addEventListener(
            "click",
            () => {

                window.location.href =
                    "../html/login_draft.html";

            }
        );

    }

  });

})();