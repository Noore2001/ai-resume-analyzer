const $ = id => document.getElementById(id);
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

/* ---------- Dictionaries (edit freely) ---------- */
const SKILLS = {
  "Programming": ["javascript","typescript","python","java","c++","c#","go","rust","php","ruby","kotlin","swift","sql","html","css","bash"],
  "Frameworks": ["react","angular","vue","node.js","express","django","flask","spring","next.js","tailwind","bootstrap",".net","laravel"],
  "Data and AI": ["machine learning","deep learning","nlp","tensorflow","pytorch","pandas","numpy","scikit-learn","power bi","tableau","excel","data analysis","statistics"],
  "Cloud and DevOps": ["aws","azure","gcp","docker","kubernetes","git","github","ci/cd","jenkins","terraform","linux"],
  "Databases": ["mysql","postgresql","mongodb","redis","firebase","oracle","sqlite"],
  "Soft skills": ["leadership","communication","teamwork","problem solving","collaboration","mentoring","project management","agile","scrum"]
};
const VERBS = ["achieved","built","created","delivered","designed","developed","drove","improved","increased","implemented","led","launched","managed","optimized","reduced","automated","architected","analyzed","streamlined","mentored","deployed","migrated","generated","negotiated","resolved","scaled","trained","spearheaded"];
const WEAK = ["responsible for","worked on","helped with","duties included","tasked with","assisted in","various","etc","hard worker","team player","go-getter","detail-oriented","references available","results-driven"];
const STOP = new Set("a about above after all also am an and any are as at be been being but by can could did do does for from had has have he her his i if in into is it its may more most must my no not of on or our out over should so such than that the their them then there these they this to up us was we were what when which who will with would you your experience ability work working team years year strong including using use new".split(" "));
const SECTIONS = {
  Summary: /\b(summary|objective|profile|about me)\b/i,
  Experience: /\b(experience|employment|work history|internship)\b/i,
  Education: /\b(education|academic|university|college|b\.?tech|bachelor|master)\b/i,
  Skills: /\b(skills|technologies|tech stack|competencies)\b/i,
  Projects: /\bprojects?\b/i,
  Certifications: /\b(certifications?|certificates?|courses)\b/i
};

/* ---------- File reading ---------- */
async function readFile(f) {
  const ext = f.name.split(".").pop().toLowerCase();
  if (ext === "txt") return f.text();
  const buf = await f.arrayBuffer();
  if (ext === "docx") return (await mammoth.extractRawText({ arrayBuffer: buf })).value;
  if (ext === "pdf") {
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    let out = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const c = await (await pdf.getPage(i)).getTextContent();
      out += c.items.map(t => t.str).join(" ") + "\n";
    }
    return out;
  }
  throw new Error("Unsupported file. Use PDF, DOCX or TXT.");
}
async function handleFile(f) {
  if (!f) return;
  msg("Reading " + f.name + "...", false);
  try {
    const t = (await readFile(f)).trim();
    if (!t) throw new Error("No text found. Scanned PDFs need OCR; paste the text instead.");
    $("resume").value = t; msg("");
  } catch (e) { msg(e.message); }
}
function msg(t, err = true) { $("msg").textContent = t; $("msg").style.color = err ? "var(--bad)" : "var(--mute)"; }

/* ---------- Analysis ---------- */
const has = (text, term) => new RegExp("(^|[^a-z0-9+#.])" + term.replace(/[.+*?^${}()|[\]\\]/g, "\\$&") + "($|[^a-z0-9+#])", "i").test(text);
const tokens = t => (t.toLowerCase().match(/[a-z][a-z+#.]{1,}/g) || []).map(w => w.replace(/\.$/, "")).filter(w => !STOP.has(w) && w.length > 2);

function analyze(text, jd) {
  const lower = text.toLowerCase();
  const words = text.split(/\s+/).filter(Boolean);
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  const bullets = lines.filter(l => /^[-•*▪●◦]/.test(l));
  const contact = {
    Email: /[\w.+-]+@[\w-]+\.[\w.]+/.test(text),
    Phone: /(\+?\d[\d\s().-]{8,}\d)/.test(text),
    LinkedIn: /linkedin\.com/i.test(text),
    "GitHub / portfolio": /github\.com|portfolio|behance|\.dev\b/i.test(text)
  };
  const sections = {};
  for (const k in SECTIONS) sections[k] = SECTIONS[k].test(text);

  const verbHits = VERBS.filter(v => has(lower, v) || has(lower, v.replace(/e?d$/, "ing")));
  const metrics = (text.match(/\d+(\.\d+)?\s?(%|x\b|k\b|m\b|\+)|[$₹€£]\s?\d[\d,.]*|\b\d{2,}\b\s+(users|customers|clients|projects|members|requests|records)/gi) || []);
  const weak = WEAK.filter(w => lower.includes(w));
  const found = {};
  for (const cat in SKILLS) { const m = SKILLS[cat].filter(s => has(lower, s)); if (m.length) found[cat] = m; }
  const skillCount = Object.values(found).flat().length;
  const pronouns = (lower.match(/\b(i|my|me)\b/g) || []).length;

  // job match
  let match = null;
  if (jd.trim()) {
    const freq = {};
    tokens(jd).forEach(w => freq[w] = (freq[w] || 0) + 1);
    const known = new Set(Object.values(SKILLS).flat());
    const keys = Object.entries(freq).sort((a, b) => (known.has(b[0]) * 3 + b[1]) - (known.has(a[0]) * 3 + a[1])).slice(0, 30).map(e => e[0]);
    const matched = keys.filter(k => has(lower, k)), missing = keys.filter(k => !has(lower, k));
    match = { matched, missing, pct: keys.length ? Math.round(matched.length / keys.length * 100) : 0 };
  }

  // scoring (each 0-100)
  const n = words.length;
  const score = {
    "Contact info": Math.round(Object.values(contact).filter(Boolean).length / 4 * 100),
    "Sections": Math.round(Object.values(sections).filter(Boolean).length / 6 * 100),
    "Length": n < 200 ? n / 2 : n <= 800 ? 100 : Math.max(40, 100 - (n - 800) / 10),
    "Action verbs": Math.min(100, verbHits.length * 12),
    "Measurable results": Math.min(100, metrics.length * 15),
    "Skills": Math.min(100, skillCount * 8),
    "Clarity": Math.max(0, 100 - weak.length * 15 - pronouns * 3)
  };
  if (match) score["Job match"] = match.pct;
  Object.keys(score).forEach(k => score[k] = Math.round(score[k]));
  const w = { "Contact info": 1, Sections: 1.5, Length: 1, "Action verbs": 1.3, "Measurable results": 1.5, Skills: 1.2, Clarity: 1, "Job match": 2.5 };
  let tot = 0, ws = 0;
  for (const k in score) { tot += score[k] * w[k]; ws += w[k]; }
  const overall = Math.round(tot / ws);

  // tips
  const tips = [];
  const add = (p, t) => tips.push({ p, t });
  Object.entries(contact).forEach(([k, v]) => { if (!v && k !== "GitHub / portfolio") add("high", "Add your " + k.toLowerCase() + " so recruiters and ATS can reach you."); });
  if (!contact["GitHub / portfolio"]) add("low", "Link a GitHub, portfolio or personal site to back up your work.");
  Object.entries(sections).forEach(([k, v]) => { if (!v && ["Experience", "Education", "Skills"].includes(k)) add("high", "No clear \"" + k + "\" heading found. ATS parsers rely on standard section titles."); else if (!v) add("low", "Consider adding a " + k + " section."); });
  if (n < 250) add("high", "Your resume is short (" + n + " words). Add detail on projects, responsibilities and outcomes.");
  if (n > 900) add("med", "Your resume is long (" + n + " words). Aim for one page (two if you have 8+ years of experience).");
  if (verbHits.length < 6) add("med", "Start bullets with strong action verbs such as built, led, reduced or launched.");
  if (metrics.length < 4) add("high", "Quantify your impact: add numbers, percentages or scale (e.g. \"cut load time by 35%\").");
  if (weak.length) add("med", "Replace weak phrases: " + weak.map(x => "\"" + x + "\"").join(", ") + ".");
  if (pronouns > 3) add("low", "Drop first-person pronouns (I, my). Write bullets in an implied first person.");
  if (skillCount < 6) add("med", "List more relevant technical skills, grouped by category.");
  if (bullets.length < 5) add("low", "Use bullet points for experience; they scan faster than paragraphs.");
  if (match && match.missing.length) add("high", "Work in missing job keywords you genuinely have: " + match.missing.slice(0, 8).join(", ") + ".");
  if (/[\u2190-\u21ff\u2600-\u27bf]/.test(text)) add("med", "Icons and special symbols can break ATS parsing. Stick to plain text.");
  if (!tips.length) add("low", "Looks strong. Tailor it to each job description before applying.");
  tips.sort((a, b) => "high med low".indexOf(a.p) - "high med low".indexOf(b.p));

  return { overall, score, contact, sections, found, match, tips, stats: { Words: n, Bullets: bullets.length, "Action verbs": verbHits.length, "Numbers / metrics": metrics.length, "Weak phrases": weak.length, "Read time": Math.max(1, Math.round(n / 200 * 60)) + " sec (recruiter scan: ~7 sec)" } };
}

/* ---------- Rendering ---------- */
const chip = (t, c = "") => `<span class="${c}">${t.replace(/</g, "&lt;")}</span>`;
function render(r) {
  $("results").hidden = false;
  const s = r.overall;
  $("ring").style.setProperty("--p", s);
  $("ring").style.setProperty("--c", s >= 75 ? "#16a34a" : s >= 50 ? "#d97706" : "#dc2626");
  $("scoreNum").textContent = s;
  $("verdict").textContent = s >= 75 ? "Strong resume" : s >= 50 ? "Good start, needs work" : "Needs significant improvement";
  $("verdictSub").textContent = "Overall score out of 100, based on " + Object.keys(r.score).length + " checks.";
  $("breakdown").innerHTML = Object.entries(r.score).map(([k, v]) => `<div class="bar"><span>${k}</span><i><b style="width:${v}%"></b></i><span>${v}</span></div>`).join("");
  $("sections").innerHTML = [...Object.entries(r.contact), ...Object.entries(r.sections)].map(([k, v]) => chip((v ? "✓ " : "✗ ") + k, v ? "ok" : "no")).join("");
  $("matchPanel").hidden = !r.match;
  if (r.match) {
    $("matchPct").textContent = r.match.pct + "%";
    $("matched").innerHTML = r.match.matched.map(k => chip(k)).join("") || "None";
    $("missing").innerHTML = r.match.missing.map(k => chip(k)).join("") || "None. Great coverage.";
  }
  $("skills").innerHTML = Object.entries(r.found).map(([c, l]) => `<div class="skillrow"><b>${c}</b><div class="chips">${l.map(x => chip(x)).join("")}</div></div>`).join("") || "No common skills detected. Add a Skills section.";
  $("tips").innerHTML = r.tips.map(t => `<li class="${t.p}">${t.t.replace(/</g, "&lt;")}</li>`).join("");
  $("stats").innerHTML = Object.entries(r.stats).map(([k, v]) => chip(k + ": " + v)).join("");
  $("results").scrollIntoView({ behavior: "smooth" });
}

/* ---------- Events ---------- */
$("analyze").onclick = () => {
  const t = $("resume").value.trim();
  if (t.split(/\s+/).length < 30) return msg("Add your resume first (at least 30 words).");
  msg(""); render(analyze(t, $("jd").value));
};
$("clear").onclick = () => { $("resume").value = $("jd").value = ""; $("results").hidden = true; msg(""); };
$("printBtn").onclick = () => window.print();
const drop = $("drop");
drop.onclick = () => $("file").click();
drop.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("file").click(); } };
$("file").onchange = e => handleFile(e.target.files[0]);
["dragover", "dragenter"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", e => handleFile(e.dataTransfer.files[0]));

const root = document.documentElement;
try { root.dataset.theme = localStorage.getItem("theme") || (matchMedia("(prefers-color-scheme:dark)").matches ? "dark" : "light"); } catch { }
$("themeBtn").onclick = () => {
  root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
  try { localStorage.setItem("theme", root.dataset.theme); } catch { }
};
