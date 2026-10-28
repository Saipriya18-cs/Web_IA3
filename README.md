# Internship Hub  (with login, roles and resume upload)

Run:   npm start      then open http://localhost:3000   (MongoDB must be running)

## Logins created on first start
| Role      | Username  | Password      | Goes to      |
|-----------|-----------|---------------|--------------|
| placement | placement | placement123  | /placement   |
| student   | ananya    | student123    | /student     |
| student   | ravi      | student123    | /student     |

New students can register themselves on the login page (student accounts only).
Placement accounts cannot be self-registered. Change the default password:
    PLACEMENT_PASSWORD=mySecret npm start      (applies when the placement user is first created)
Optional: set SESSION_SECRET to a long random text so logins survive a server restart.

## Who can do what
| Action                              | Student | Placement |
|-------------------------------------|:-------:|:---------:|
| Browse internships                  |   yes   |    no*    |
| Edit own profile / upload resume    |   yes   |    no     |
| Apply (resume required)             |   yes   |    no     |
| See own applications / accept offer |   yes   |    no     |
| Add / delete internship             |   no    |    yes    |
| Review all applications, set status |   no    |    yes    |
| View applicants' resumes (PDF)      | own only|    yes    |
(*placement sees every internship in its own table)

## Files
- auth.js          password hashing, signed login cookie, role-check middleware
- server.js        all routes, each protected with student / placement / anyone
- views/           student.html and placement.html (only sent to the right role)
- public/          login page, css, js (student.js, placement.js, common.js)
- uploads/         resumes are saved here (not public; only served by a checked route)
