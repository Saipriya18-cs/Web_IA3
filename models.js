// ------------------------------------------------------------
// models.js  -  the shape of our data (MongoDB + Mongoose)
// A "schema" says which fields a document has and their types.
// A "model" lets us save / find / delete documents of that shape.
// ------------------------------------------------------------
const mongoose = require('mongoose');

// Collection 1: internships  (BASE: id, company, role, duration, stipend, eligibility)
const internshipSchema = new mongoose.Schema({
  internshipId: { type: Number, required: true, unique: true },
  company:      { type: String, required: true },
  role:         { type: String, required: true },
  duration:     String,
  stipend:      Number,
  eligibility:  String,

  mustSkills:   [String],   // NOVELTY A: skills you must already have
  learnSkills:  [String],   // NOVELTY A: skills you can learn on the job
  dailyWork:    String,     // NOVELTY E: Reality Card
  tools:        String,     // NOVELTY E
  hoursPerWeek: Number,     // NOVELTY E
  seats:        { type: Number, default: 1 },        // NOVELTY D/H
  firstTimer:   { type: Boolean, default: false },   // NOVELTY E: beginner badge
  lastDate:     { type: Date, required: true },      // NOVELTY H: deadline
  taskQuestion: String                               // NOVELTY F: optional mini-task
});

// Collection 2: students  (BASE: id, name, qualifications)
const studentSchema = new mongoose.Schema({
  studentId:     { type: Number, required: true, unique: true },
  name:          { type: String, required: true },
  qualification: String,
  skills:        [String],
  projects:      { type: Number, default: 0 },
  about:         String,
  resumeFile:    String,   // RESUME: saved file name (inside the uploads folder)
  resumeName:    String    // RESUME: original file name, shown to the user
});

// Collection 3: applications  (links a student to an internship)
// In MongoDB it is normal to copy small things (name, company, role) into this
// document, so we can show a table with ONE query and no joins.
const applicationSchema = new mongoose.Schema({
  studentId:    Number,
  studentName:  String,
  internshipId: Number,
  company:      String,
  role:         String,
  appliedOn:    { type: Date, default: Date.now },
  status:       { type: String, enum: ['Pending', 'Shortlisted', 'Selected', 'Rejected'], default: 'Pending' },

  reason:       String,                                // NOVELTY B: rejection reason
  confirmBy:    Date,                                  // NOVELTY D: offer deadline
  confirmed:    { type: Boolean, default: false },     // NOVELTY D
  taskAnswer:   String,                                // NOVELTY F
  resumeFile:   String,                                // RESUME: the resume attached when applying
  resumeName:   String
});

// Collection 4: users  (LOGIN + ROLES)
// role decides what a person is allowed to do:
//   'student'   -> browse, apply, upload resume, see own applications
//   'placement' -> add / delete internships, review applications, view resumes
// Passwords are never stored as plain text, only a salted hash.
const userSchema = new mongoose.Schema({
  username:     { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  salt:         { type: String, required: true },
  role:         { type: String, enum: ['student', 'placement'], required: true },
  studentId:    Number        // only for students: links the login to their profile
});

module.exports = {
  Internship:  mongoose.model('Internship', internshipSchema),
  Student:     mongoose.model('Student', studentSchema),
  Application: mongoose.model('Application', applicationSchema),
  User:        mongoose.model('User', userSchema)
};
