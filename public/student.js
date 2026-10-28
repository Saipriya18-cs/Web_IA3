// ------------------------------------------------------------
// student.js  -  the STUDENT page (browse, apply, resume, my applications)
// Needs common.js (esc, fmt, api, toast, chip) loaded first.
// Note: there is no Student ID box any more. The server knows who you are from your login.
// ------------------------------------------------------------
let currentInternship = null;     // the internship open in the pop-up
let internships = [];             // the list shown as cards
let hasResume = false;            // did the student upload a resume?

function profileBody() {
  return {
    name: $('#name').val(), qualification: $('#qualification').val(),
    skills: $('#skills').val(), projects: $('#projects').val(), about: $('#about').val()
  };
}

// ---------- profile (NOVELTY I) ----------
function showStrength(s) {
  $('#strengthBar').css('width', s.score + '%');
  $('#strengthText').text(`Profile ${s.score}% complete` + (s.tips.length ? ': ' + s.tips.join(', ') : '  ✓ great!'));
}

function showResume(student) {
  hasResume = !!student.resumeFile;
  $('#resumeStatus').html(hasResume
    ? `✓ <a href="/api/students/me/resume" target="_blank">${esc(student.resumeName)}</a>`
    : 'No resume uploaded yet.');
}

function saveProfile() {
  return api('PUT', '/api/students/me', profileBody()).done((res) => {
    showStrength(res.strength);
    refreshAll();
  });
}

function loadProfile() {
  api('GET', '/api/students/me').done((res) => {
    const s = res.student;
    $('#name').val(s.name);
    $('#qualification').val(s.qualification);
    $('#skills').val(s.skills.join(', '));
    $('#projects').val(s.projects);
    $('#about').val(s.about);
    showStrength(res.strength);
    showResume(s);
    loadInternships();
  });
}

// ---------- RESUME upload ----------
// We read the PDF in the browser, turn it into base64 text and send it as JSON.
$('#uploadBtn').on('click', function () {
  const file = $('#resumeFile')[0].files[0];
  if (!file) return alert('Please choose a PDF file first.');
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) return alert('Only PDF files are allowed.');
  if (file.size > 2 * 1024 * 1024) return alert('Resume must be smaller than 2 MB.');

  const reader = new FileReader();
  reader.onload = () => {
    const base64 = reader.result.split(',')[1];       // remove "data:application/pdf;base64,"
    api('PUT', '/api/students/me/resume', { fileName: file.name, data: base64 }).done((res) => {
      $('#resumeFile').val('');
      toast('Resume uploaded');
      showResume({ resumeFile: true, resumeName: res.resumeName });
    });
  };
  reader.readAsDataURL(file);
});

// ---------- internship cards (BASE 2 + NOVELTY A, E, H) ----------
function loadInternships() {
  api('GET', '/api/internships').done((list) => {
    internships = list;
    if (!list.length) {
      $('#cards').html('<p class="text-muted">No open internships right now.</p>');
      return;
    }
    $('#cards').html(list.map((i) => `
      <div class="col-md-6 col-lg-4">
        <div class="card-soft job-card" data-id="${i.internshipId}">
          <div class="company">${esc(i.company)}</div>
          <div class="text-muted">${esc(i.role)}</div>
          <div class="stipend my-2">Rs.${i.stipend}</div>
          <div class="small mb-2">${esc(i.duration)} &middot; apply by ${fmt(i.lastDate)}</div>
          ${i.firstTimer ? '<span class="badge badge-first">★ Beginner friendly</span>' : ''}
          ${i.fit ? `<span class="badge badge-fit">${i.fit.percent}% match</span>` : ''}
        </div>
      </div>`).join(''));
  });
}

// Click a card -> open the pop-up with the Reality Card (NOVELTY E, A, F)
$(document).on('click', '.job-card', function () {
  const id = Number($(this).data('id'));
  currentInternship = internships.find((i) => i.internshipId === id);
  const i = currentInternship;

  $('#dTitle').text(`${i.company} - ${i.role}`);
  $('#dReality').html(`
    <div><strong>What you'll do:</strong> ${esc(i.dailyWork)}</div>
    <div><strong>Tools:</strong> ${esc(i.tools)} &nbsp; <strong>Hours per week:</strong> ${i.hoursPerWeek}</div>
    <div><strong>Eligibility:</strong> ${esc(i.eligibility)}</div>
    <div><strong>Must-have skills:</strong> ${esc(i.mustSkills.join(', '))}</div>
    <div><strong>You can learn on the job:</strong> ${esc(i.learnSkills.join(', '))}</div>`);

  // Fit Meter
  if (i.fit) {
    $('#fitBar').css('width', i.fit.percent + '%');
    $('#fitText').text(`You match ${i.fit.have} of ${i.fit.total} must-have skills` +
      (i.fit.missing.length ? ` - learn ${i.fit.missing.join(', ')} to reach 100%` : " - you're a great match!"));
  }

  // Mini-task is shown only if this internship has one
  $('#taskAnswer').val('');
  $('#taskQ').text(i.taskQuestion || '');
  $('#taskBox').toggle(!!i.taskQuestion);

  // Resume warning
  $('#dResume').html(hasResume
    ? '<span class="text-success">✓ Your uploaded resume will be sent with this application.</span>'
    : '<span class="text-danger">Please upload your resume (PDF) in your profile before applying.</span>');

  bootstrap.Modal.getOrCreateInstance('#detailModal').show();
});

// Apply button inside the pop-up (BASE 3)
$('#applyBtn').on('click', function () {
  api('POST', '/api/applications', {
    internshipId: currentInternship.internshipId,
    taskAnswer: $('#taskAnswer').val()
  }).done(() => {
    bootstrap.Modal.getInstance('#detailModal').hide();
    toast('Applied! Track it in My Applications');
    refreshAll();
  });
});

// ---------- my applications (NOVELTY B, C, D) ----------
function loadMyApps() {
  api('GET', '/api/applications').done((list) => {
    if (!list.length) {
      $('#myBody').html('<tr><td colspan="6" class="text-muted">No applications yet.</td></tr>');
      return;
    }
    $('#myBody').html(list.map((a) => `
      <tr>
        <td>${esc(a.company)}</td><td>${esc(a.role)}</td><td>${fmt(a.appliedOn)}</td>
        <td>${chip(a.status)}</td><td>${esc(a.note)}</td>
        <td>${a.status === 'Selected' && !a.confirmed
          ? `<button class="btn btn-main btn-sm accept-btn" data-id="${a._id}">Accept offer</button>` : ''}</td>
      </tr>`).join(''));
  });
}

$(document).on('click', '.accept-btn', function () {
  api('PUT', `/api/applications/${$(this).data('id')}/accept`).done(() => {
    toast('Offer accepted!');
    refreshAll();
  });
});

// ---------- start ----------
function refreshAll() { loadInternships(); loadMyApps(); }

$('#saveBtn').on('click', saveProfile);
$('button[data-bs-toggle="pill"]').on('shown.bs.tab', refreshAll);   // refresh when a tab opens
initTopbar();
loadProfile();
loadMyApps();
