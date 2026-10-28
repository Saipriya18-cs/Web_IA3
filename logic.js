// ------------------------------------------------------------
// logic.js  -  the "thinking" part of our novelty features
// No Express code here, only small functions that are easy to explain.
// ------------------------------------------------------------
const { Application } = require('./models');

const DAY = 24 * 60 * 60 * 1000;   // one day in milliseconds
const GHOST_DAYS = 10;             // NOVELTY C: pending longer than this = flagged
const CONFIRM_DAYS = 3;            // NOVELTY D: days a selected student has to confirm
const WEEKLY_LIMIT = 3;            // NOVELTY G: max applications per 7 days

// How many days ago was this date?
const daysSince = (date) => Math.floor((Date.now() - new Date(date)) / DAY);

// "Python, SQL ,Git"  ->  ['python', 'sql', 'git']
const splitSkills = (text) =>
  (text || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

// NOVELTY A: Fit Meter. Compare student's skills with the must-have skills.
function fitScore(studentSkills, mustSkills) {
  const have = mustSkills.filter((s) => studentSkills.includes(s));
  const missing = mustSkills.filter((s) => !studentSkills.includes(s));
  const percent = mustSkills.length ? Math.round((100 * have.length) / mustSkills.length) : 100;
  return { percent, have: have.length, total: mustSkills.length, missing };
}

// NOVELTY I: Profile strength. Each of the 4 things is worth 25%.
function profileStrength(student) {
  let score = 0;
  const tips = [];
  if (student.qualification) score += 25; else tips.push('add your qualification');
  if (student.skills.length >= 2) score += 25; else tips.push('add at least 2 skills');
  if (student.projects >= 1) score += 25; else tips.push('add 1 project');
  if (student.about) score += 25; else tips.push('write one line about yourself');
  return { score, tips };
}

// NOVELTY C + B + D: the friendly message the STUDENT sees for each application
function studentNote(a) {
  const days = daysSince(a.appliedOn);
  if (a.status === 'Pending') {
    return days > GHOST_DAYS
      ? `Day ${days}: still under review, not forgotten. We reminded the company.`
      : `Day ${days}: under review`;
  }
  if (a.status === 'Shortlisted') return "You're on the shortlist!";
  if (a.status === 'Rejected') return a.reason ? `Feedback: ${a.reason}` : '';
  if (a.status === 'Selected') {
    return a.confirmed
      ? 'Confirmed. Congratulations!'
      : `Click "Accept offer" before ${new Date(a.confirmBy).toLocaleDateString('en-IN')}`;
  }
  return '';
}

// NOVELTY D: auto-waitlist
// If a Selected student did not confirm in time:
//   1) their offer is cancelled
//   2) the earliest Shortlisted student for that internship becomes Selected
async function expireOffers() {
  const late = await Application.find({
    status: 'Selected', confirmed: false, confirmBy: { $lt: new Date() }
  });
  for (const a of late) {
    a.status = 'Rejected';
    a.reason = 'Offer not confirmed in time';
    await a.save();

    const next = await Application
      .findOne({ internshipId: a.internshipId, status: 'Shortlisted' })
      .sort({ appliedOn: 1 });            // earliest applicant first
    if (next) {
      next.status = 'Selected';
      next.confirmBy = new Date(Date.now() + CONFIRM_DAYS * DAY);
      next.confirmed = false;
      next.reason = undefined;
      await next.save();
    }
  }
}

module.exports = {
  DAY, GHOST_DAYS, CONFIRM_DAYS, WEEKLY_LIMIT,
  daysSince, splitSkills, fitScore, profileStrength, studentNote, expireOffers
};
