// ------------------------------------------------------------
// placement.js  -  the PLACEMENT page (add / delete internships, review applications)
// Needs common.js (esc, fmt, api, toast, chip) loaded first.
// ------------------------------------------------------------
const STATUSES = ['Pending', 'Shortlisted', 'Selected', 'Rejected'];
const REASONS = ['Skill gap', 'Limited seats', 'Incomplete profile', 'Other'];   // NOVELTY B

// ---------- add / view / delete internships (BASE 1, 2, 5) ----------
$('#addBtn').on('click', function () {
  const body = {
    internshipId: $('#f_internshipId').val(), company: $('#f_company').val(), role: $('#f_role').val(),
    duration: $('#f_duration').val(), stipend: $('#f_stipend').val(), eligibility: $('#f_eligibility').val(),
    mustSkills: $('#f_must').val(), learnSkills: $('#f_learn').val(), dailyWork: $('#f_daily').val(),
    tools: $('#f_tools').val(), hoursPerWeek: $('#f_hours').val(), seats: $('#f_seats').val(),
    lastDate: $('#f_lastDate').val(), taskQuestion: $('#f_task').val(),
    firstTimer: $('#f_firstTimer').is(':checked')
  };
  api('POST', '/api/internships', body).done(() => {
    $('#addForm')[0].reset();
    toast('Internship posted');
    refreshAll();
  });
});

function loadAll() {
  api('GET', '/api/internships/all').done((list) => {
    $('#allBody').html(list.map((i) => `
      <tr>
        <td>${i.internshipId}</td><td>${esc(i.company)}</td><td>${esc(i.role)}</td><td>${esc(i.duration)}</td>
        <td>Rs.${i.stipend}</td><td>${fmt(i.lastDate)}</td><td>${i.taken}/${i.seats} filled</td>
        <td>${chip(i.state)}</td>
        <td><button class="btn btn-soft btn-sm del-btn" data-id="${i.internshipId}">Delete</button></td>
      </tr>`).join(''));
  });
}

$(document).on('click', '.del-btn', function () {
  const id = $(this).data('id');
  if (confirm(`Delete internship ${id}? Its applications will be removed too.`)) {
    api('DELETE', '/api/internships/' + id).done(() => { toast('Deleted'); refreshAll(); });
  }
});

// ---------- review applications (BASE 4 + NOVELTY B, C + RESUME) ----------
function loadReview() {
  api('GET', '/api/applications/all').done((list) => {
    $('#reviewBody').html(list.map((a) => `
      <tr class="${a.ghost ? 'ghost-row' : ''}" data-id="${a._id}">
        <td>${esc(a.studentName)} (${a.studentId})</td>
        <td>${esc(a.company)} - ${esc(a.role)}</td>
        <td>${fmt(a.appliedOn)}</td>
        <td>${a.ghost ? '⚠ ' : ''}${a.days} days</td>
        <td>${a.resumeFile
          ? `<a href="/api/applications/${a._id}/resume" target="_blank">View PDF</a>`
          : '<span class="text-muted">none</span>'}</td>
        <td>${esc(a.taskAnswer)}</td>
        <td><select class="form-select form-select-sm st">
          ${STATUSES.map((s) => `<option ${s === a.status ? 'selected' : ''}>${s}</option>`).join('')}
        </select></td>
        <td><select class="form-select form-select-sm rs" ${a.status === 'Rejected' ? '' : 'style="display:none"'}>
          <option value="">Pick a reason</option>
          ${REASONS.map((r) => `<option ${r === a.reason ? 'selected' : ''}>${r}</option>`).join('')}
        </select></td>
        <td><button class="btn btn-main btn-sm upd-btn">Update</button></td>
      </tr>`).join(''));
  });
}

// The reason dropdown appears only when "Rejected" is chosen
$(document).on('change', '.st', function () {
  $(this).closest('tr').find('.rs').toggle($(this).val() === 'Rejected');
});

$(document).on('click', '.upd-btn', function () {
  const row = $(this).closest('tr');
  api('PUT', `/api/applications/${row.data('id')}/status`, {
    status: row.find('.st').val(),
    reason: row.find('.rs').val()
  }).done(() => { toast('Status updated'); refreshAll(); });
});

// ---------- start ----------
function refreshAll() { loadAll(); loadReview(); }

$('button[data-bs-toggle="pill"]').on('shown.bs.tab', refreshAll);   // refresh when a tab opens
initTopbar();
refreshAll();
