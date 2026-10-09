import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  Activity, ArrowDownToLine, ArrowUpRight, Bell, CalendarDays, Check, CheckCircle2,
  ChevronDown, ChevronRight, CircleHelp, ClipboardList, Cloud, FileText, Heart,
  HeartPulse, Home, Languages, LockKeyhole, LogOut, MessageCircle, Moon,
  MoreHorizontal, Plus, Search, Send, ShieldCheck, Sparkles, Sun, Trash2, Upload, X,
  Droplets, Pill, Smile, Mic, Copy, Footprints, CircleAlert, Eye,
} from "lucide-react";
import { account, deleteHealthData, endSession, getToken, loadHealthData, saveHealthData, sendChat, setToken } from "./api";
const TrendChart = lazy(() => import("./TrendChart"));

type Page = "Home" | "AI Copilot" | "Health Insights" | "Medications" | "Reports" | "Appointments" | "Profile" | "Privacy Center";
type Lang = "English" | "తెలుగు" | "हिन्दी";
type CheckIn = { date: string; mood: string; energy: number; sleep: number; stress: number; activity: number; water: number; notes: string; sample?: boolean };
type Medication = { id: string; name: string; schedule: string; taken: boolean; reminderTime?: string; note: string };
type MeasurementKind = "weight" | "bloodPressure" | "bloodGlucose" | "heartRate";
type Measurement = { id: string; type: MeasurementKind; date: string; value: number; secondary?: number; unit: string };
type ChartMetric = "sleep" | "activity" | "water" | "mood" | MeasurementKind;
type Report = { id: string; name: string; kind: string; added: string; values: { label: string; value: string; unit: string; range: string }[] };
type Appointment = { id: string; title: string; date: string; time: string; clinician: string; questions: string[]; summary: string };
type HealthData = { checkIns: CheckIn[]; measurements: Measurement[]; medications: Medication[]; reports: Report[]; appointments: Appointment[]; timeline: { title: string; date: string; type: string }[] };
type Message = { role: "user" | "assistant"; text: string; emergency?: boolean };

const emptyData: HealthData = { checkIns: [], measurements: [], medications: [], reports: [], appointments: [], timeline: [] };
const initialCheckin: CheckIn = { date: new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10), mood: "Good", energy: 3, sleep: 7, stress: 2, activity: 30, water: 5, notes: "" };
const sampleTrend = [
  { day: "Mon", sleep: 7.1, activity: 34, water: 5 }, { day: "Tue", sleep: 6.6, activity: 48, water: 6 },
  { day: "Wed", sleep: 7.5, activity: 42, water: 5 }, { day: "Thu", sleep: 7.2, activity: 60, water: 7 },
  { day: "Fri", sleep: 6.8, activity: 38, water: 6 }, { day: "Sat", sleep: 8, activity: 72, water: 7 },
  { day: "Sun", sleep: 7.4, activity: 45, water: 6 },
];
const nav: { page: Page; icon: typeof Home }[] = [
  { page: "Home", icon: Home }, { page: "AI Copilot", icon: Sparkles },
  { page: "Health Insights", icon: Activity }, { page: "Medications", icon: Pill },
  { page: "Reports", icon: FileText }, { page: "Appointments", icon: CalendarDays },
  { page: "Profile", icon: Heart }, { page: "Privacy Center", icon: ShieldCheck },
];
const translated: Record<Lang, Record<string, string>> = {
  English: {},
  "తెలుగు": { Home: "హోమ్", "AI Copilot": "AI సహాయకుడు", "Health Insights": "ఆరోగ్య విశ్లేషణలు", Medications: "మందులు", Reports: "నివేదికలు", Appointments: "అపాయింట్‌మెంట్లు", Profile: "ప్రొఫైల్", "Privacy Center": "గోప్యత కేంద్రం", "Good morning": "శుభోదయం", "Daily check-in": "రోజువారీ నమోదు", "Today’s overview": "ఈరోజు అవలోకనం", "Wellness overview": "ఆరోగ్య అవలోకనం", "Your wellness trends": "మీ ఆరోగ్య ధోరణులు", "Today’s plan": "ఈరోజు ప్రణాళిక", "Health insights": "ఆరోగ్య విశ్లేషణలు", "Medical reports": "వైద్య నివేదికలు", "Appointment preparation": "అపాయింట్‌మెంట్ తయారీ", "Your profile": "మీ ప్రొఫైల్", "Privacy center": "గోప్యత కేంద్రం" },
  "हिन्दी": { Home: "होम", "AI Copilot": "AI सहायक", "Health Insights": "स्वास्थ्य जानकारी", Medications: "दवाइयाँ", Reports: "रिपोर्ट", Appointments: "अपॉइंटमेंट", Profile: "प्रोफ़ाइल", "Privacy Center": "गोपनीयता केंद्र", "Good morning": "सुप्रभात", "Daily check-in": "दैनिक जानकारी", "Today’s overview": "आज की जानकारी", "Wellness overview": "स्वास्थ्य का सार", "Your wellness trends": "आपके स्वास्थ्य के रुझान", "Today’s plan": "आज की योजना", "Health insights": "स्वास्थ्य जानकारी", "Medical reports": "चिकित्सा रिपोर्ट", "Appointment preparation": "अपॉइंटमेंट की तैयारी", "Your profile": "आपकी प्रोफ़ाइल", "Privacy center": "गोपनीयता केंद्र" },
};
const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
const localDate = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
const demoCheckin: CheckIn = { date: localDate, mood: "Good", energy: 4, sleep: 7.2, stress: 2, activity: 35, water: 6, notes: "", sample: true };
const testDescriptions: [RegExp, string][] = [
  [/hba1c|a1c/, "An estimate of average blood glucose over roughly the previous few months."],
  [/glucose|blood sugar/, "The amount of glucose (sugar) measured in the sample."],
  [/hemoglobin|\bhgb\b/, "A protein in red blood cells that carries oxygen."],
  [/white blood cell|\bwbc\b|leukocyte/, "A count of white blood cells, which are part of the immune system."],
  [/red blood cell|\brbc\b|erythrocyte/, "A count of red blood cells, which carry oxygen through the body."],
  [/platelet/, "A count of blood components that help form clots."],
  [/\btsh\b|thyroid stimulating/, "A hormone signal involved in regulating thyroid hormone production."],
  [/creatinine/, "A waste product measured to help assess kidney-related function."],
  [/cholesterol|triglyceride/, "A type of fat measured in blood as part of a lipid panel."],
  [/ferritin/, "A protein that stores iron; the result is interpreted with other information."],
  [/\balt\b|\bast\b|liver enzyme/, "An enzyme measurement that can provide information about liver and other tissue cells."],
  [/sodium|potassium|electrolyte/, "An electrolyte involved in fluid balance and normal cell function."],
  [/complete blood count|\bcbc\b/, "A panel reporting counts and measures of blood cells and platelets."],
];
const explainTest = (label: string) => testDescriptions.find(([pattern]) => pattern.test(label))?.[1]
  || "This test name came from your file. Ask the lab or clinician what it measures.";

function HealthLogoMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="hc-logo-gradient" x1="7" y1="7" x2="41" y2="41" gradientUnits="userSpaceOnUse">
          <stop stopColor="#16324F" />
          <stop offset="1" stopColor="#14B8A6" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="42" height="42" rx="14" fill="url(#hc-logo-gradient)" />
      <path d="M23 12v10h10v4H23v10h-4V26H9v-4h10V12h4Z" fill="white" opacity="0.94" />
      <path d="M14 29.5c2.3 0 3.4-3.2 5.1-3.2 1.5 0 2.2 4 4.8 4 2.1 0 3.2-2.1 4.7-4.2" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="14" r="2" fill="#60A5FA" />
      <circle cx="35" cy="17" r="2" fill="#A7F3D0" />
      <circle cx="35" cy="31" r="2" fill="#BFDBFE" />
    </svg>
  );
}

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`surface rounded-[24px] border border-[#e8edf3] bg-white shadow-[0_16px_40px_rgba(22,50,79,0.08)] ${className}`}>{children}</section>;
}
function Heading({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return <div className="mb-5 flex items-end justify-between gap-3"><div><h2 className="font-display text-[19px] font-bold tracking-[-.5px] text-[#1c302a] dark:text-white">{title}</h2>{sub && <p className="muted mt-1 text-[13px] text-[#85928d]">{sub}</p>}</div>{action}</div>;
}
function Badge({ children, tone = "green" }: { children: ReactNode; tone?: "green" | "amber" | "gray" }) {
  const style = { green: "bg-[#e8f5ee] text-[#347354]", amber: "bg-[#fff3dd] text-[#946a23]", gray: "bg-[#f0f3f2] text-[#687670]" }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${style}`}>{children}</span>;
}
function Button({ children, onClick, kind = "primary", className = "", type = "button", disabled = false }: { children: ReactNode; onClick?: () => void; kind?: "primary" | "secondary" | "plain" | "danger"; className?: string; type?: "button" | "submit"; disabled?: boolean }) {
  const color = { primary: "bg-[#286c52] text-white hover:bg-[#205941] shadow-sm", secondary: "border border-[#dfe8e3] bg-white text-[#345b49] hover:bg-[#f4f8f5] dark:bg-[#17211e]", plain: "text-[#63746d] hover:bg-[#f3f6f4]", danger: "bg-[#fff0ed] text-[#a84e41] hover:bg-[#ffe4df]" }[kind];
  return <button disabled={disabled} type={type} onClick={onClick} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2 text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${color} ${className}`}>{children}</button>;
}
function Field({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className="grid gap-1.5 text-xs font-semibold text-[#53635d]">{label}<input {...props} className={`field min-h-11 w-full rounded-xl border border-[#e5ebe7] bg-[#fbfcfb] px-3 text-[13px] font-normal text-[#243831] placeholder:text-[#a4aea9] ${props.className || ""}`} /></label>;
}
function Empty({ icon: Icon, title, text, action }: { icon: typeof FileText; title: string; text: string; action?: ReactNode }) {
  return <div className="flex flex-col items-center py-9 text-center"><span className="mb-3 rounded-2xl bg-[#eff7f2] p-3 text-[#438468]"><Icon size={20} /></span><p className="font-semibold text-[#31443c]">{title}</p><p className="mt-1 max-w-[290px] text-xs leading-5 text-[#84918b]">{text}</p>{action && <div className="mt-4">{action}</div>}</div>;
}

export default function App() {
  const [page, setPage] = useState<Page>("Home");
  const [data, setData] = useState<HealthData>(() => {
    try {
      const stored = localStorage.getItem("hc-demo-data");
      return stored ? { ...emptyData, ...JSON.parse(stored) } : { ...emptyData, checkIns: [demoCheckin] };
    } catch { return emptyData; }
  });
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem("hc-language") as Lang) || "English");
  const [dark, setDark] = useState(() => localStorage.getItem("hc-dark") === "true");
  const [notice, setNotice] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [cloudReady, setCloudReady] = useState(false);
  const [booting, setBooting] = useState(Boolean(getToken()));
  const [checkOpen, setCheckOpen] = useState(false);
  const [check, setCheck] = useState<CheckIn>({ ...initialCheckin, date: localDate });
  const [medOpen, setMedOpen] = useState(false);
  const [medDraft, setMedDraft] = useState({ name: "", schedule: "Morning", time: "", note: "" });
  const [reportDraft, setReportDraft] = useState<Report | null>(null);
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const stored: unknown = JSON.parse(sessionStorage.getItem("hc-chat-history") || "null");
      if (Array.isArray(stored) && stored.length > 0 && stored.every((item) =>
        typeof item === "object" && item !== null &&
        "role" in item && (item.role === "user" || item.role === "assistant") &&
        "text" in item && typeof item.text === "string"
      )) return stored as Message[];
    } catch { /* Ignore unavailable or malformed session history. */ }
    return [{ role: "assistant", text: "Hi, I’m your health information companion. I can help explain general health concepts and organize what you share. I can’t diagnose or replace a clinician. What’s on your mind?" }];
  });
  const [question, setQuestion] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileMore, setMobileMore] = useState(false);
  const [chartMetric, setChartMetric] = useState<ChartMetric>("sleep");
  const [measurementOpen, setMeasurementOpen] = useState(false);
  const [measurementDraft, setMeasurementDraft] = useState({ type: "weight" as MeasurementKind, date: localDate, value: "", secondary: "", unit: "kg" });
  const [summary, setSummary] = useState({ concern: "", timeline: "", symptoms: "", measurements: "", medications: "", questions: "", observations: "" });
  const [visitDetails, setVisitDetails] = useState({ date: "", time: "", clinician: "" });
  const [showConfirm, setShowConfirm] = useState(false);
  const [welcome, setWelcome] = useState(() => !getToken() && localStorage.getItem("hc-onboarded") !== "true");
  const [aiConsent, setAiConsent] = useState(() => localStorage.getItem("hc-ai-consent") === "true");
  const skipNextSync = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const chatSendingRef = useRef(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const text = (key: string) => translated[lang][key] || key;
  const shareText = async (content: string) => {
    try {
      if (navigator.share) { await navigator.share({ title: "HealthCopilot summary", text: content }); setNotice("Summary shared."); }
      else if (navigator.clipboard) { await navigator.clipboard.writeText(content); setNotice("Summary copied to clipboard."); }
      else throw new Error("Sharing is unavailable in this browser.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setNotice(`Could not share summary: ${(error as Error).message}`);
    }
  };
  const addVisitContext = () => {
    const checkinContext = data.checkIns.filter((item) => !item.sample).slice(0, 7)
      .map((item) => `${item.date}: mood ${item.mood}; sleep ${item.sleep} h; activity ${item.activity} min; water ${item.water} glasses`).join("\n");
    const measurementContext = data.measurements.slice(-12)
      .map((item) => `${item.date}: ${item.type === "bloodPressure" ? `blood pressure ${item.value}/${item.secondary}` : `${item.type} ${item.value}`} ${item.unit}`).join("\n");
    const medicationContext = data.medications
      .map((item) => `${item.name} — ${item.schedule}${item.note ? ` (${item.note})` : ""}`).join("\n");
    if (!checkinContext && !measurementContext && !medicationContext) { setNotice("No personal check-ins, measurements, or medications to add yet."); return; }
    setSummary((current) => ({
      ...current,
      measurements: current.measurements || [checkinContext, measurementContext].filter(Boolean).join("\n"),
      medications: current.medications || medicationContext,
    }));
    setNotice("Your recorded health context was added to the editable summary.");
  };

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("hc-dark", String(dark));
  }, [dark]);
  useEffect(() => { localStorage.setItem("hc-language", lang); }, [lang]);
  useEffect(() => { sessionStorage.setItem("hc-chat-history", JSON.stringify(messages)); }, [messages]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, chatBusy]);
  useEffect(() => {
    if (getToken()) localStorage.removeItem("hc-demo-data");
    else localStorage.setItem("hc-demo-data", JSON.stringify(data));
    if (skipNextSync.current) { skipNextSync.current = false; return; }
    if (!cloudReady || !getToken()) return;
    const timeout = window.setTimeout(() => {
      saveHealthData(data).then(() => setNotice("Your private data is synced."))
        .catch((error: Error) => setNotice(`Sync issue: ${error.message}`));
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [data, cloudReady]);
  useEffect(() => {
    if (!getToken()) { setBooting(false); return; }
    loadHealthData().then((stored) => {
      if (Object.keys(stored).length) setData({ ...emptyData, ...stored } as HealthData);
      setAccountEmail(localStorage.getItem("hc-email") || "Signed-in account");
      setCloudReady(true);
    }).catch((error: Error) => { setNotice(`Could not load your private data: ${error.message}`); setToken(null); localStorage.removeItem("hc-email"); setData(emptyData); })
      .finally(() => setBooting(false));
  }, []);
  useEffect(() => { if (notice) { const id = window.setTimeout(() => setNotice(""), 3800); return () => window.clearTimeout(id); } }, [notice]);

  const latest = data.checkIns.slice().sort((a, b) => b.date.localeCompare(a.date))[0];
  const recordedCheckIns = data.checkIns.filter((item) => !item.sample).sort((a, b) => a.date.localeCompare(b.date));
  const hasRecordedCheckins = recordedCheckIns.length > 0;
  const pageNames = useMemo(() => nav.map((item) => text(item.page)), [lang]);
  const go = (target: Page) => { setPage(target); setMenuOpen(false); setMobileMore(false); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const saveCheckin = () => {
    setData((current) => ({ ...current, checkIns: [{ ...check, sample: false }, ...current.checkIns.filter((item) => !item.sample && item.date !== check.date)], timeline: [{ title: "Daily check-in completed", date: today, type: "Check-in" }, ...current.timeline] }));
    setCheckOpen(false); setNotice("Your check-in has been saved.");
  };
  const addMedication = (event: FormEvent) => {
    event.preventDefault();
    if (!medDraft.name.trim()) return;
    setData((current) => ({ ...current, medications: [...current.medications, { name: medDraft.name, schedule: medDraft.schedule, reminderTime: medDraft.time, note: medDraft.note, id: crypto.randomUUID(), taken: false }], timeline: [{ title: `${medDraft.name} added`, date: today, type: "Medication" }, ...current.timeline] }));
    setMedDraft({ name: "", schedule: "Morning", time: "", note: "" }); setMedOpen(false); setNotice("Medication added. Reminder times are saved, but notifications are not enabled in this demo.");
  };
  const addMeasurement = (event: FormEvent) => {
    event.preventDefault();
    const measurement: Measurement = {
      id: crypto.randomUUID(), type: measurementDraft.type, date: measurementDraft.date,
      value: Number(measurementDraft.value),
      ...(measurementDraft.type === "bloodPressure" ? { secondary: Number(measurementDraft.secondary) } : {}),
      unit: measurementDraft.type === "bloodPressure" ? "mmHg" : measurementDraft.unit,
    };
    setData((current) => ({ ...current, measurements: [...current.measurements, measurement], timeline: [{ title: `${measurementDraft.type === "bloodPressure" ? "Blood pressure" : measurementDraft.type} measurement recorded`, date: measurementDraft.date, type: "Measurement" }, ...current.timeline] }));
    setMeasurementOpen(false); setMeasurementDraft({ type: "weight", date: localDate, value: "", secondary: "", unit: "kg" }); setNotice("Measurement saved. Trends are observations, not medical conclusions.");
  };
  const markMedicationTaken = (id: string, name: string) => {
    setData((current) => ({ ...current, medications: current.medications.map((item) => item.id === id ? { ...item, taken: true } : item), timeline: [{ title: `Medication marked taken: ${name}`, date: today, type: "Medication" }, ...current.timeline] }));
    setNotice("Medication status saved as a personal record.");
  };
  const answer = (raw: string) => {
    const value = raw.trim(); if (!value) return;
    if (chatSendingRef.current) return;
    const urgent = /\b(chest pain|can't breathe|cannot breathe|difficulty breathing|trouble breathing|stroke|fainting|unconscious|severe bleeding|suicid|overdose)\b|ఛాతి నొప్పి|శ్వాస తీసుకోలేక|స్పృహ కోల్పో|గుండెపోటు|తీవ్ర రక్తస్రావం|आत्महत्या|ओवरडोज़|सीने में दर्द|सांस नहीं|सांस लेने में तकलीफ|बेहोश|स्ट्रोक|गंभीर रक्तस्राव/i.test(value);
    const urgentMessage = lang === "తెలుగు"
      ? "మీరు చెప్పిన లక్షణాలకు తక్షణ శ్రద్ధ అవసరం కావచ్చు. దయచేసి వెంటనే స్థానిక అత్యవసర సేవలను సంప్రదించండి లేదా సమీప అత్యవసర విభాగానికి వెళ్లండి. చాట్‌లో అత్యవసర పరిస్థితిని అంచనా వేయలేను."
      : lang === "हिन्दी"
        ? "आपके बताए लक्षणों पर तुरंत ध्यान देना ज़रूरी हो सकता है। कृपया अभी स्थानीय आपातकालीन सेवाओं से संपर्क करें या नज़दीकी आपातकालीन विभाग जाएँ। मैं चैट में आपात स्थिति का आकलन नहीं कर सकता।"
        : "What you described may need urgent attention. Please contact your local emergency services now or go to the nearest emergency department. If possible, ask someone nearby to stay with you. I can’t assess or rule out an emergency in chat.";
    const asksRecords = /\b(my records|my health data|my check.?ins?|my measurements|my medications|my sleep data|my activity data|my hydration|my mood records|my weight|my blood pressure|my glucose|my heart rate|show my|summari[sz]e my|recorded data)\b/i.test(value);
    const personalDetails = [
      ...data.checkIns.filter((item) => !item.sample).slice(0, 1).map((item) => `${item.date} check-in — mood ${item.mood}, sleep ${item.sleep} hours, activity ${item.activity} minutes, water ${item.water} glasses`),
      ...data.measurements.slice(-5).map((item) => `${item.date} — ${item.type === "bloodPressure" ? `blood pressure ${item.value}/${item.secondary}` : `${item.type} ${item.value}`} ${item.unit}`),
      ...data.medications.map((item) => `medication entered: ${item.name}, ${item.schedule}${item.reminderTime ? ` at ${item.reminderTime}` : ""}`),
    ];
    const recordedResponse = asksRecords && personalDetails.length
      ? `From information you entered: ${personalDetails.join("; ")}. These are personal records only, not a medical assessment. What would you like to understand better?`
      : asksRecords && latest?.sample
        ? "This demo contains an illustrative example check-in, not your personal health record. Save your own check-in or measurement to see your information here."
        : asksRecords ? "There are no matching personal records in this workspace yet. You can add check-ins or measurements from the dashboard and insights pages." : "";
    const userMessage: Message = { role: "user", text: value };
    setMessages((current) => [...current, userMessage]);
    setQuestion("");
    if (urgent || recordedResponse) {
      setMessages((current) => [...current, { role: "assistant", emergency: urgent, text: urgent ? urgentMessage : recordedResponse }]);
      return;
    }
    chatSendingRef.current = true;
    setChatBusy(true);
    const conversation = [...messages, userMessage].slice(-20)
      .map(({ role, text: content }) => ({ role, content }));
    void sendChat(conversation)
      .then(({ reply }) => setMessages((current) => [...current, { role: "assistant", text: reply }]))
      .catch((error: unknown) => {
        const detail = error instanceof Error ? error.message : "Please try again in a moment.";
        setMessages((current) => [...current, { role: "assistant", text: `I couldn’t get a response. ${detail}` }]);
      })
      .finally(() => {
        chatSendingRef.current = false;
        setChatBusy(false);
      });
  };
  const uploadReport = async (file?: File) => {
    if (!file) return;
    let values: Report["values"] = [];
    if (file.size > 2_000_000) { setNotice("File is too large; choose a file under 2 MB."); return; }
    try {
      if (/\.(csv|txt)$/i.test(file.name)) {
        const lines = (await file.text()).split(/\r?\n/).filter(Boolean);
        values = lines.slice(1).map((line) => {
          const [label = "", value = "", unit = "", range = ""] = line.split(",").map((part) => part.trim().replace(/^["']|["']$/g, ""));
          return { label, value, unit, range };
        }).filter((item) => item.label && item.value);
      }
    } catch (error) {
      setNotice(`Could not read this file: ${(error as Error).message}`); return;
    }
    const report = { id: crypto.randomUUID(), name: file.name, kind: file.type || "Document", added: today, values };
    setReportDraft(report); setData((current) => ({ ...current, reports: [report, ...current.reports], timeline: [{ title: `Report added: ${file.name}`, date: today, type: "Report" }, ...current.timeline] }));
    setNotice(values.length ? `Added ${values.length} rows found in the file. Verify against the original.` : "File added locally; no values were extracted from it.");
  };
  const exportData = () => {
    const file = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), healthData: data }, null, 2)], { type: "application/json" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(file); link.download = "healthcopilot-data.json"; link.click(); URL.revokeObjectURL(link.href);
    setNotice("Your data export has been downloaded.");
  };
  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setAuthBusy(true); setCloudReady(false);
    const form = new FormData(event.currentTarget); const email = String(form.get("email")); const password = String(form.get("password"));
    try {
      await account(form.get("mode") === "register" ? "register" : "login", email, password);
      setToken("active"); localStorage.removeItem("hc-demo-data"); localStorage.setItem("hc-email", email);
      const stored = await loadHealthData();
      setData(Object.keys(stored).length ? { ...emptyData, ...stored } as HealthData : emptyData);
      setAccountEmail(email); setCloudReady(true); setNotice("Secure account connected. Your demo data was not copied into it.");
    } catch (error) {
      if (getToken()) { try { await endSession(); } catch { /* Preserve the original sign-in error. */ } }
      setToken(null); setAccountEmail(""); localStorage.removeItem("hc-email");
      setNotice(`Could not connect account: ${(error as Error).message}`);
    }
    finally { setAuthBusy(false); }
  };
  const logout = async () => {
    try { await endSession(); }
    catch (error) { setNotice(`Could not end the server session: ${(error as Error).message}`); return; }
    setToken(null); setCloudReady(false); setAccountEmail(""); setData(emptyData); localStorage.removeItem("hc-email"); setNotice("Signed out. This device’s health data was cleared.");
  };
  const clearData = async () => {
    if (getToken()) {
      try { await deleteHealthData(); }
      catch (error) { setNotice(`Could not delete cloud data: ${(error as Error).message}`); return; }
    }
    skipNextSync.current = true; setData({ ...emptyData }); setShowConfirm(false); setNotice("Your HealthCopilot data has been deleted.");
  };
  const measured = data.measurements.filter((item) => item.type === chartMetric).sort((a, b) => a.date.localeCompare(b.date));
  const selectedUnit = measured.at(-1)?.unit || "kg";
  const chartMeasurements = measured.filter((item) => item.unit === selectedUnit).slice(-7);
  const chartData = (["weight", "bloodPressure", "bloodGlucose", "heartRate"] as string[]).includes(chartMetric)
    ? chartMeasurements.map((item) => ({ day: item.date, value: item.value, secondary: item.secondary }))
    : chartMetric === "mood"
      ? recordedCheckIns.slice(0, 7).reverse().map((item) => ({ day: new Date(`${item.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" }), value: ({ Great: 5, Good: 4, Okay: 3, Low: 2, Stressed: 1 }[item.mood] || 3) }))
      : hasRecordedCheckins
        ? recordedCheckIns.slice(0, 7).reverse().map((item) => ({ day: new Date(`${item.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" }), sleep: item.sleep, activity: item.activity, water: item.water }))
        : sampleTrend;
  const metricLabel: Record<ChartMetric, string> = { sleep: "Sleep", activity: "Activity", water: "Hydration", mood: "Mood", weight: "Weight", bloodPressure: "Blood pressure", bloodGlucose: "Blood glucose", heartRate: "Heart rate" };
  const metricUnit: Record<ChartMetric, string> = { sleep: "hours", activity: "minutes", water: "glasses", mood: "mood scale (1–5)", weight: chartMetric === "weight" ? selectedUnit : "kg", bloodPressure: "mmHg", bloodGlucose: chartMetric === "bloodGlucose" ? selectedUnit : "mg/dL", heartRate: "bpm" };
  const isRecordedMetric = (["weight", "bloodPressure", "bloodGlucose", "heartRate"] as string[]).includes(chartMetric);
  const currentMedications = data.medications.filter((item) => !item.taken);
  const signedIn = Boolean(getToken());
  const dashboardTrend = hasRecordedCheckins
    ? recordedCheckIns.slice(0, 7).reverse().map((item) => ({ day: new Date(`${item.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" }), sleep: item.sleep }))
    : sampleTrend;

  function Dashboard() {
    return <div className="animate-in space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-[13px] font-medium text-[#88958f]">{today} <span className="mx-1 text-[#c6cfca]">·</span> {text("Your personal health space")}</p><h1 className="font-display mt-2 text-[27px] font-extrabold tracking-[-1px] text-[#1c302a] dark:text-white">{text("Good morning")}<span className="text-[#4e9b79]">, Alex</span></h1><p className="mt-1 text-[13px] text-[#83918a]">{text("A little check-in can make a big difference.")}</p></div><Button onClick={() => { setCheck(latest || initialCheckin); setCheckOpen(true); }}><Plus size={16} /> {text("Daily check-in")}</Button></div>
      <div className="flex items-center gap-2 rounded-2xl border border-[#dfede5] bg-[#eff8f2] px-4 py-3 text-xs leading-5 text-[#4b6f5c]"><Sparkles size={16} className="shrink-0 text-[#559576]" /><span><b>Demo workspace.</b> Example trends are illustrative only. Add your own information to personalize your dashboard.</span><button onClick={() => go("Privacy Center")} className="ml-auto whitespace-nowrap font-semibold underline underline-offset-2">Privacy details</button></div>
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Panel className="overflow-hidden bg-gradient-to-br from-[#eaf5ed] via-[#f8faf7] to-white p-5 sm:p-6"><div className="flex items-start justify-between"><div><Badge><Sparkles size={12} /> Today’s overview</Badge><h2 className="font-display mt-4 max-w-md text-[20px] font-bold leading-7 tracking-[-.4px] text-[#2b4438]">{latest && !latest.sample ? "You’ve made space to check in with yourself." : "Your health journey starts with one small check-in."}</h2><p className="mt-2 max-w-lg text-[13px] leading-6 text-[#73847a]">{latest && !latest.sample ? `You recorded ${latest.sleep} hours of sleep and ${latest.water} glasses of water. Small observations can help you notice patterns over time.` : latest?.sample ? `Example values only: ${latest.sleep} hours of sleep and ${latest.water} glasses of water. Add your own check-in to begin a personal timeline.` : "Log how you’re feeling today to start a personal wellness timeline. Your data stays private on this device until you choose to connect an account."}</p></div><div className="hidden rounded-[18px] bg-white/80 p-3 text-[#52916f] sm:block"><HeartPulse size={28} /></div></div><div className="mt-5 flex flex-wrap gap-2"><Button onClick={() => go("AI Copilot")} kind="secondary"><MessageCircle size={15} /> Ask AI Copilot</Button><button onClick={() => go("Health Insights")} className="inline-flex items-center gap-1 px-2 text-xs font-semibold text-[#648071]">View insights <ArrowUpRight size={13} /></button></div></Panel>
        <Panel className="p-5"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold text-[#73827b]">{text("Wellness overview")}</p><p className="mt-1 text-[11px] text-[#a0aaa5]">{latest?.sample ? "Illustrative demo values" : text("Your latest check-in")}</p></div><span className="rounded-xl bg-[#edf6f0] p-2 text-[#4b8a68]"><Activity size={17} /></span></div><div className="mt-4 grid grid-cols-2 gap-3">
          {[{ label: "Sleep", value: latest ? `${latest.sleep}h` : "—", icon: Moon }, { label: "Activity", value: latest ? `${latest.activity}m` : "—", icon: Footprints }, { label: "Water", value: latest ? `${latest.water} glasses` : "—", icon: Droplets }, { label: "Mood", value: latest?.mood || "—", icon: Smile }].map(({ label, value, icon: Icon }) => <div key={label} className="soft rounded-xl bg-[#f7f9f7] p-3"><div className="flex items-center gap-1.5 text-[11px] text-[#8a9790]"><Icon size={13} /> {label}</div><p className="mt-1 text-[15px] font-bold text-[#31463a] dark:text-white">{value}</p></div>)}
        </div></Panel>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.45fr_1fr]">
        <Panel className="p-5"><div className="mb-4 flex items-center justify-between"><div><p className="font-display font-bold text-[#304239] dark:text-white">{text("Your wellness trends")}</p><p className="mt-1 text-[11px] text-[#98a39e]">{hasRecordedCheckins ? "From your recorded check-ins" : "Illustrative sample · not personal measurements"}</p></div><button onClick={() => go("Health Insights")} aria-label="See all health insights" className="rounded-lg p-2 text-[#7e8e85] hover:bg-[#f1f5f2]"><ArrowUpRight size={16} /></button></div>
          <div className="h-[180px] w-full"><Suspense fallback={<div className="h-full animate-pulse rounded-xl bg-[#f4f7f5]" />}><TrendChart data={dashboardTrend} dataKey="sleep" label="Sleep (hours)" unit="hours" gradientId="homeTrend" compact /></Suspense></div>
        </Panel>
        <Panel className="p-5"><div className="flex items-center justify-between"><div><p className="font-display font-bold text-[#304239] dark:text-white">{text("Today’s plan")}</p><p className="mt-1 text-[11px] text-[#98a39e]">A gentle reminder, not a scorecard</p></div><CalendarDays size={17} className="text-[#8b9b91]" /></div>
          <div className="mt-4 space-y-3">{currentMedications.length ? currentMedications.slice(0, 2).map((item) => <div key={item.id} className="flex items-center gap-3 rounded-xl bg-[#fafbf9] p-3"><span className="rounded-lg bg-[#eff5eb] p-2 text-[#77925f]"><Pill size={15} /></span><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-[#40534a]">{item.name}</p><p className="mt-0.5 text-[10px] text-[#97a29c]">{item.schedule}{item.reminderTime ? ` · ${item.reminderTime}` : ""}</p></div><button onClick={() => markMedicationTaken(item.id, item.name)} aria-label={`Mark ${item.name} as taken`} className="rounded-lg p-2 text-[#599473] hover:bg-[#edf6f0]"><Check size={16} /></button></div>)
            : <div className="rounded-xl bg-[#fafbf9] p-4 text-xs leading-5 text-[#89968f]">No medications added. Your medication list stays empty until you enter one.</div>}
            <button onClick={() => go("Appointments")} className="flex w-full items-center gap-3 rounded-xl border border-[#edf0ee] p-3 text-left hover:bg-[#fafcfb]"><span className="rounded-lg bg-[#f2eff8] p-2 text-[#8074a2]"><CalendarDays size={15} /></span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-[#40534a]">{data.appointments[0]?.title || "No upcoming appointments"}</span><span className="mt-0.5 block text-[10px] text-[#97a29c]">{data.appointments[0]?.date || "Organize questions for your next visit"}</span></span><ChevronRight size={15} className="text-[#9da9a3]" /></button></div>
        </Panel>
      </div>
      <div className="grid gap-4 sm:grid-cols-2"><Panel className="flex items-center gap-4 p-4"><span className="rounded-xl bg-[#fff4e6] p-2.5 text-[#ba8a43]"><Bell size={18} /></span><div><p className="text-xs font-bold text-[#40534a]">A note about your health</p><p className="mt-1 text-[11px] leading-5 text-[#87948d]">If something concerns you, a qualified clinician can help assess your situation.</p></div></Panel><Panel className="flex items-center gap-4 p-4"><span className="rounded-xl bg-[#edf3f8] p-2.5 text-[#6885a0]"><FileText size={18} /></span><div><p className="text-xs font-bold text-[#40534a]">Recent health reports</p><p className="mt-1 text-[11px] leading-5 text-[#87948d]">{data.reports.length ? `${data.reports.length} file${data.reports.length > 1 ? "s" : ""} added · review original values` : "No reports uploaded yet."}</p></div><button onClick={() => go("Reports")} className="ml-auto text-xs font-semibold text-[#548067]">Open</button></Panel></div>
    </div>;
  }

  function Copilot() {
    return <div className="animate-in mx-auto max-w-[850px]"><Heading title={text("AI Copilot")} sub="A thoughtful place to explore health questions, not a replacement for medical care." />
      <div className="mb-4 flex gap-3 rounded-2xl border border-[#f2dfb4] bg-[#fff9ea] p-4 text-[12px] leading-5 text-[#775e32]"><CircleAlert size={17} className="mt-0.5 shrink-0 text-[#be8b35]" /><span><b>For urgent symptoms, don’t wait for a chat reply.</b> Contact local emergency services for severe or sudden warning signs. AI responses are educational and cannot diagnose or prescribe.</span></div>
      <Panel className="overflow-hidden"><div className="flex items-center justify-between border-b border-[#edf0ee] bg-[linear-gradient(135deg,#F5F9FC,#EEF9F8)] px-5 py-4"><div className="flex items-center gap-3"><span className="rounded-2xl bg-[linear-gradient(135deg,#16324F,#14B8A6)] p-2.5 text-white"><Sparkles size={18} /></span><div><p className="text-sm font-bold text-[#16324F] dark:text-white">Your conversation</p><p className="text-[11px] text-[#6B7F90]">Connected to the backend AI service when configured</p></div></div><button onClick={() => void shareText(messages.map((m) => `${m.role === "user" ? "You" : "Copilot"}: ${m.text}`).join("\n\n"))} aria-label="Share conversation summary" className="rounded-xl border border-[#dfeaf3] bg-white p-2 text-[#16324F] hover:bg-[#f7fafc]"><Copy size={15} /></button></div>
        <div aria-live="polite" className="max-h-[430px] min-h-[300px] space-y-4 overflow-y-auto bg-[#f9fbfd] p-5">{messages.map((message, index) => <div key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-[13px] leading-6 ${message.role === "user" ? "rounded-br-md bg-[linear-gradient(135deg,#16324F,#1D4E72)] text-white shadow-sm" : message.emergency ? "border border-[#f1b5a9] bg-[#fff0ed] text-[#854135]" : "rounded-bl-md border border-[#e8edf3] bg-white text-[#1E293B] shadow-sm"}`}>{message.emergency && <b className="mb-1 block">Urgent-care guidance</b>}{message.text}</div></div>)}{chatBusy && <div className="flex justify-start"><div role="status" className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-[#e8edf3] bg-white px-4 py-3 text-[13px] text-[#718178] shadow-sm"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#14B8A6]" /><span>HealthCopilot is responding…</span></div></div>}<div ref={chatEndRef} /></div>
        <div className="border-t border-[#edf0ee] p-4"><div className="mb-3 flex flex-wrap gap-2">{["Help me organize what I’m feeling", "Explain a health term", "Prepare for a doctor visit"].map((suggestion) => <button key={suggestion} type="button" onClick={() => setQuestion(suggestion)} className="rounded-full border border-[#dfeaf3] bg-[#f7fafc] px-3 py-1.5 text-[11px] text-[#59718a] transition hover:border-[#cfe6ef] hover:bg-[#effaf8]">{suggestion}</button>)}</div><form onSubmit={(event) => { event.preventDefault(); answer(question); }} className="flex items-end gap-2 rounded-2xl border border-[#dfeaf3] bg-[#f9fbfd] p-2 shadow-inner shadow-white"><textarea value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if (!question.trim() || chatBusy) return; answer(question); } }} aria-label="Ask HealthCopilot a question" placeholder="Share what’s on your mind…" rows={2} className="field max-h-28 min-h-[42px] flex-1 resize-y border-0 bg-transparent px-2 py-2 text-[13px] outline-none shadow-none" /><button type="button" title="Voice input is ready to connect to a speech service" aria-label="Voice input (not connected in demo)" onClick={() => setNotice("Voice transcription isn’t connected in this demo.")} className="mb-1 rounded-xl border border-[#dfeaf3] bg-white p-2 text-[#16324F] hover:bg-[#f3f9fb]"><Mic size={17} /></button><button type="submit" disabled={!question.trim() || chatBusy} aria-label="Send message" className="mb-1 rounded-xl bg-[linear-gradient(135deg,#16324F,#14B8A6)] p-2.5 text-white shadow-[0_12px_22px_rgba(20,184,166,0.28)] disabled:cursor-not-allowed disabled:opacity-50"><Send size={16} /></button></form></div>
      </Panel><p className="mt-3 text-center text-[10px] text-[#9aa59f]">Language: {lang} · Change in Profile · Messages are sent to the configured AI provider. Avoid sharing identifying information.</p>
    </div>;
  }

  function Insights() {
    return <div className="animate-in space-y-5"><Heading title={text("Health insights")} sub="Notice patterns in information you choose to record. Observations are not medical conclusions." />
      <div className="flex gap-3 rounded-2xl border border-[#e5eee8] bg-[#f0f7f2] p-4 text-xs leading-5 text-[#56705f]"><Eye size={17} className="mt-0.5 shrink-0" /><p><b>Only recorded wellness information is shown.</b> Blood pressure, glucose, weight, and heart-rate charts will appear only after you add your own measurements. Sample values are clearly labeled.</p></div>
      <Panel className="p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-display text-base font-bold text-[#304239] dark:text-white">{metricLabel[chartMetric]} over the last 7 days</p><p className="mt-1 text-xs text-[#95a099]">{isRecordedMetric ? chartData.length ? "From measurements you entered" : "No measurements entered" : chartMetric === "mood" ? hasRecordedCheckins ? "From your saved check-ins" : "No mood records yet" : hasRecordedCheckins ? "From your saved check-ins" : "Illustrative sample data · not personal measurements"}</p></div><div className="flex flex-wrap gap-2"><select aria-label="Choose wellness trend" value={chartMetric} onChange={(event) => setChartMetric(event.target.value as ChartMetric)} className="field min-h-10 rounded-xl border border-[#e5ebe7] bg-white px-3 text-xs text-[#53635d]">{(Object.keys(metricLabel) as ChartMetric[]).map((metric) => <option key={metric} value={metric}>{metricLabel[metric]}</option>)}</select><Button kind="secondary" onClick={() => setMeasurementOpen(true)}><Plus size={14} /> Add measurement</Button></div></div>
        <div className="mt-5 h-[290px] w-full">{chartData.length ? <Suspense fallback={<div className="h-full animate-pulse rounded-xl bg-[#f4f7f5]" />}><TrendChart data={chartData} dataKey={isRecordedMetric || chartMetric === "mood" ? "value" : chartMetric} label={metricLabel[chartMetric]} unit={metricUnit[chartMetric]} gradientId="insightTrend" secondaryKey={chartMetric === "bloodPressure" ? "secondary" : undefined} secondaryLabel="Diastolic" /></Suspense> : <Empty icon={Activity} title={`No ${metricLabel[chartMetric].toLowerCase()} data yet`} text="Only information you enter is shown here. Add a measurement to start a personal trend." />}</div>        <div className="mt-3 rounded-xl bg-[#f7f9f7] p-3 text-xs leading-5 text-[#78877f]"><b className="text-[#52665a]">Observation, not a conclusion:</b> {isRecordedMetric ? `Showing ${chartData.length} measurement${chartData.length === 1 ? "" : "s"} that you recorded. Interpretation depends on your individual circumstances.` : chartMetric === "mood" ? "Your mood selections are displayed as a simple scale for personal reflection." : hasRecordedCheckins ? `Showing your recorded ${metricLabel[chartMetric].toLowerCase()} check-ins.` : `Illustrative sample of ${metricLabel[chartMetric].toLowerCase()} only; this is not personal data.`} Patterns can have many explanations; this chart cannot assess your health.</div>
      </Panel>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[{ name: "Mood", type: "mood" as ChartMetric, icon: Smile }, { name: "Weight", type: "weight" as ChartMetric, icon: Activity }, { name: "Blood pressure", type: "bloodPressure" as ChartMetric, icon: HeartPulse }, { name: "Blood glucose", type: "bloodGlucose" as ChartMetric, icon: Droplets }, { name: "Heart rate", type: "heartRate" as ChartMetric, icon: HeartPulse }].map(({ name, type, icon: Icon }) => { const available = type === "mood" ? hasRecordedCheckins : data.measurements.some((item) => item.type === type); return <button key={name} onClick={() => setChartMetric(type)} className="surface flex items-center gap-3 rounded-[22px] border border-[#e9eeeb] bg-white p-4 text-left shadow-[0_3px_15px_rgba(21,47,38,.035)] hover:bg-[#fafcfb]"><span className="rounded-xl bg-[#f0f5f2] p-2.5 text-[#5f8b71]"><Icon size={17} /></span><span><span className="block text-xs font-semibold text-[#40534a]">{name}</span><span className="mt-1 block text-[10px] text-[#98a39d]">{available ? "Recorded data available" : "No data recorded"}</span></span></button>; })}</div>
    </div>;
  }

  function Medications() {
    const medItems = ["Morning", "Afternoon", "Evening", "As needed"];
    return <div className="animate-in"><Heading title={text("Medications")} sub="Keep track of information you enter. Always follow the instructions from your prescriber." action={<Button onClick={() => setMedOpen(true)}><Plus size={16} /> Add medication</Button>} />
      <div className="mb-5 flex gap-3 rounded-2xl border border-[#e5eee8] bg-[#f1f7f3] p-4 text-xs leading-5 text-[#526c5b]"><ShieldCheck size={17} className="mt-0.5 shrink-0" /><p><b>Your medication details are yours to manage.</b> HealthCopilot cannot prescribe, change a dose, or tell you to stop a medicine. Ask your prescriber or pharmacist about any changes.</p></div>
      {data.medications.length ? <div className="space-y-4">{medItems.map((schedule) => { const items = data.medications.filter((m) => m.schedule === schedule); return items.length ? <div key={schedule}><p className="mb-2 text-xs font-semibold text-[#78877f]">{schedule}</p><Panel className="divide-y divide-[#edf0ee] px-4">{items.map((med) => <div key={med.id} className="flex flex-wrap items-center gap-3 py-4"><span className={`rounded-xl p-2.5 ${med.taken ? "bg-[#edf6f0] text-[#649578]" : "bg-[#f5f1e8] text-[#a68853]"}`}><Pill size={18} /></span><div className="min-w-0 flex-1"><p className="text-sm font-bold text-[#35483e] dark:text-white">{med.name}</p><p className="mt-1 text-xs text-[#8a9790]">{med.reminderTime ? `Reminder time ${med.reminderTime} · ` : ""}{med.note || "No additional notes"}</p></div><Badge tone={med.taken ? "green" : "amber"}>{med.taken ? "Taken" : "Not marked"}</Badge>{!med.taken && <Button kind="secondary" onClick={() => markMedicationTaken(med.id, med.name)}><Check size={14} /> Mark taken</Button>}</div>)}</Panel></div> : null; })}</div> : <Panel className="p-6"><Empty icon={Pill} title="No medications added" text="Add medicines and schedules you already follow. This tracker will never suggest a dose." action={<Button onClick={() => setMedOpen(true)}><Plus size={15} /> Add medication</Button>} /></Panel>}
      <Panel className="mt-5 p-5"><p className="text-sm font-bold text-[#40534a]">A gentle reminder</p><p className="mt-1 text-xs leading-5 text-[#87938d]">Reminder notifications aren’t enabled in this demo. Marking a medicine “taken” is only a personal record and is not a confirmation of medical adherence.</p></Panel>
    </div>;
  }

  function Reports() {
    return <div className="animate-in"><Heading title={text("Medical reports")} sub="Review documents and organize questions for your healthcare professional." action={<Button onClick={() => fileRef.current?.click()}><Upload size={15} /> Upload report</Button>} />
      <input ref={fileRef} type="file" accept=".pdf,.csv,.txt,image/*" className="hidden" onChange={(event) => { void uploadReport(event.target.files?.[0]); event.currentTarget.value = ""; }} />
      <div className="mb-5 flex gap-3 rounded-2xl border border-[#e5eee8] bg-[#f1f7f3] p-4 text-xs leading-5 text-[#526c5b]"><LockKeyhole size={17} className="mt-0.5 shrink-0" /><p><b>Files stay on this device in this demo.</b> We do not upload or analyze documents. Text/CSV rows are displayed exactly as provided; PDF/image values are not extracted. Always check the original report and discuss interpretation with a qualified professional.</p></div>
      {reportDraft && <Panel className="mb-4 p-5"><div className="flex items-center justify-between"><div><p className="text-sm font-bold text-[#40534a]">{reportDraft.name}</p><p className="mt-1 text-[11px] text-[#919d96]">Added {reportDraft.added} · {reportDraft.kind}</p></div><Badge tone="gray">Local only</Badge></div>{reportDraft.values.length > 0 ? <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-[#7d8b83]"><tr><th className="p-2">Measurement</th><th className="p-2">Original value</th><th className="p-2">Unit</th><th className="p-2">Reference range</th><th className="p-2">What it generally represents</th></tr></thead><tbody>{reportDraft.values.map((value, index) => <tr key={index} className="border-t border-[#edf0ee] text-[#465a50]"><td className="p-2">{value.label}</td><td className="p-2">{value.value}</td><td className="p-2">{value.unit || "Not stated"}</td><td className="p-2">{value.range || "Not stated"}</td><td className="min-w-52 p-2 text-[#78877f]">{explainTest(value.label)}</td></tr>)}</tbody></table><p className="mt-3 text-[11px] leading-5 text-[#8b9790]">Values and ranges are shown directly from the file. Explanations are general and do not interpret results; never treat a missing range as normal. Meaning depends on individual circumstances and should be discussed with a qualified professional.</p></div> : <p className="mt-3 text-xs leading-5 text-[#87938d]">No values were extracted. This demo does not read PDF or image content. Check your original document for exact values, units, and ranges.</p>}</Panel>}
      {data.reports.length ? <div className="space-y-3">{data.reports.filter((report) => report.id !== reportDraft?.id).map((report) => <button key={report.id} onClick={() => setReportDraft(report)} className="surface flex w-full items-center gap-3 rounded-[22px] border border-[#e9eeeb] bg-white p-4 text-left shadow-[0_3px_15px_rgba(21,47,38,.035)] hover:bg-[#fafcfb]"><span className="rounded-xl bg-[#edf3f8] p-2.5 text-[#6885a0]"><FileText size={18} /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-[#40534a]">{report.name}</span><span className="mt-1 block text-[11px] text-[#94a099]">{report.added} · {report.values.length ? `${report.values.length} supplied rows` : "No values extracted"}</span></span><Badge tone="gray">Local only</Badge></button>)}</div> : <Panel className="p-6"><Empty icon={FileText} title="No reports yet" text="Add a PDF, image, CSV, or text file to keep a local reference. No medical values will be invented." action={<Button kind="secondary" onClick={() => fileRef.current?.click()}><Upload size={15} /> Choose a file</Button>} /></Panel>}
    </div>;
  }

  function Visits() {
    const upcoming = data.appointments;
    return <div className="animate-in"><Heading title={text("Appointment preparation")} sub="Make the most of your visit with an editable summary to bring or share." action={<Button onClick={() => { const appointment = { id: crypto.randomUUID(), title: summary.concern || "Doctor visit preparation", ...visitDetails, questions: summary.questions.split(/\n+/).filter(Boolean), summary: JSON.stringify(summary) }; setData((d) => ({ ...d, appointments: [...d.appointments, appointment], timeline: [{ title: "Appointment summary prepared", date: visitDetails.date || today, type: "Appointment" }, ...d.timeline] })); setNotice("Appointment summary saved for review."); }}><Plus size={15} /> Save visit summary</Button>} />
      <Panel className="mb-5 p-5"><div className="flex gap-3"><span className="rounded-xl bg-[#f0eff8] p-2.5 text-[#8074a2]"><ClipboardList size={18} /></span><div><p className="text-sm font-bold text-[#40534a]">Visit summary builder</p><p className="mt-1 text-xs leading-5 text-[#87938d]">Only include information you choose. Review and edit everything before sharing it with a clinician.</p></div></div><div className="mt-5 grid gap-3 sm:grid-cols-2">{Object.entries({ concern: "Main concern", timeline: "Timeline", symptoms: "Symptoms you want to discuss", measurements: "Relevant measurements (your entries)", medications: "Current medications (your entries)", questions: "Questions for your clinician", observations: "Important observations" }).map(([key, label]) => <label key={key} className="grid gap-1.5 text-xs font-semibold text-[#53635d]">{label}<textarea value={summary[key as keyof typeof summary]} onChange={(e) => setSummary((s) => ({ ...s, [key]: e.target.value }))} rows={key === "concern" ? 2 : 3} placeholder="Add details, or leave blank…" className="field resize-y rounded-xl border border-[#e5ebe7] bg-[#fbfcfb] p-3 text-[13px] font-normal text-[#40534a] placeholder:text-[#a4aea9]" /></label>)}</div><div className="mt-4 grid gap-3 sm:grid-cols-3"><Field label="Appointment date" type="date" value={visitDetails.date} onChange={(e) => setVisitDetails({ ...visitDetails, date: e.target.value })} /><Field label="Time (optional)" type="time" value={visitDetails.time} onChange={(e) => setVisitDetails({ ...visitDetails, time: e.target.value })} /><Field label="Clinician (optional)" value={visitDetails.clinician} onChange={(e) => setVisitDetails({ ...visitDetails, clinician: e.target.value })} placeholder="Name or specialty" /></div><div className="mt-4 flex flex-wrap gap-2"><Button kind="secondary" onClick={addVisitContext}><Plus size={14} /> Add my health context</Button><Button kind="secondary" onClick={() => void shareText(Object.entries({ ...summary, appointmentDate: visitDetails.date, appointmentTime: visitDetails.time, clinician: visitDetails.clinician }).map(([k, v]) => `${k[0].toUpperCase()}${k.slice(1)}: ${v || "—"}`).join("\n\n"))}><Copy size={14} /> Share summary</Button><Button kind="plain" onClick={() => setSummary({ concern: "", timeline: "", symptoms: "", measurements: "", medications: "", questions: "", observations: "" })}>Clear draft</Button></div></Panel>
      {upcoming.length > 0 && <><Heading title="Your visit notes" sub="Details saved on this device." />{upcoming.map((visit) => <Panel key={visit.id} className="mb-3 flex items-center gap-3 p-4"><CalendarDays size={18} className="text-[#7b8a81]" /><div className="flex-1"><p className="text-sm font-semibold text-[#40534a]">{visit.title}</p><p className="mt-1 text-xs text-[#94a099]">{visit.date || "Date not added"} {visit.time && `· ${visit.time}`} {visit.clinician && `· ${visit.clinician}`}</p></div><button onClick={() => setData((d) => ({ ...d, appointments: d.appointments.filter((a) => a.id !== visit.id) }))} aria-label={`Remove ${visit.title}`} className="p-2 text-[#99a49e] hover:text-red-500"><X size={16} /></button></Panel>)}</>}
    </div>;
  }

  function Profile() {
    return <div className="animate-in max-w-[850px]"><Heading title={text("Your profile")} sub="Personalize how HealthCopilot feels and works for you." />
      <Panel className="mb-4 flex flex-wrap items-center gap-4 p-5"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#d8ece0] to-[#eff6f0] text-xl font-bold text-[#4e8464]">A</div><div className="min-w-[200px] flex-1"><p className="font-display text-base font-bold text-[#31463a] dark:text-white">Alex Morgan</p><p className="mt-1 text-xs text-[#929f98]">{accountEmail || "Demo profile · health information stays on this device"}</p></div>{signedIn ? <Badge><Cloud size={12} /> Secure account connected</Badge> : <Badge tone="gray">Local demo</Badge>}</Panel>
      <Panel className="divide-y divide-[#edf0ee] px-5"><div className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="text-sm font-semibold text-[#40534a]">App language</p><p className="mt-1 text-xs text-[#929e98]">Language support is ready to expand across the product.</p></div><label className="sr-only" htmlFor="language-select">Choose your language</label><select id="language-select" value={lang} onChange={(e) => setLang(e.target.value as Lang)} className="field min-h-10 rounded-xl border border-[#e5ebe7] bg-white px-3 text-xs"><option>English</option><option>తెలుగు</option><option>हिन्दी</option></select></div><div className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="text-sm font-semibold text-[#40534a]">Appearance</p><p className="mt-1 text-xs text-[#929e98]">Choose a comfortable color theme.</p></div><Button kind="secondary" onClick={() => setDark(!dark)}>{dark ? <Sun size={15} /> : <Moon size={15} />}{dark ? "Light mode" : "Dark mode"}</Button></div></Panel>
      <Panel className="mt-4 p-5"><p className="text-sm font-semibold text-[#40534a]">Your health timeline</p>{data.timeline.length ? <div className="mt-4 space-y-3">{data.timeline.slice(0, 8).map((item, index) => <div key={index} className="flex items-center gap-3 text-xs"><span className="h-2 w-2 rounded-full bg-[#6fa987]" /><span className="flex-1 text-[#56675e]">{item.title}</span><span className="text-[#9aa59f]">{item.date}</span></div>)}</div> : <p className="mt-2 text-xs text-[#929e98]">Check-ins, reports, and medication updates you add will appear here.</p>}</Panel>
    </div>;
  }

  function Privacy() {
    return <div className="animate-in max-w-[850px]"><Heading title={text("Privacy center")} sub="Understand what stays on this device and what gets synced." />
      <div className="mb-4 flex gap-3 rounded-2xl border border-[#dcebe0] bg-[#f0f7f2] p-4 text-xs leading-5 text-[#526d5b]"><ShieldCheck size={18} className="mt-0.5 shrink-0" /><p><b>{signedIn ? "Your account data is stored in your private MongoDB account." : "Demo data stays in this browser on this device."}</b> {signedIn ? "Authenticated requests are user-scoped. Avoid using real health information until your deployment has been security and privacy reviewed." : "Nothing is sent to the backend until you create an account or sign in."}</p></div>
      <Panel className="mb-4 p-5"><div className="flex items-start gap-3"><span className="rounded-xl bg-[#edf3f8] p-2 text-[#69869d]"><Languages size={17} /></span><div><p className="text-sm font-bold text-[#40534a]">Data use, at a glance</p><ul className="mt-3 space-y-2 text-xs leading-5 text-[#76847c]"><li>• Check-ins, medications, reports, and appointment notes are used to display your personal workspace.</li><li>• In local demo mode they are saved in browser storage; signing out clears this device’s health data.</li><li>• When signed in, your workspace data is synced to your account. Passwords are stored as Argon2 hashes.</li><li>• Messages you submit in AI Copilot are sent to the configured AI provider through the backend. Avoid identifying information; chat history stays in this browser session.</li><li>• Use encrypted HTTPS, secrets management, backups, and a compliance review before storing real health information.</li></ul></div></div></Panel>
      <Panel className="mb-4 divide-y divide-[#edf0ee] px-5"><div className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="text-sm font-semibold text-[#40534a]">Export your health data</p><p className="mt-1 text-xs text-[#929e98]">Download a JSON copy of the information in this workspace.</p></div><Button kind="secondary" onClick={exportData}><ArrowDownToLine size={15} /> Export</Button></div><div className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="text-sm font-semibold text-[#40534a]">AI personalization consent</p><p className="mt-1 text-xs text-[#929e98]">This preference is saved locally. Chat messages are sent to the configured AI provider when you submit a message.</p></div><button role="switch" aria-checked={aiConsent} onClick={() => { const next = !aiConsent; setAiConsent(next); localStorage.setItem("hc-ai-consent", String(next)); setNotice(next ? "Preference saved." : "AI personalization preference turned off."); }} className={`relative h-6 w-11 rounded-full transition ${aiConsent ? "bg-[#4b936d]" : "bg-[#d8dfda]"}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${aiConsent ? "left-6" : "left-1"}`} /></button></div><div className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="text-sm font-semibold text-[#40534a]">Account security</p><p className="mt-1 text-xs text-[#929e98]">{signedIn ? `Signed in as ${accountEmail} · session expires after 8 hours` : "Optional account sync uses protected, authenticated API requests."}</p></div>{signedIn ? <Button kind="plain" onClick={() => void logout()}><LogOut size={14} /> Sign out</Button> : <span className="text-xs text-[#9aa59f]">Not connected</span>}</div></Panel>
      <Panel className="mb-4 p-5"><p className="text-sm font-bold text-[#40534a]">Connect a private account</p><p className="mt-1 text-xs leading-5 text-[#87938d]">Register or sign in to sync health data with your configured FastAPI and MongoDB service. Use a unique password with at least 12 characters. Local demo data is never copied into an account.</p>{!signedIn && <form onSubmit={(event) => void login(event)} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end"><Field label="Email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" /><Field label="Password · 12+ characters" name="password" type="password" autoComplete="new-password" required minLength={12} /><input type="hidden" name="mode" value="register" /><Button type="submit" disabled={authBusy}><LockKeyhole size={14} /> {authBusy ? "Connecting…" : "Create account"}</Button><button type="button" disabled={authBusy} onClick={(event) => { const form = event.currentTarget.form; if (form) { const mode = form.elements.namedItem("mode") as HTMLInputElement; mode.value = "login"; form.requestSubmit(); } }} className="min-h-10 px-2 text-xs font-semibold text-[#47735a]">Sign in</button></form>}</Panel>
      <Panel className="border-[#f1dedb] p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-bold text-[#92564d]">Delete your health data</p><p className="mt-1 text-xs text-[#9a817d]">Remove all saved check-ins, reports, medications, and appointment notes.</p></div><Button kind="danger" onClick={() => setShowConfirm(true)}><Trash2 size={14} /> Delete data</Button></div></Panel>
    </div>;
  }

  function Body() {
    switch (page) {
      case "Home": return <Dashboard />;
      case "AI Copilot": return <Copilot />;
      case "Health Insights": return <Insights />;
      case "Medications": return <Medications />;
      case "Reports": return <Reports />;
      case "Appointments": return <Visits />;
      case "Profile": return <Profile />;
      case "Privacy Center": return <Privacy />;
    }
  }

  return <div className="page-bg min-h-screen bg-[#f7f8fa]">
    <aside className="surface fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-[#e9eeeb] bg-white px-4 py-6 lg:flex">
      <button onClick={() => go("Home")} className="flex items-center gap-3 px-2 text-left"><span className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-[linear-gradient(135deg,#16324F,#14B8A6)] text-white shadow-[0_12px_26px_rgba(22,50,79,0.25)]"><HealthLogoMark className="h-8 w-8" /></span><span><span className="font-display block text-[16px] font-extrabold tracking-[-.45px] text-[#16324F] dark:text-white">Health<span className="text-[#14B8A6]">Copilot</span></span><span className="block text-[10px] text-[#6B7F90]">Your health, in context</span></span></button>
      <div className="mt-9 space-y-1">{nav.map(({ page: target, icon: Icon }, index) => <button key={target} onClick={() => go(target)} className={`nav-item ${page === target ? "nav-active" : "text-[#5B7388] hover:bg-[#f0f7fb]"} group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-[13px] font-semibold transition`}><Icon size={17} strokeWidth={page === target ? 2.2 : 1.8} /><span className="flex-1">{pageNames[index]}</span>{target === "AI Copilot" && <span className="h-1.5 w-1.5 rounded-full bg-[#14B8A6]" />}</button>)}</div>
      <div className="mt-auto rounded-2xl bg-gradient-to-br from-[#edf6ef] to-[#f8faf7] p-4"><div className="flex items-center gap-2 text-[#55906d]"><CircleHelp size={16} /><span className="text-xs font-semibold">Need a human?</span></div><p className="mt-2 text-[11px] leading-5 text-[#83948a]">A qualified healthcare professional can provide personal medical advice.</p><button onClick={() => go("Appointments")} className="mt-2 text-[11px] font-bold text-[#44785b]">Prepare for a visit <ArrowUpRight size={12} className="inline" /></button></div>
      <button onClick={() => go("Profile")} className="mt-4 flex items-center gap-3 rounded-xl p-2 text-left hover:bg-[#f7f9f7]"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e5eee8] text-xs font-bold text-[#578067]">AM</span><span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-[#42544b]">Alex Morgan</span><span className="block truncate text-[10px] text-[#98a39d]">{signedIn ? accountEmail : "Personal workspace"}</span></span><MoreHorizontal size={17} className="text-[#9ba69f]" /></button>
    </aside>
    <div className="lg:pl-[248px]">
      <header className="surface sticky top-0 z-20 flex h-[78px] items-center justify-between border-b border-[#e9eef4] bg-white/90 px-4 backdrop-blur-xl sm:px-7 lg:px-9">
        <div className="flex items-center gap-3 lg:hidden"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#16324F,#14B8A6)] text-white"><HealthLogoMark className="h-7 w-7" /></span><span className="font-display text-sm font-extrabold text-[#16324F] dark:text-white">Health<span className="text-[#14B8A6]">Copilot</span></span></div>
        <div className="hidden text-xs text-[#678097] lg:block">Your personal health companion <span className="mx-1.5 text-[#c9d6df]">/</span><span className="font-semibold text-[#16324F]">{text(page)}</span></div>

        <div className="hidden flex-1 items-center justify-end gap-3 md:flex">
          <label className="flex w-full max-w-[420px] items-center gap-2 rounded-2xl border border-[#e6edf4] bg-[#f5f9fc] px-3 py-2.5 text-[#6f8194] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
            <Search size={15} />
            <input aria-label="Search health dashboard" placeholder="Search health insights, appointments, reports…" className="w-full border-0 bg-transparent text-[12px] text-[#1E293B] placeholder:text-[#8B9AAA] outline-none" />
          </label>
          <button aria-label="Notifications" className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#e6edf4] bg-[#f7fafc] text-[#16324F] transition hover:-translate-y-0.5 hover:bg-[#edf8f7]"><Bell size={16} /></button>
          <button className="flex items-center gap-2 rounded-2xl border border-[#e6edf4] bg-[#f7fafc] px-2.5 py-2 text-xs text-[#16324F]" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen}>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#16324F,#14B8A6)] text-[10px] font-bold text-white">AM</span>
            <span className="hidden sm:block">{signedIn ? "Private account" : "AI not configured"}</span>
            <ChevronDown size={13} />
          </button>
        </div>

        <button className="flex items-center gap-2 rounded-xl border border-[#e9eeeb] bg-[#f7fafc] px-3 py-2 text-xs text-[#748279] md:hidden" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen}><span className="h-2 w-2 rounded-full bg-[#14B8A6]" /> {signedIn ? "Private" : "AI off"} <ChevronDown size={13} /></button>
        {menuOpen && <div className="absolute right-4 top-[58px] z-40 w-48 rounded-2xl border border-[#e7ecf3] bg-white p-2 shadow-[0_18px_30px_rgba(15,23,42,0.12)]"><button onClick={() => go("Privacy Center")} className="flex w-full items-center gap-2 rounded-xl p-2.5 text-left text-xs text-[#607168] hover:bg-[#f5f9fc]"><ShieldCheck size={14} /> Privacy settings</button><button onClick={() => { setDark(!dark); setMenuOpen(false); }} className="flex w-full items-center gap-2 rounded-xl p-2.5 text-left text-xs text-[#607168] hover:bg-[#f5f9fc]">{dark ? <Sun size={14} /> : <Moon size={14} />} {dark ? "Light theme" : "Dark theme"}</button><button onClick={() => { go("Profile"); setMenuOpen(false); }} className="flex w-full items-center gap-2 rounded-xl p-2.5 text-left text-xs text-[#607168] hover:bg-[#f5f9fc]"><Languages size={14} /> Language</button></div>}
      </header>
      <main className="mx-auto max-w-[1360px] px-4 pb-24 pt-7 sm:px-7 sm:pt-8 lg:px-9 lg:pb-10">
        {booting ? <Panel className="mx-auto flex max-w-md items-center justify-center gap-3 p-8 text-sm text-[#7f8c84]"><span className="h-4 w-4 animate-spin rounded-full border-2 border-[#d7e5db] border-t-[#4b8b68]" /> Connecting securely…</Panel> : <Body />}
      </main>
    </div>
    {mobileMore && <div className="surface fixed bottom-[76px] right-3 z-40 grid w-56 gap-1 rounded-2xl border border-[#e9eeeb] bg-white p-2 shadow-xl lg:hidden">{nav.slice(4).map(({ page: target, icon: Icon }) => <button key={target} onClick={() => go(target)} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-left text-xs ${page === target ? "bg-[#edf6ef] text-[#347454]" : "text-[#64756c] hover:bg-[#f7f9f7]"}`}><Icon size={16} />{text(target)}</button>)}</div>}
    <nav aria-label="Main navigation" className="surface fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-[#e8eeea] bg-white/95 px-1 pb-[env(safe-area-inset-bottom)] pt-1 backdrop-blur-lg lg:hidden">{nav.slice(0, 4).map(({ page: target, icon: Icon }) => <button key={target} onClick={() => go(target)} aria-current={page === target ? "page" : undefined} className={`nav-item ${page === target ? "nav-active text-[#347454]" : "text-[#93a098]"} flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1 text-[10px] font-medium`}><Icon size={17} /><span className="max-w-full truncate">{text(target)}</span></button>)}<button onClick={() => setMobileMore(!mobileMore)} aria-expanded={mobileMore} className={`${nav.slice(4).some((item) => item.page === page) ? "nav-active text-[#347454]" : "text-[#93a098]"} flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1 text-[10px] font-medium`}><MoreHorizontal size={18} /><span>More</span></button></nav>
    {welcome && !booting && <div role="dialog" aria-modal="true" aria-labelledby="welcome-title" className="fixed inset-0 z-[55] flex items-center justify-center bg-[#15231dcc] p-4 backdrop-blur-sm"><Panel className="animate-in w-full max-w-md p-6 sm:p-7"><span className="inline-flex rounded-2xl bg-[#eaf5ed] p-3 text-[#438266]"><HeartPulse size={23} /></span><h2 id="welcome-title" className="font-display mt-4 text-xl font-extrabold text-[#263d32]">Welcome to HealthCopilot</h2><p className="mt-2 text-sm leading-6 text-[#78867f]">A calmer way to organize wellness notes, prepare for appointments, and understand general health information.</p><div className="mt-4 rounded-xl bg-[#fff8e8] p-3 text-xs leading-5 text-[#806638]"><b>Before you begin:</b> This demo is not a doctor, does not diagnose or prescribe, and cannot replace professional care. Example check-in values are illustrative only. For emergency symptoms, contact local emergency services.</div><label className="mt-4 flex items-center gap-2 text-xs text-[#697970]"><Languages size={15} /><span>Choose language</span><select value={lang} onChange={(e) => setLang(e.target.value as Lang)} className="field ml-auto min-h-9 rounded-lg border border-[#e5ebe7] bg-white px-2">{["English", "తెలుగు", "हिन्दी"].map((value) => <option key={value}>{value}</option>)}</select></label><div className="mt-5 grid gap-2"><Button onClick={() => { localStorage.setItem("hc-onboarded", "true"); setWelcome(false); }}><Check size={15} /> Explore the demo</Button><button onClick={() => { setData(emptyData); localStorage.setItem("hc-onboarded", "true"); setWelcome(false); }} className="min-h-10 rounded-xl border border-[#e5ebe7] text-xs font-semibold text-[#64766b] hover:bg-[#f7faf8]">Start with a blank workspace</button></div></Panel></div>}
    {checkOpen && <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#15231dcc] p-3 backdrop-blur-sm sm:items-center"><Panel className="animate-in w-full max-w-lg p-5 sm:p-6"><div className="mb-5 flex items-start justify-between"><div><p className="font-display text-lg font-bold text-[#304239] dark:text-white">Daily check-in</p><p className="mt-1 text-xs text-[#89968f]">A personal snapshot, not a clinical assessment.</p></div><button onClick={() => setCheckOpen(false)} aria-label="Close check-in" className="rounded-lg p-2 text-[#839189] hover:bg-[#f4f6f4]"><X size={17} /></button></div><div className="grid grid-cols-2 gap-3"><label className="grid gap-1.5 text-xs font-semibold text-[#53635d]">Mood<select value={check.mood} onChange={(e) => setCheck({ ...check, mood: e.target.value })} className="field min-h-11 rounded-xl border border-[#e5ebe7] bg-white px-3 text-sm">{["Great", "Good", "Okay", "Low", "Stressed"].map((m) => <option key={m}>{m}</option>)}</select></label><Field label="Sleep (hours)" type="number" min="0" max="24" step=".5" value={check.sleep} onChange={(e) => setCheck({ ...check, sleep: Number(e.target.value) })} /><label className="grid gap-1.5 text-xs font-semibold text-[#53635d]">Energy · 1–5<input type="range" min="1" max="5" value={check.energy} onChange={(e) => setCheck({ ...check, energy: Number(e.target.value) })} className="mt-3 accent-[#438264]" /></label><label className="grid gap-1.5 text-xs font-semibold text-[#53635d]">Stress · 1–5<input type="range" min="1" max="5" value={check.stress} onChange={(e) => setCheck({ ...check, stress: Number(e.target.value) })} className="mt-3 accent-[#438264]" /></label><Field label="Activity (minutes)" type="number" min="0" value={check.activity} onChange={(e) => setCheck({ ...check, activity: Number(e.target.value) })} /><Field label="Water (glasses)" type="number" min="0" value={check.water} onChange={(e) => setCheck({ ...check, water: Number(e.target.value) })} /></div><label className="mt-3 grid gap-1.5 text-xs font-semibold text-[#53635d]">Notes<textarea value={check.notes} onChange={(e) => setCheck({ ...check, notes: e.target.value })} rows={2} placeholder="Anything you’d like to remember?" className="field rounded-xl border border-[#e5ebe7] bg-[#fbfcfb] p-3 text-sm font-normal" /></label><div className="mt-5 flex justify-end gap-2"><Button kind="secondary" onClick={() => setCheckOpen(false)}>Cancel</Button><Button onClick={saveCheckin}><Check size={15} /> Save check-in</Button></div></Panel></div>}
    {medOpen && <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#15231dcc] p-3 backdrop-blur-sm sm:items-center"><Panel className="animate-in w-full max-w-md p-5"><div className="mb-5 flex justify-between"><div><p className="font-display text-lg font-bold text-[#304239] dark:text-white">Add medication</p><p className="mt-1 text-xs text-[#89968f]">Enter details exactly as prescribed.</p></div><button onClick={() => setMedOpen(false)} aria-label="Close medication form"><X size={17} /></button></div><form onSubmit={addMedication} className="space-y-3"><Field label="Medication name" required value={medDraft.name} onChange={(e) => setMedDraft({ ...medDraft, name: e.target.value })} placeholder="Enter the name on your label" /><label className="grid gap-1.5 text-xs font-semibold text-[#53635d]">Schedule<select value={medDraft.schedule} onChange={(e) => setMedDraft({ ...medDraft, schedule: e.target.value })} className="field min-h-11 rounded-xl border border-[#e5ebe7] bg-white px-3 text-sm">{["Morning", "Afternoon", "Evening", "As needed"].map((v) => <option key={v}>{v}</option>)}</select></label><Field label="Reminder time (optional; notifications are not enabled)" type="time" value={medDraft.time} onChange={(e) => setMedDraft({ ...medDraft, time: e.target.value })} /><Field label="Personal note (optional)" value={medDraft.note} onChange={(e) => setMedDraft({ ...medDraft, note: e.target.value })} placeholder="Notes from your clinician" /><div className="flex justify-end gap-2 pt-2"><Button kind="secondary" onClick={() => setMedOpen(false)}>Cancel</Button><Button type="submit"><Plus size={15} /> Add to list</Button></div></form></Panel></div>}
    {measurementOpen && <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#15231dcc] p-3 backdrop-blur-sm sm:items-center"><Panel className="animate-in w-full max-w-md p-5"><div className="mb-4 flex items-start justify-between"><div><p className="font-display text-lg font-bold text-[#304239] dark:text-white">Record a measurement</p><p className="mt-1 text-xs text-[#89968f]">Manual record only. No ranges or medical conclusions are generated.</p></div><button onClick={() => setMeasurementOpen(false)} aria-label="Close measurement form"><X size={17} /></button></div><form onSubmit={addMeasurement} className="space-y-3"><label className="grid gap-1.5 text-xs font-semibold text-[#53635d]">Measurement<select value={measurementDraft.type} onChange={(event) => { const type = event.target.value as MeasurementKind; setMeasurementDraft({ ...measurementDraft, type, unit: type === "weight" ? "kg" : type === "bloodGlucose" ? "mg/dL" : type === "heartRate" ? "bpm" : "mmHg" }); }} className="field min-h-11 rounded-xl border border-[#e5ebe7] bg-white px-3 text-sm"><option value="weight">Weight</option><option value="bloodPressure">Blood pressure</option><option value="bloodGlucose">Blood glucose</option><option value="heartRate">Heart rate</option></select></label>{measurementDraft.type === "bloodPressure" ? <div className="grid grid-cols-2 gap-3"><Field label="Systolic (mmHg)" type="number" min="1" required value={measurementDraft.value} onChange={(e) => setMeasurementDraft({ ...measurementDraft, value: e.target.value })} /><Field label="Diastolic (mmHg)" type="number" min="1" required value={measurementDraft.secondary} onChange={(e) => setMeasurementDraft({ ...measurementDraft, secondary: e.target.value })} /></div> : <div className="grid grid-cols-[1fr_auto] items-end gap-3"><Field label={metricLabel[measurementDraft.type]} type="number" min="0" step="any" required value={measurementDraft.value} onChange={(e) => setMeasurementDraft({ ...measurementDraft, value: e.target.value })} />{measurementDraft.type === "weight" || measurementDraft.type === "bloodGlucose" ? <label className="grid gap-1.5 text-xs font-semibold text-[#53635d]">Unit<select value={measurementDraft.unit} onChange={(e) => setMeasurementDraft({ ...measurementDraft, unit: e.target.value })} className="field min-h-11 rounded-xl border border-[#e5ebe7] bg-white px-3 text-sm">{(measurementDraft.type === "weight" ? ["kg", "lb"] : ["mg/dL", "mmol/L"]).map((unit) => <option key={unit}>{unit}</option>)}</select></label> : <span className="pb-3 text-xs text-[#718078]">{measurementDraft.unit}</span>}</div>}<Field label="Date recorded" type="date" required value={measurementDraft.date} onChange={(e) => setMeasurementDraft({ ...measurementDraft, date: e.target.value })} /><div className="flex justify-end gap-2 pt-2"><Button kind="secondary" onClick={() => setMeasurementOpen(false)}>Cancel</Button><Button type="submit"><Plus size={15} /> Save measurement</Button></div></form></Panel></div>}
    {showConfirm && <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="fixed inset-0 z-[60] flex items-center justify-center bg-[#15231dcc] p-4 backdrop-blur-sm"><Panel className="w-full max-w-sm p-5"><span className="mb-3 inline-flex rounded-xl bg-[#fff0ed] p-2.5 text-[#ad5d50]"><Trash2 size={18} /></span><h2 id="confirm-title" className="font-display text-base font-bold text-[#394a40]">Delete all health data?</h2><p className="mt-2 text-xs leading-5 text-[#849189]">This permanently removes your saved check-ins, reports, medications, and appointment notes. This can’t be undone.</p><div className="mt-5 flex justify-end gap-2"><Button kind="secondary" onClick={() => setShowConfirm(false)}>Cancel</Button><Button kind="danger" onClick={() => void clearData()}>Delete data</Button></div></Panel></div>}
    {notice && <div role={/could not|issue|failed/i.test(notice) ? "alert" : "status"} className={`animate-in fixed bottom-[82px] left-1/2 z-[70] flex max-w-[90vw] -translate-x-1/2 items-center gap-2 rounded-xl px-4 py-3 text-xs font-medium shadow-lg lg:bottom-6 ${/could not|issue|failed/i.test(notice) ? "bg-[#8c4138] text-white" : "bg-[#263d32] text-white"}`}>{/could not|issue|failed/i.test(notice) ? <CircleAlert size={15} className="shrink-0 text-[#ffd3ca]" /> : <CheckCircle2 size={15} className="shrink-0 text-[#a8d6b5]" />}{notice}<button onClick={() => setNotice("")} aria-label="Dismiss notification" className="ml-1"><X size={14} /></button></div>}
  </div>;
}
