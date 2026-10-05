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