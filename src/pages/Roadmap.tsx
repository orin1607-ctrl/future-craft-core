import { Map, CheckCircle2, Clock, Calendar, Rocket } from 'lucide-react';

const currentVersion = '3.0.0';
const releaseDate = '2026-03-08';

interface RoadmapPhase {
  phase: string;
  title: string;
  status: 'done' | 'current' | 'planned';
  items: { name: string; done: boolean }[];
}

const roadmap: RoadmapPhase[] = [
  {
    phase: 'שלב 1', title: 'תשתית ואימות', status: 'done',
    items: [
      { name: 'מסך התחברות עם הפרדת הרשאות', done: true },
      { name: 'חיבור Lovable Cloud (DB)', done: true },
      { name: 'מערכת אימות עם 3 רמות הרשאה', done: true },
      { name: 'הפרדת נתונים לפי חברה (Multi-Tenant)', done: true },
      { name: 'RLS מלא על כל הטבלאות', done: true },
      { name: 'עיצוב Mobile-First + RTL', done: true },
    ],
  },
  {
    phase: 'שלב 2', title: 'מודולים ראשיים', status: 'done',
    items: [
      { name: 'דשבורד מנהל עם סטטיסטיקות וגרפים חיים', done: true },
      { name: 'ניהול רכבים מלא - CRUD + תוקף מסמכים', done: true },
      { name: 'ניהול נהגים מלא - CRUD + רישיונות', done: true },
      { name: 'ניהול לקוחות - CRUD מ-DB', done: true },
      { name: 'ניהול מסלולים - CRUD מ-DB', done: true },
      { name: 'דיווח ומעקב תקלות - עריכה וסטטוס', done: true },
      { name: 'דיווח תאונות - עריכה וסטטוס', done: true },
      { name: 'ניהול הוצאות - קטגוריות וסיכומים', done: true },
      { name: 'שירותים ותחזוקה', done: true },
      { name: 'טופס החלפת רכב עם GPS', done: true },
      { name: 'הצמדת רכב-נהג', done: true },
      { name: 'היסטוריה - ציר זמן מאוחד', done: true },
    ],
  },
  {
    phase: 'שלב 3', title: 'מודולים מתקדמים', status: 'done',
    items: [
      { name: 'עמוד התראות חכם - תוקף + תקלות + טיפולים', done: true },
      { name: 'שירותי חירום 24/7 עם GPS', done: true },
      { name: 'סידור עבודה - ניהול משימות + אישורים', done: true },
      { name: 'דוחות כספיים ותפעוליים חיים', done: true },
      { name: 'ייצוא CSV בכל הרשימות', done: true },
      { name: 'עמוד מסמכים - מבנה קטגוריות', done: true },
      { name: 'הגדרות - פרופיל, סיסמה, תצוגה', done: true },
      { name: 'העלאת קבצים ותמונות', done: true },
      { name: 'דשבורד נהג מותאם', done: true },
      { name: 'ניהול ספקים', done: true },
      { name: 'ניהול מלווים', done: true },
      { name: 'צ\'אט פנימי + צ\'אט תקלות', done: true },
      { name: 'מנגנון אישורים והפניות', done: true },
      { name: 'Audit Log (עדכוני מערכת)', done: true },
      { name: 'ניהול הרשאות', done: true },
      { name: 'תבניות מייל אוטומטיות', done: true },
      { name: 'מנויים וחיוב', done: true },
    ],
  },
  {
    phase: 'שלב 4', title: 'דוחות מתקדמים ואינטגרציות', status: 'current',
    items: [
      { name: 'דוח לפי רכב/נהג/תקופה', done: true },
      { name: 'שיתוף דוח ב-WhatsApp ומייל', done: true },
      { name: 'ייצוא PDF', done: false },
      { name: 'PWA - התקנה על מכשיר', done: false },
      { name: 'חיבור מערכת הנהלת חשבונות', done: false },
      { name: 'עבודה אופליין + סנכרון', done: false },
    ],
  },
];

export default function Roadmap() {
  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-3 mb-2">
        <Map size={32} className="text-primary" />
        <h1 className="page-header mb-0">תוכנית פיתוח - דליה</h1>
      </div>
      <div className="flex items-center gap-4 mb-8 text-muted-foreground">
        <span className="flex items-center gap-1"><Calendar size={16} /> {releaseDate}</span>
        <span className="flex items-center gap-1"><Rocket size={16} /> גרסה {currentVersion}</span>
      </div>

      <div className="flex gap-4 mb-6 text-sm">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-primary inline-block" /> הושלם</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-warning inline-block" /> בפיתוח</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-muted-foreground/30 inline-block" /> מתוכנן</span>
      </div>

      <div className="space-y-6">
        {roadmap.map((phase, idx) => {
          const doneCount = phase.items.filter(i => i.done).length;
          const progress = Math.round((doneCount / phase.items.length) * 100);
          const statusColor = phase.status === 'done' ? 'border-primary' : phase.status === 'current' ? 'border-warning' : 'border-muted';

          return (
            <div key={idx} className={`card-elevated border-r-4 ${statusColor}`}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <span className="text-sm text-muted-foreground font-medium">{phase.phase}</span>
                  <h2 className="text-xl font-bold">{phase.title}</h2>
                </div>
                <span className={`status-badge ${phase.status === 'current' ? 'status-pending' : phase.status === 'done' ? 'status-active' : 'status-inactive'}`}>
                  {phase.status === 'current' ? 'בפיתוח' : phase.status === 'done' ? 'הושלם' : 'מתוכנן'}
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-3 mb-4">
                <div className="bg-primary h-3 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-sm text-muted-foreground mb-3">{doneCount} / {phase.items.length} ({progress}%)</p>
              <div className="space-y-2">
                {phase.items.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 py-2">
                    {item.done ? <CheckCircle2 size={22} className="text-primary flex-shrink-0" /> : <Clock size={22} className="text-muted-foreground/40 flex-shrink-0" />}
                    <span className={`text-lg ${item.done ? 'text-foreground' : 'text-muted-foreground'}`}>{item.name}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-12 p-6 bg-primary text-primary-foreground rounded-2xl text-center">
        <p className="text-2xl font-bold mb-2">דליה - מערכת ניהול צי רכב</p>
        <p className="opacity-80">פתרונות תפעול ותחזוקה לרכב</p>
        <div className="mt-4 flex justify-center gap-6 text-sm opacity-70">
          <span>גרסה {currentVersion}</span>
          <span>תאריך: {releaseDate}</span>
        </div>
      </div>
    </div>
  );
}
