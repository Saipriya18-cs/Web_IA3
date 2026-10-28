// ------------------------------------------------------------
// common.js  -  helpers shared by the student page and the placement page
// ------------------------------------------------------------

// Make text safe before putting it inside HTML (stops HTML injection)
const esc = (t) => $('<div>').text(t == null ? '' : t).html();

// Show a date like 28/10/2026
const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN') : '');

// One function for every server call. Shows the server's error message if something fails.
// 401 = session ended -> go back to the login page.
function api(method, url, body) {
  return $.ajax({
    url, method,
    contentType: 'application/json',
    data: body ? JSON.stringify(body) : undefined,
    dataType: 'json'
  }).fail((xhr) => {
    const onLoginPage = location.pathname.endsWith('login.html');
    if (xhr.status === 401 && !onLoginPage) { location.href = '/login.html'; return; }
    alert((xhr.responseJSON && xhr.responseJSON.error) || 'Something went wrong');
  });
}

// Small "Done!" message that fades in and out (jQuery animation)
function toast(msg) { $('#toast').text(msg).fadeIn(200).delay(1800).fadeOut(400); }

const chip = (text) => `<span class="chip chip-${esc(text)}">${esc(text)}</span>`;

// Top bar: shows who is logged in + the Logout button.
// If someone with the wrong role opens this page, the server already redirected them.
function initTopbar() {
  $.getJSON('/api/me').done((me) => {
    const label = me.role === 'student' ? `${esc(me.name)} (ID ${me.studentId})` : esc(me.username);
    $('#whoami').html(`<span class="role-badge role-${me.role}">${me.role}</span> ${label}`);
  }).fail(() => { location.href = '/login.html'; });

  $('#logoutBtn').on('click', () => {
    $.ajax({ url: '/api/logout', method: 'POST' }).always(() => { location.href = '/login.html'; });
  });
}
