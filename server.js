// ------------------------------------------------------------
// server.js  -  Node + Express + Mongoose
// The browser (jQuery) talks to these URLs ("routes") and gets JSON back.
//
// WHO CAN DO WHAT (role-based access control):
//   public       : /api/login  /api/register (students only)
//   student      : browse + apply, own profile, own resume, own applications, accept offer
//   placement    : add / delete internships, review all applications, view resumes
//
// BASE MODULES                         ROUTE                              ROLE
//  1. Add internship                   POST   /api/internships            placement
//  2. View all internships             GET    /api/internships            student / placement
//                                      GET    /api/internships/all        placement
//  3. Apply for internship             POST   /api/applications           student
//  4. Update application status        PUT    /api/applications/:id/status placement
//  5. Delete internship                DELETE /api/internships/:id        placement
// ------------------------------------------------------------
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { Internship, Student, Application, User } = require('./models');
const logic = require('./logic');
const auth = require('./auth');
const { requireRole } = auth;

const student = requireRole('student');                 // shortcut: only students
const placement = requireRole('placement');             // shortcut: only placement team
const anyone = requireRole('student', 'placement');     // shortcut: any logged-in user

const UPLOAD_DIR = path.join(__dirname, 'uploads');     // resumes are saved here (NOT public)
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const MAX_RESUME_BYTES = 2 * 1024 * 1024;               // 2 MB

const app = express();
app.use(express.json({ limit: '4mb' }));                // read JSON (resume is sent as base64, so a bit bigger)
app.use(auth.loadUser);                                 // on every request: who is this?

// ---------- PAGES ----------
// The student page and the placement page are NOT in the public folder.
// They are only sent to a logged-in person with the matching role.
app.get('/', (req, res) => res.redirect(req.user ? auth.homeFor(req.user.role) : '/login.html'));
app.get('/student', auth.requirePage('student'), (req, res) => res.sendFile(path.join(__dirname, 'views', 'student.html')));
app.get('/placement', auth.requirePage('placement'), (req, res) => res.sendFile(path.join(__dirname, 'views', 'placement.html')));

// login.html, css and js files are public
app.use(express.static(path.join(__dirname, 'public')));

// Small wrapper: if any async route crashes, send the error as JSON instead of hanging
const wrap = (fn) => (req, res) => fn(req, res).catch((err) => res.status(500).json({ error: err.message }));
const bad = (res, message) => res.status(400).json({ error: message });

// Count how many seats are already given to "Selected" students
const selectedCount = (internshipId) => Application.countDocuments({ internshipId, status: 'Selected' });

// Update the profile of ONE student (the id always comes from the login, never from the browser)
function saveStudent(studentId, b) {
  const data = {
    name: (b.name || '').trim(),
    qualification: (b.qualification || '').trim(),
    skills: logic.splitSkills(b.skills),
    projects: Number(b.projects) || 0,
    about: (b.about || '').trim()
  };
  return Student.findOneAndUpdate({ studentId }, data, { new: true });
}

// ================= LOGIN / REGISTER =================

// Students create their own account. (Placement accounts are NOT self-service, see seedUsers.)
app.post('/api/register', wrap(async (req, res) => {
  const b = req.body;
  const username = (b.username || '').trim().toLowerCase();
  const name = (b.name || '').trim();
  if (username.length < 3) return bad(res, 'Username needs at least 3 characters.');
  if ((b.password || '').length < 6) return bad(res, 'Password needs at least 6 characters.');
  if (!name) return bad(res, 'Please enter your name.');
  if (await User.findOne({ username })) return bad(res, 'That username is already taken.');

  const last = await Student.findOne().sort({ studentId: -1 });
  const studentId = last ? last.studentId + 1 : 101;
  await Student.create({ studentId, name, qualification: (b.qualification || '').trim() });

  const { salt, hash } = auth.hashPassword(b.password);
  const user = await User.create({ username, salt, passwordHash: hash, role: 'student', studentId });
  auth.startSession(res, user);
  res.json({ role: user.role, redirect: auth.homeFor(user.role) });
}));

app.post('/api/login', wrap(async (req, res) => {
  const user = await User.findOne({ username: (req.body.username || '').trim().toLowerCase() });
  // same message for "no such user" and "wrong password" so nobody can guess usernames
  if (!user || !auth.checkPassword(req.body.password || '', user.salt, user.passwordHash)) {
    return res.status(401).json({ error: 'Wrong username or password.' });
  }
  auth.startSession(res, user);
  res.json({ role: user.role, redirect: auth.homeFor(user.role) });
}));

app.post('/api/logout', (req, res) => { auth.endSession(res); res.json({ ok: true }); });

// Who am I? (the pages use this to show the name and role)
app.get('/api/me', anyone, wrap(async (req, res) => {
  const s = req.user.role === 'student' ? await Student.findOne({ studentId: req.user.studentId }) : null;
  res.json({ username: req.user.username, role: req.user.role, studentId: req.user.studentId, name: s ? s.name : null });
}));

// ================= INTERNSHIPS =================

// BASE 2 + NOVELTY H + A: internships students can see
// (deadline not over AND seats not full). If studentId is given, add the Fit Meter.
app.get('/api/internships', anyone, wrap(async (req, res) => {
  await logic.expireOffers();
  const me = req.user.role === 'student'
    ? await Student.findOne({ studentId: req.user.studentId }) : null;
  const list = await Internship.find({ lastDate: { $gte: new Date() } }).sort({ lastDate: 1 });
  const result = [];
  for (const i of list) {
    if ((await selectedCount(i.internshipId)) >= i.seats) continue;   // full -> hide
    const fit = me ? logic.fitScore(me.skills, i.mustSkills) : null;
    result.push({ ...i.toObject(), fit });
  }
  res.json(result);
}));

// BASE 2 (company side): every internship with its state (Open / Full / Expired)
app.get('/api/internships/all', placement, wrap(async (req, res) => {
  const list = await Internship.find().sort({ internshipId: 1 });
  const result = [];
  for (const i of list) {
    const taken = await selectedCount(i.internshipId);
    const state = i.lastDate < new Date() ? 'Expired' : taken >= i.seats ? 'Full' : 'Open';
    result.push({ ...i.toObject(), taken, state });
  }
  res.json(result);
}));

// BASE 1: add a new internship
app.post('/api/internships', placement, wrap(async (req, res) => {
  const b = req.body;
  if (!Number(b.internshipId) || !b.company || !b.role || !b.lastDate) {
    return bad(res, 'Internship ID (number), Company, Job role and Last date are needed.');
  }
  try {
    const doc = await Internship.create({
      internshipId: Number(b.internshipId),
      company: b.company.trim(),
      role: b.role.trim(),
      duration: b.duration,
      stipend: Number(b.stipend) || 0,
      eligibility: b.eligibility,
      mustSkills: logic.splitSkills(b.mustSkills),
      learnSkills: logic.splitSkills(b.learnSkills),
      dailyWork: b.dailyWork,
      tools: b.tools,
      hoursPerWeek: Number(b.hoursPerWeek) || 0,
      seats: Number(b.seats) || 1,
      firstTimer: !!b.firstTimer,
      lastDate: new Date(b.lastDate + 'T23:59:59'),      // deadline = end of that day
      taskQuestion: b.taskQuestion
    });
    res.json(doc);
  } catch (e) {
    if (e.code === 11000) return bad(res, 'That Internship ID already exists.');   // duplicate key
    throw e;
  }
}));

// BASE 5: delete an internship (and its applications)
app.delete('/api/internships/:id', placement, wrap(async (req, res) => {
  const id = Number(req.params.id);
  await Internship.deleteOne({ internshipId: id });
  await Application.deleteMany({ internshipId: id });
  res.json({ ok: true });
}));

// ================= STUDENTS (a student can only touch their OWN profile) =================

// Load my profile
app.get('/api/students/me', student, wrap(async (req, res) => {
  const s = await Student.findOne({ studentId: req.user.studentId });
  if (!s) return res.status(404).json({ error: 'Profile not found.' });
  res.json({ student: s, strength: logic.profileStrength(s) });
}));

// Save my profile + NOVELTY I (profile strength)
app.put('/api/students/me', student, wrap(async (req, res) => {
  if (!(req.body.name || '').trim()) return bad(res, 'Name is needed.');
  const s = await saveStudent(req.user.studentId, req.body);
  res.json({ student: s, strength: logic.profileStrength(s) });
}));

// RESUME: upload (PDF, max 2 MB). The browser sends it as base64 text inside JSON.
app.put('/api/students/me/resume', student, wrap(async (req, res) => {
  const { fileName, data } = req.body;
  if (!fileName || !data) return bad(res, 'Please choose a PDF file.');
  const bytes = Buffer.from(String(data), 'base64');
  if (!bytes.length) return bad(res, 'The file is empty.');
  if (bytes.length > MAX_RESUME_BYTES) return bad(res, 'Resume must be smaller than 2 MB.');
  if (bytes.subarray(0, 5).toString() !== '%PDF-') return bad(res, 'Only PDF files are allowed.');

  // random file name, so nobody can guess it and two students never overwrite each other
  const saved = crypto.randomBytes(16).toString('hex') + '.pdf';
  fs.writeFileSync(path.join(UPLOAD_DIR, saved), bytes);
  const s = await Student.findOneAndUpdate({ studentId: req.user.studentId },
    { resumeFile: saved, resumeName: String(fileName).slice(0, 100) }, { new: true });
  res.json({ resumeName: s.resumeName });
}));

// RESUME: a student opens their own resume
app.get('/api/students/me/resume', student, wrap(async (req, res) => {
  const s = await Student.findOne({ studentId: req.user.studentId });
  sendResume(res, s && s.resumeFile, s && s.resumeName);
}));

// Send a PDF from the uploads folder (file name is checked, so no path tricks like ../)
function sendResume(res, file, originalName) {
  if (!file || !/^[a-f0-9]{32}\.pdf$/.test(file) || !fs.existsSync(path.join(UPLOAD_DIR, file))) {
    return res.status(404).json({ error: 'No resume found.' });
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${(originalName || 'resume.pdf').replace(/[^\w.\- ]/g, '_')}"`);
  res.sendFile(path.join(UPLOAD_DIR, file));
}

// ================= APPLICATIONS =================

// BASE 3: apply for an internship (students only; "who is applying" comes from the login)
app.post('/api/applications', student, wrap(async (req, res) => {
  const b = req.body;
  const studentId = req.user.studentId;
  const internshipId = Number(b.internshipId);

  const me = await Student.findOne({ studentId });
  if (!me) return bad(res, 'Student profile not found.');
  if (!me.resumeFile) return bad(res, 'Please upload your resume (PDF) before applying.');

  const internship = await Internship.findOne({ internshipId });
  if (!internship) return bad(res, 'Internship not found.');
  if (internship.lastDate < new Date()) return bad(res, 'The deadline for this internship is over.');

  if (await Application.findOne({ studentId, internshipId })) return bad(res, 'You have already applied to this one.');

  // NOVELTY G: max 3 applications in the last 7 days
  const weekAgo = new Date(Date.now() - 7 * logic.DAY);
  const count = await Application.countDocuments({ studentId, appliedOn: { $gte: weekAgo } });
  if (count >= logic.WEEKLY_LIMIT) {
    return bad(res, `You can apply to ${logic.WEEKLY_LIMIT} internships per week. Choose the ones you truly want!`);
  }

  const doc = await Application.create({
    studentId, studentName: me.name,
    internshipId, company: internship.company, role: internship.role,
    taskAnswer: (b.taskAnswer || '').trim(),          // NOVELTY F
    resumeFile: me.resumeFile, resumeName: me.resumeName   // RESUME: the file used for THIS application
  });
  res.json(doc);
}));

// Student side: my applications with friendly notes (NOVELTY B, C, D)
app.get('/api/applications', student, wrap(async (req, res) => {
  await logic.expireOffers();
  const list = await Application.find({ studentId: req.user.studentId }).sort({ appliedOn: -1 });
  res.json(list.map((a) => ({ ...a.toObject(), note: logic.studentNote(a) })));
}));

// Company side: all applications, with Ghost Guard flag (NOVELTY C)
app.get('/api/applications/all', placement, wrap(async (req, res) => {
  await logic.expireOffers();
  const list = await Application.find().sort({ appliedOn: 1 });
  res.json(list.map((a) => {
    const days = logic.daysSince(a.appliedOn);
    return { ...a.toObject(), days, ghost: a.status === 'Pending' && days > logic.GHOST_DAYS };
  }));
}));

// BASE 4: update status  (+ NOVELTY B rejection reason, NOVELTY D offer deadline)
app.put('/api/applications/:id/status', placement, wrap(async (req, res) => {
  const { status, reason } = req.body;
  const a = await Application.findById(req.params.id);
  if (!a) return bad(res, 'Application not found.');
  if (!['Pending', 'Shortlisted', 'Selected', 'Rejected'].includes(status)) return bad(res, 'Pick a valid status.');
  if (status === 'Rejected' && !reason) return bad(res, 'Pick a reason so the student gets feedback.');

  a.confirmBy = undefined;
  a.confirmed = false;
  if (status === 'Selected') {
    const internship = await Internship.findOne({ internshipId: a.internshipId });
    const others = await Application.countDocuments({
      internshipId: a.internshipId, status: 'Selected', _id: { $ne: a._id }
    });
    if (internship && others >= internship.seats) return bad(res, 'All seats already have selected students.');
    a.confirmBy = new Date(Date.now() + logic.CONFIRM_DAYS * logic.DAY);   // student must confirm in 3 days
  }
  a.status = status;
  a.reason = status === 'Rejected' ? reason : undefined;
  await a.save();
  res.json(a);
}));

// NOVELTY D: student accepts the offer
app.put('/api/applications/:id/accept', student, wrap(async (req, res) => {
  const a = await Application.findById(req.params.id);
  if (a && a.studentId !== req.user.studentId) return res.status(403).json({ error: 'This is not your application.' });
  if (!a || a.status !== 'Selected') return bad(res, 'Only a Selected application can be accepted.');
  a.confirmed = true;
  await a.save();
  res.json(a);
}));

// RESUME: placement can open any applicant's resume; a student only their own
app.get('/api/applications/:id/resume', anyone, wrap(async (req, res) => {
  const a = await Application.findById(req.params.id);
  if (!a) return res.status(404).json({ error: 'Application not found.' });
  if (req.user.role === 'student' && a.studentId !== req.user.studentId) {
    return res.status(403).json({ error: 'This is not your application.' });
  }
  sendResume(res, a.resumeFile, a.resumeName);
}));

// ================= START =================

// Put sample data the first time so the website is not empty
async function seedIfEmpty() {
  if (await Internship.countDocuments()) return;
  const ahead = (n) => new Date(Date.now() + n * logic.DAY);
  await Internship.insertMany([
    { internshipId: 1, company: 'TechNova', role: 'Python Intern', duration: '2 months', stipend: 8000,
      eligibility: 'Any CSE student', mustSkills: ['python', 'sql', 'git'], learnSkills: ['flask', 'docker'],
      dailyWork: 'Fix small bugs and write helper scripts', tools: 'VS Code, Python, GitHub',
      hoursPerWeek: 10, seats: 2, firstTimer: true, lastDate: ahead(30),
      taskQuestion: 'In two lines, explain what a Python list is.' },
    { internshipId: 2, company: 'GreenLeaf Labs', role: 'Data Analyst Intern', duration: '3 months', stipend: 10000,
      eligibility: 'No CGPA needed', mustSkills: ['excel', 'python'], learnSkills: ['pandas', 'power bi'],
      dailyWork: 'Clean data and build simple charts', tools: 'Excel, Python',
      hoursPerWeek: 15, seats: 1, firstTimer: true, lastDate: ahead(20),
      taskQuestion: 'How would you find duplicate values in a column?' },
    { internshipId: 3, company: 'PixelCraft', role: 'UI Design Intern', duration: '1 month', stipend: 5000,
      eligibility: 'Any branch', mustSkills: ['figma', 'html'], learnSkills: ['css', 'ux'],
      dailyWork: 'Design app screens with the team', tools: 'Figma',
      hoursPerWeek: 8, seats: 2, firstTimer: true, lastDate: ahead(15), taskQuestion: '' }
  ]);
  await Student.insertMany([
    { studentId: 101, name: 'Ananya', qualification: 'B.Tech CSE', skills: ['python', 'sql', 'git'], projects: 2, about: 'Loves solving real problems' },
    { studentId: 102, name: 'Ravi', qualification: 'B.Sc Maths', skills: ['excel', 'python'], projects: 0, about: '' }
  ]);
  // Ananya's application is 12 days old, so Ghost Guard will flag it
  await Application.insertMany([
    { studentId: 101, studentName: 'Ananya', internshipId: 1, company: 'TechNova', role: 'Python Intern', appliedOn: ahead(-12), status: 'Pending' },
    { studentId: 102, studentName: 'Ravi', internshipId: 1, company: 'TechNova', role: 'Python Intern', appliedOn: ahead(-2), status: 'Pending' },
    { studentId: 102, studentName: 'Ravi', internshipId: 2, company: 'GreenLeaf Labs', role: 'Data Analyst Intern', appliedOn: ahead(-5), status: 'Shortlisted' }
  ]);
}

// Create the first logins. A placement account must exist, because students cannot create one.
// CHANGE THESE PASSWORDS before showing the project to anyone else!
async function seedUsers() {
  const make = (username, password, role, studentId) => {
    const { salt, hash } = auth.hashPassword(password);
    return User.create({ username, salt, passwordHash: hash, role, studentId });
  };
  if (!(await User.findOne({ role: 'placement' }))) {
    await make('placement', process.env.PLACEMENT_PASSWORD || 'placement123', 'placement');
    console.log('Created placement login  ->  username: placement   password: ' + (process.env.PLACEMENT_PASSWORD || 'placement123'));
  }
  // logins for the two sample students (only if those students exist)
  for (const [username, id] of [['ananya', 101], ['ravi', 102]]) {
    if ((await Student.findOne({ studentId: id })) && !(await User.findOne({ username }))) {
      await make(username, 'student123', 'student', id);
      console.log(`Created student login    ->  username: ${username}   password: student123`);
    }
  }
}

const MONGO_URL = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/internship_hub';
// serverSelectionTimeoutMS: give up after 5 seconds (the default is 30) if MongoDB is not found
mongoose.connect(MONGO_URL, { serverSelectionTimeoutMS: 5000 })
  .then(() => console.log('Connected to MongoDB'))
  .then(seedIfEmpty)
  .then(seedUsers)
  .then(() => app.listen(3000, () => console.log('Open http://localhost:3000 in your browser')))
  .catch((err) => {
    console.log('\nCould NOT connect to MongoDB at: ' + MONGO_URL.replace(/\/\/.*@/, '//***@'));
    console.log('Fix: start the MongoDB service (Windows: Services > MongoDB Server > Start),');
    console.log('or use a free MongoDB Atlas link by setting MONGO_URL before npm start.\n');
    console.log('Technical message:', err.message);
    process.exit(1);
  });