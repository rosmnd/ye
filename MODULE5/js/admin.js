// current_status values follow applications.current_status in the CSWDO ERD.
// priority_level (NORMAL, REMINDER, OVERDUE) is a notification flag only.

var MIN = 60000;
var clockOffset = 0; // server time minus browser time, set by loadApps()
var apps = [];

var state = {
  selectedId: null,
  filter: "pending",
  search: "",
  remarks: {},
  remarkError: false,
};
var modalHandler = null;

function $(id) {
  return document.getElementById(id);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c];
  });
}

function byId(id) {
  return apps.filter(function (a) {
    return String(a.application_id) === String(id);
  })[0];
}

function isPending(a) {
  return (
    a.current_status === "FOR_ADMIN_REVIEW" ||
    a.current_status === "ADMIN_REVIEWING"
  );
}

function waitMins(a) {
  return Math.floor((Date.now() + clockOffset - a.entered_review_at) / MIN);
}

function priorityLevel(a) {
  if (a.current_status !== "FOR_ADMIN_REVIEW") return null;
  var m = waitMins(a);
  return m >= 10 ? "OVERDUE" : m >= 5 ? "REMINDER" : "NORMAL";
}

function statusBadge(a) {
  var statusMap = {
    FOR_ADMIN_REVIEW: ["badgeInfo", "For admin review"],
    ADMIN_REVIEWING: ["badgeWarning", "Admin reviewing"],
    APPROVED: ["badgeSuccess", "Approved"],
    RETURNED_FOR_CORRECTION: [
      "badgeDanger",
      "Returned for correction",
    ],
    ASSISTANCE_PROCESSING: [
      "badgeSuccess",
      "Assistance processing",
    ],
    COMPLETED: ["badgeSuccess", "Completed"],
  };
  var m = statusMap[a.current_status] || [
    "badgeNeutral",
    a.current_status,
  ];
  return '<span class="badge ' + m[0] + '">' + m[1] + "</span>";
}

function alertBadge(a) {
  var l = priorityLevel(a);
  if (!l) return "";
  if (l === "OVERDUE")
    return (
      '<span class="badge badgeDanger">Overdue · ' +
      waitMins(a) +
      " min</span>"
    );
  return (
    '<span class="helperText">Waiting ' +
    waitMins(a) +
    " min" +
    (l === "REMINDER" ? " · reminder" : "") +
    "</span>"
  );
}

function renderCounters() {
  var fresh = apps.filter(function (a) {
    return a.current_status === "FOR_ADMIN_REVIEW";
  });
  var five = fresh.filter(function (a) {
    return waitMins(a) >= 5;
  }).length;
  var ten = fresh.filter(function (a) {
    return waitMins(a) >= 10;
  }).length;
  var approved = apps.filter(function (a) {
    return a.current_status === "APPROVED";
  }).length;

  $("counterRow").innerHTML =
  counterCard("", "inbox", fresh.length, "New for review") +
  counterCard(" counterCardWarning", "clock", five, "Waiting over 5 minutes") +
  counterCard(" counterCardDanger", "alert", ten, "Overdue over 10 minutes") +
  counterCard(" counterCardSuccess", "check", approved, "Approved");

  renderAlert();
}

function counterIcon(paths) {
  return (
    '<span class="counterIcon" aria-hidden="true">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    paths +
    "</svg></span>"
  );
}

var ICONS = {
  inbox:
    '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  clock:
    '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  alert:
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  check:
    '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>',
};

function counterCard(cls, icon, number, label) {
  return (
    '<div class="counterCard' + cls + '">' +
    counterIcon(ICONS[icon]) +
    '<div><span class="counterNumber">' + number + "</span>" +
    label + "</div></div>"
  );
}
// Notification: tells the admin a report is ready to scan, evaluate and approve
function renderAlert() {
  var pending = apps.filter(isPending);
  var fresh = apps
    .filter(function (a) {
      return a.current_status === "FOR_ADMIN_REVIEW";
    })
    .sort(function (x, y) {
      return x.entered_review_at - y.entered_review_at;
    });
  var banner = $("alertBanner");

  $("bellCount").textContent = pending.length;
  $("bellBtn").classList.toggle("bellHasNew", fresh.length > 0);

  if (!fresh.length) {
    banner.hidden = true;
    return;
  }

  var oldest = fresh[0];
  var overdue = priorityLevel(oldest) === "OVERDUE";
  banner.hidden = false;
  banner.className =
    "alertBanner" + (overdue ? " alertOverdue" : "");
  banner.innerHTML =
    "<div>" +
    "<strong>" +
    fresh.length +
    (fresh.length === 1 ? " report needs" : " reports need") +
    " your review</strong>" +
    "<span>Scan and evaluate, then click Approve. Oldest: " +
    esc(oldest.client_name) +
    " (" +
    esc(oldest.control_number) +
    "), waiting " +
    waitMins(oldest) +
    " min.</span>" +
    "</div>" +
    '<button type="button" class="btn btnPrimary" data-open="' +
    esc(oldest.application_id) +
    '">Open oldest report</button>';
}

function visibleApps() {
  var q = state.search.trim().toLowerCase();
  return apps
    .filter(function (a) {
      if (state.filter === "pending" && !isPending(a))
        return false;
      if (
        state.filter === "approved" &&
        a.current_status !== "APPROVED"
      )
        return false;
      if (
        state.filter === "returned" &&
        a.current_status !== "RETURNED_FOR_CORRECTION"
      )
        return false;
      return (
        !q ||
        (a.client_name + " " + a.control_number)
          .toLowerCase()
          .indexOf(q) > -1
      );
    })
    .sort(function (x, y) {
      return x.entered_review_at - y.entered_review_at;
    });
}

function renderQueue() {
  var list = visibleApps();

  if (!list.length) {
    $("queueList").innerHTML =
      '<li class="emptyState"><h3>Nothing here</h3>' +
      '<p class="helperText">No applications match this filter. Try another status or clear the search.</p></li>';
    return;
  }

  $("queueList").innerHTML = list
    .map(function (a) {
      var selectedClass =
        String(a.application_id) === String(state.selectedId)
          ? " queueItemSelected"
          : "";
      var sourceLabel =
        a.application_type === "WALK_IN" ? "Walk-in" : "Online";
      return (
        "<li>" +
        '<button type="button" class="queueItem' +
        selectedClass +
        '" data-id="' +
        esc(a.application_id) +
        '">' +
        '<span class="rowBetween">' +
        "<strong>" +
        esc(a.client_name) +
        "</strong>" +
        '<span class="monoText">' +
        esc(a.control_number) +
        "</span>" +
        "</span>" +
        '<span class="helperText">' +
        esc(a.assistance_type) +
        " · " +
        esc(sourceLabel) +
        "</span>" +
        '<span class="queueStatusRow">' +
        "<span>" +
        statusBadge(a) +
        "</span>" +
        '<span class="queueAlert">' +
        alertBadge(a) +
        "</span>" +
        "</span>" +
        "</button>" +
        "</li>"
      );
    })
    .join("");
}

function info(label, value) {
  return (
    '<div><span class="infoLabel">' +
    esc(label) +
    '</span><span class="infoValue">' +
    esc(value) +
    "</span></div>"
  );
}

function reportBlock(label, text) {
  return (
    '<div><span class="fieldLabel">' +
    label +
    '</span><div class="noteBox">' +
    esc(text) +
    "</div></div>"
  );
}

function reqBadge(s) {
  return { VALIDATED: "badgeSuccess", REJECTED: "badgeDanger", INCOMPLETE: "badgeWarning" }[s] || "badgeNeutral";
}

function reqLabel(s) {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

function renderDetail() {
  var a = state.selectedId ? byId(state.selectedId) : null;
  var panel = $("detailPanel");

  if (!a) {
    panel.innerHTML =
      '<div class="emptyState"><h3>Select an application</h3>' +
      '<p class="helperText">Choose one from the list to read the social case study report and make a decision.</p></div>';
    return;
  }

  var sourceLabel =
    a.application_type === "WALK_IN" ? "Walk-in" : "Online";

  var html =
    '<div class="panelHead">' +
    '<div class="rowBetween">' +
    "<div><h2>" +
    esc(a.client_name) +
    '</h2><span class="monoText">' +
    esc(a.control_number) +
    "</span></div>" +
    statusBadge(a) +
    "</div>" +
    '<div class="infoGrid">' +
    info("Assistance", a.assistance_type) +
    info("Application type", sourceLabel) +
    info("Address", a.address) +
    info("Assigned social worker", a.assigned_social_worker) +
    "</div>" +
    "</div>";

  html +=
    '<div class="panelSection"><h3>Requirements</h3>' +
    '<table class="dataTable"><tr><th>Requirement</th><th>Status</th></tr>' +
    a.requirements
      .map(function (r) {
        return (
          "<tr><td>" +
          esc(r[0]) +
          '</td><td><span class="badge ' + reqBadge(r[1]) + '">' +
          esc(reqLabel(r[1])) +
          "</span></td></tr>"
        );
      })
      .join("") +
    "</table></div>";

  {
    html +=
      '<div class="panelSection"><h3>Social case study report</h3>' +
      reportBlock("Problem presented", a.problem_presented) +
      reportBlock("Brief findings", a.brief_findings) +
      reportBlock(
        "Socio-economic evaluation",
        a.socio_economic_evaluation,
      ) +
      reportBlock(
        "Evaluation recommendation",
        a.evaluation_recommendation,
      ) +
      "</div>";

    html += '<div class="panelSection"><h3>Admin review</h3>';

    if (a.admin_review) {
      var isApproved = a.admin_review.decision === "APPROVED";
      html +=
        '<div class="decisionBanner ' +
        (isApproved ? "decisionApproved" : "decisionReturned") +
        '">' +
        "<strong>" +
        (isApproved ? "Approved" : "Returned for correction") +
        "</strong>" +
        "<p>" +
        esc(a.admin_review.admin_remarks) +
        "</p>" +
        "</div>";
    } else {
      html +=
        "<div>" +
        '<label class="fieldLabel" for="remarksInput">Remarks</label>' +
        '<textarea class="input' +
        (state.remarkError ? " inputError" : "") +
        '" id="remarksInput" ' +
        'placeholder="Add remarks for staff. Required when returning for correction.">' +
        esc(state.remarks[a.control_number] || "") +
        "</textarea>" +
        (state.remarkError
          ? '<span class="errorText">Add remarks so staff know what to fix.</span>'
          : '<span class="helperText">Remarks are saved to admin_reviews.admin_remarks.</span>') +
        "</div>" +
        '<div class="btnGroup">' +
        '<button type="button" class="btn btnConfirm" id="btnApprove">Approve application</button>' +
        '<button type="button" class="btn btnSecondary" id="btnReturn">Return for correction</button>' +
        "</div>";
    }
    html += "</div>";
  }

  html +=
    '<div class="panelSection"><h3>Application status history</h3><ol class="timeline">' +
    a.status_history
      .map(function (entry) {
        var dotClass =
          entry[2] === "a"
            ? " timelineDotAdmin"
            : entry[2] === "r"
              ? " timelineDotReturn"
              : "";
        return (
          '<li class="timelineItem"><span class="timelineDot' +
          dotClass +
          '"></span>' +
          "<div><strong>" +
          esc(entry[0]) +
          "</strong><div>" +
          esc(entry[1]) +
          "</div></div></li>"
        );
      })
      .join("") +
    "</ol></div>";

  panel.innerHTML = html;
}

function renderAll() {
  renderCounters();
  renderQueue();
  renderDetail();
}

function toast(kind, title, text) {
  var el = document.createElement("div");
  el.className = "notice " + kind;
  el.innerHTML =
    "<strong>" + esc(title) + "</strong>" + esc(text);
  $("toastStack").appendChild(el);
  setTimeout(function () {
    el.remove();
  }, 5000);
}

function openModal(o) {
  $("modalTitle").textContent = o.title;
  $("modalBody").textContent = o.body;
  $("modalExtra").innerHTML = o.extra || "";
  var confirmBtn = $("modalConfirm");
  confirmBtn.textContent = o.confirmText;
  confirmBtn.className = "btn " + o.confirmClass;
  modalHandler = o.onConfirm;
  $("modalOverlay").classList.add("modalOpen");
  confirmBtn.focus();
}

function closeModal() {
  $("modalOverlay").classList.remove("modalOpen");
  modalHandler = null;
}

$("modalCancel").onclick = closeModal;
$("modalOverlay").onclick = function (e) {
  if (e.target === this) closeModal();
};
document.onkeydown = function (e) {
  if (e.key === "Escape") closeModal();
};
$("modalConfirm").onclick = function () {
  var handler = modalHandler;
  closeModal();
  if (handler) handler();
};

function decide(a, decision) {
  var remarks = (state.remarks[a.control_number] || "").trim();
  var name = a.client_name;
  var worker = a.assigned_social_worker;

  api("decide.php", {
    application_id: a.application_id,
    decision: decision,
    remarks: remarks,
  })
    .then(function () {
      delete state.remarks[a.control_number];
      state.remarkError = false;
      return loadApps();
    })
    .then(function () {
      if (decision === "APPROVED") {
        toast("noticeSuccess", "Application approved",
          name + "'s application was approved. " + worker + " has been notified.");
      } else {
        toast("noticeInfo", "Returned for correction",
          worker + " has been notified to fix the report.");
      }
      renderAll();
    })
    .catch(function (err) {
      toast("noticeWarning", "Could not save decision", err.message);
      loadApps().then(renderAll).catch(function () {});
    });
}

function openCase(id) {
  var a = byId(id);
  if (!a) return;
  state.selectedId = String(a.application_id);
  state.remarkError = false;

  var starting = a.current_status === "FOR_ADMIN_REVIEW";
  if (starting) a.current_status = "ADMIN_REVIEWING";
  renderAll();
  $("detailPanel").scrollTop = 0;
  if (window.innerWidth <= 900)
    $("detailPanel").scrollIntoView({ behavior: "smooth" });

  if (starting) {
    api("open_case.php", { application_id: a.application_id })
      .then(loadApps)
      .then(function () { renderCounters(); renderQueue(); })
      .catch(function (err) {
        toast("noticeWarning", "Could not start review", err.message);
        loadApps().then(renderAll).catch(function () {});
      });
  }
}

$("queueList").onclick = function (e) {
  var btn = e.target.closest(".queueItem");
  if (btn) openCase(btn.getAttribute("data-id"));
};

// Bell and banner: jump to the oldest waiting report
$("alertBanner").onclick = function (e) {
  var btn = e.target.closest("[data-open]");
  if (!btn) return;
  state.filter = "pending";
  $("statusFilter").value = "pending";
  openCase(btn.getAttribute("data-open"));
};

$("bellBtn").onclick = function () {
  var waiting = apps.filter(isPending).sort(function (x, y) {
    return x.entered_review_at - y.entered_review_at;
  });
  if (!waiting.length) {
    toast(
      "noticeInfo",
      "All caught up",
      "No reports are waiting for your review.",
    );
    return;
  }
  state.filter = "pending";
  $("statusFilter").value = "pending";
  openCase(waiting[0].application_id);
};

$("searchInput").oninput = function (e) {
  state.search = e.target.value;
  renderQueue();
};
$("statusFilter").onchange = function (e) {
  state.filter = e.target.value;
  renderQueue();
};

$("detailPanel").oninput = function (e) {
  if (e.target.id !== "remarksInput") return;
  state.remarks[state.selectedId] = e.target.value;
  if (state.remarkError && e.target.value.trim()) {
    state.remarkError = false;
    renderDetail();
    var t = $("remarksInput");
    t.focus();
    t.setSelectionRange(t.value.length, t.value.length);
  }
};

$("detailPanel").onclick = function (e) {
  var a = byId(state.selectedId);
  if (!a) return;

  if (e.target.id === "btnApprove") {
    openModal({
      title: "Approve this application?",
      body:
        "You are approving " +
        a.client_name +
        "'s " +
        a.assistance_type +
        " application. The case moves to assistance processing.",
      confirmText: "Approve",
      confirmClass: "btnConfirm",
      onConfirm: function () {
        decide(a, "APPROVED");
      },
    });
  }

  if (e.target.id === "btnReturn") {
    var remarks = (
      state.remarks[a.control_number] || ""
    ).trim();
    if (!remarks) {
      state.remarkError = true;
      renderDetail();
      $("remarksInput").focus();
      toast(
        "noticeWarning",
        "Action needed",
        "Add remarks explaining what needs correction.",
      );
      return;
    }
    openModal({
      title: "Return for correction?",
      body: "The report goes back to staff with your remarks. It returns to your queue after they re-submit.",
      extra: '<div class="noteBox">' + esc(remarks) + "</div>",
      confirmText: "Return report",
      confirmClass: "btnPrimary",
      onConfirm: function () {
        decide(a, "RETURNED_FOR_CORRECTION");
      },
    });
  }
};

$("btnSignOut").onclick = function () {
  api("logout.php", {})
    .then(function (res) { window.location.href = res.redirect; })
    .catch(function (err) { toast("noticeWarning", "Sign out failed", err.message); });
};

// Logo fallbacks (kept out of the HTML)
function bindImageFallbacks() {
  document.querySelectorAll(".brandLogo").forEach(function (img) {
    function fallback() {
      var span = document.createElement("span");
      span.className = "logoFallback";
      span.textContent = "PASIG";
      img.replaceWith(span);
    }
    img.addEventListener("error", fallback);
    if (img.complete && img.naturalWidth === 0) fallback();
  });
  document.querySelectorAll(".brandWordmark").forEach(function (img) {
    img.addEventListener("error", function () { img.remove(); });
    if (img.complete && img.naturalWidth === 0) img.remove();
  });
}

// ---- Data layer (talks to /api/*.php) ----
function api(path, body) {
  var opts = { credentials: "same-origin", headers: {} };
  if (body) {
    opts.method = "POST";
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  return fetch("api/" + path, opts).then(function (res) {
    return res.json().catch(function () { return {}; }).then(function (data) {
      if (res.status === 401 && data.redirect) window.location.href = data.redirect;
      if (!res.ok) throw new Error(data.error || "Request failed (" + res.status + ")");
      return data;
    });
  });
}

function loadApps() {
  return api("applications.php").then(function (data) {
    if (!Array.isArray(data.applications)) {
      throw new Error("The applications API returned an invalid response.");
    }
    clockOffset = data.server_now - Date.now();
    apps = data.applications;
  });
}

// Every 30 seconds: pull fresh data so wait times and new reports update
function refresh() {
  var prev = byId(state.selectedId);
  var prevStatus = prev && prev.current_status;
  return loadApps()
    .then(function () {
      renderCounters();
      renderQueue();
      var cur = byId(state.selectedId);
      var typing = document.activeElement && document.activeElement.id === "remarksInput";
      if (cur && cur.current_status !== prevStatus && !typing) renderDetail();
    })
    .catch(function () {});
}

bindImageFallbacks();
loadApps()
  .then(renderAll)
  .catch(function (err) {
    renderAll();
    toast("noticeWarning", "Could not load applications", err.message);
  });
setInterval(refresh, 30000);
