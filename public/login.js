// login.js  -  login + student registration
// After success the server tells us which page to open (student or placement).

function go(res) { location.href = res.redirect; }

$('#loginBtn').on('click', function () {
  api('POST', '/api/login', {
    username: $('#l_username').val(), password: $('#l_password').val()
  }).done(go);
});

$('#registerBtn').on('click', function () {
  api('POST', '/api/register', {
    name: $('#r_name').val(), qualification: $('#r_qualification').val(),
    username: $('#r_username').val(), password: $('#r_password').val()
  }).done(go);
});

// Press Enter to submit
$('#l_username, #l_password').on('keypress', (e) => { if (e.which === 13) $('#loginBtn').click(); });
