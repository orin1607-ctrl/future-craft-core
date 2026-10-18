// OpenProspector – national registry: per-source field mappers (STAGING).
// Every mapper turns ONE real source record into the row shape nr_ingest() expects. Nothing is invented:
// a field the record does not carry is left out. The 7 lead rules are NOT applied here.

export type Rec = Record<string, unknown>;
export type Row = Record<string, unknown>;

export const CKAN = "https://data.gov.il/api/3/action/datastore_search";

const s = (v: unknown) => String(v ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const nn = (v: unknown) => { const t = s(v); return t && t !== "null" && t !== "0" && t !== "-" ? t : ""; };

// area: dialing prefix of a municipal source ("04" for Haifa) – only used for 7-digit local numbers that omit it
export function normPhone(raw: unknown, area = ""): string {
  // "8543901.0" – spreadsheet float suffix; must not become an extra digit
  let d = s(raw).replace(/(\d)\.0+(?!\d)/g, "$1").replace(/\D/g, "");
  if (area && d.length === 7) d = area + d;
  if (/^1(700|800|599)\d{6}$/.test(d)) return d;
  if (d.startsWith("972")) d = "0" + d.slice(3);
  if (d.length === 8 || (d.length === 9 && !d.startsWith("0"))) d = "0" + d;
  return /^0(5\d{8}|7\d{8}|[23489]\d{7})$/.test(d) ? d : "";
}
export function fmtPhone(p: string): string {
  if (/^1\d{9}$/.test(p)) return `${p[0]}-${p.slice(1, 4)}-${p.slice(4, 7)}-${p.slice(7)}`;
  return /^0(5|7)/.test(p) ? `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}` : `${p.slice(0, 2)}-${p.slice(2, 5)}-${p.slice(5)}`;
}
type Phone = { v: string; d: string; sub?: string; branch_name?: string; branch_address?: string };
export function phones(vals: unknown[], extra: Partial<Phone> = {}, area = ""): Phone[] {
  const out: Phone[] = [];
  for (const raw of vals) {
    // separators, "או", or a space before another number ("09-7712593 052-3380123")
    for (const part of s(raw).split(/[;,/|]| או |\s+(?=0\d)/)) {
      const p = normPhone(part, area);
      if (p && !out.some((x) => x.v === p)) {
        out.push({ ...extra, v: p, d: fmtPhone(p), sub: extra.sub ?? (p.startsWith("05") ? "mobile" : "main") });
      }
    }
  }
  return out;
}
export function emails(vals: unknown[]) {
  const out: { v: string }[] = [];
  for (const raw of vals) for (const m of s(raw).toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g) || []) {
    if (!out.some((x) => x.v === m)) out.push({ v: m });
  }
  return out;
}
export function site(v: unknown): string[] {
  let u = s(v).replace(/^.*href="([^"]+)".*$/, "$1");
  if (!u || u === "null") return [];
  if (!/^https?:\/\//i.test(u)) u = "http://" + u.replace(/^\/+/, "");
  try { const x = new URL(u); return x.hostname.includes(".") ? [x.origin + x.pathname.replace(/\/default\.aspx?$/i, "")] : []; } catch { return []; }
}
export function yearOf(v: unknown): string {
  const m = s(v).match(/(19|20)\d{2}/);
  return m ? m[0] : "";
}
export function statusOf(raw: unknown): string {
  const t = s(raw);
  if (!t) return "";
  if (/מחוק|לא פעיל|לא בתוקף|פג תוקף|מבוטל|בוטל|התפרק|פורק|סגור/.test(t)) return "inactive";
  if (/פעיל|רשומה|בתוקף|מתחדש|מורשה/.test(t)) return "active";
  return "unknown";
}
const regOk = (v: unknown) => { const d = s(v).replace(/\D/g, ""); return /^5[0-9]\d{7}$/.test(d) ? d : ""; };
const regType = (d: string) => (d.startsWith("58") ? "amuta" : d.startsWith("57") ? "cooperative" : d.startsWith("50") ? "government" : d ? "company" : "");
const cityFromAddress = (a: string) => { const parts = a.split(",").map((x) => x.trim()).filter(Boolean); return parts.length > 1 ? parts[parts.length - 1].replace(/\d+/g, "").trim() : ""; };
const generic = (t: string) => /^לעסוק (בכל עיסוק חוקי|בסוגי עיסוק שפורטו בתקנון)/.test(t);
const clip = (t: string, n = 400) => (t.length > n ? t.slice(0, n) + "…" : t);

export function recordUrl(rid: string, id: unknown) {
  return `${CKAN}?resource_id=${rid}&filters=${encodeURIComponent(JSON.stringify({ _id: id }))}`;
}

// key -> mapper(record) => row | null. `base` adds rid/url/fields uniformly.
type Mapper = (r: Rec) => Row | null;
export const MAPPERS: Record<string, Mapper> = {
  companies: (r) => {
    const purpose = nn(r["מטרת החברה"]);
    const desc = nn(r["תאור חברה"]);
    return {
      reg_id: s(r["מספר חברה"]), reg_type: "company", name: s(r["שם חברה"]), name_en: nn(r["שם באנגלית"]),
      corp_type: nn(r["סוג תאגיד"]), status: statusOf(r["סטטוס חברה"]), status_raw: [nn(r["סטטוס חברה"]), nn(r["תת סטטוס"])].filter(Boolean).join(" – "),
      founded_year: yearOf(r["תאריך התאגדות"]), description: clip([desc, generic(purpose) ? "" : purpose].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(" | ")),
      address: [nn(r["שם רחוב"]), nn(r["מספר בית"])].filter(Boolean).join(" "), city: nn(r["שם עיר"]), zip: nn(r["מיקוד"]),
      fields: { reg_id: true, name: true, corp_type: true, status: true, founded: true, address: true, last_annual_report: nn(r["שנה אחרונה של דוח שנתי (שהוגש)"]) || null, government_company: nn(r["חברה ממשלתית"]) || null },
    };
  },
  amutot: (r) => ({
    reg_id: s(r["מספר עמותה"]), reg_type: "amuta", name: s(r["שם עמותה בעברית"]), name_en: nn(r["שם עמותה באנגלית"]), corp_type: "עמותה",
    status: statusOf(r["סטטוס עמותה"]), status_raw: nn(r["סטטוס עמותה"]), founded_year: yearOf(r["תאריך רישום עמותה"]),
    sector: nn(r["סיווג פעילות ענפי"]), activity: nn(r["תחום פעילות משני"]), description: clip(nn(r["מטרות עמותה"])),
    employees: nn(r["כמות עובדים"]), region: nn(r["איזורי פעילות"]),
    address: [nn(r["כתובת - רחוב"]), nn(r["כתובת - מספר דירה"])].filter(Boolean).join(" "), city: nn(r["כתובת - ישוב"]), zip: nn(r["כתובת - מיקוד"]),
    fields: { reg_id: true, name: true, status: true, sector: true, address: true, employees: nn(r["כמות עובדים"]) || null, turnover: nn(r["מחזור כספי (הכנסות)"]) || null },
  }),
  chalatz: (r) => ({
    reg_id: s(r["מספר חלצ"]), reg_type: "chalatz", name: s(r["שם חלצ בעברית"]), name_en: nn(r["שם חלצ באנגלית"]), corp_type: "חברה לתועלת הציבור",
    status: statusOf(r["סטטוס חלצ"]), status_raw: nn(r["סטטוס חלצ"]), sector: nn(r["סיווג פעילות ענפי"]), activity: nn(r["תחום פעילות"]),
    employees: nn(r["עובדים- נתונים מדוח מילולי מקוון"]), region: nn(r["איזורי פעילות"]),
    address: [nn(r["כתובת - רחוב"]), nn(r["כתובת - מספר דירה"])].filter(Boolean).join(" "), city: nn(r["כתובת - ישוב"]), zip: nn(r["כתובת - מיקוד"]),
    fields: { reg_id: true, name: true, status: true, sector: true, address: true },
  }),
  contractors: (r) => {
    const reg = regOk(r.MISPAR_YESHUT);
    const tel = phones([r.MISPAR_TEL]);
    const em = emails([r.EMAIL]);
    const anaf = nn(r.TEUR_ANAF);
    return {
      reg_id: reg, reg_type: regType(reg) || "osek", name: s(r.SHEM_YESHUT), city: nn(r.SHEM_YISHUV),
      address: [nn(r.SHEM_REHOV), nn(r.MISPAR_BAIT)].filter(Boolean).join(" "), phones: tel, emails: em,
      sector: "בנייה וקבלנות", activity: anaf, activities: anaf ? [`${anaf} (סיווג ${nn(r.KVUTZA)}${nn(r.SIVUG)})`] : [],
      people: nn(r.OVDIM) ? [{ name: nn(r.OVDIM), role: "בעל כישורים רשום בפנקס הקבלנים" }] : [],
      fields: { contractor_no: nn(r.MISPAR_KABLAN), phone: tel.map((p) => p.d), email: em.map((e) => e.v), branch: anaf, group: nn(r.KVUTZA) + nn(r.SIVUG) },
    };
  },
  plants: (r) => {
    const reg = regOk(r.MisparTaagidShutfutMenifa);
    const branch = { sub: "branch", branch_name: nn(r.ShemAtarSvivatiMenifa), branch_address: nn(r.KtovetAtarSvivatiMenifa) };
    const tel = phones([r.TelefonAtarSvivatiMenifa], branch);
    const fax = phones([r.FaxAtarSvivatiMenifa], { ...branch, sub: "fax" });
    return {
      reg_id: reg, reg_type: regType(reg), name: s(r.ShemTaagidShutfut), address: nn(r.KtovetTaagidShutfut),
      city: reg ? "" : nn(r.YeshuvAtarSvivatiMenifa), region: nn(r.MachozAtarSvivati), phones: [...tel, ...fax], websites: site(r.AtarInternetMenifa),
      sector: nn(r.AnafAtarSvivati), activity: nn(r.TchumPeilutAtarSvivati), activities: [nn(r.SugPeilutAtarSvivati)].filter(Boolean),
      fields: { site_no: nn(r.MisparAtarSvivati), site_name: branch.branch_name, site_phone: tel.map((p) => p.d), report_year: nn(r.ShnatDivuach) },
    };
  },
  business_licenses: (r) => {
    const tel = phones([r["טלפון בעסק"]], {}, "08");
    return {
      // רישוי העסקים הזה מפורסם ע"י עיריית באר שבע – העיר ידועה גם כשאינה מופיעה ברשומה
      name: s(r["שם עסק"]), address: [nn(r["שם רחוב"]), nn(r["בית"])].filter(Boolean).join(" "), city: "באר שבע", phones: tel, emails: emails([r["מייל בעסק"]]),
      activity: nn(r["תאור רישיון"]),
      fields: { license_no: nn(r["מספר רישיון"]), license: nn(r["תאור רישיון"]), license_status: nn(r["תאור סטטוס"]), phone: tel.map((p) => p.d) },
    };
  },
  asbestos: (r) => {
    const tel = phones([r.Phone, r.AdditionalTelephone]);
    return {
      name: s(r.Name), address: nn(r.Address).replace(/~/g, ","), city: nn(r.Settlement), region: nn(r.District),
      phones: [...tel, ...phones([r.Fax], { sub: "fax" })], emails: emails([r.Email]), activity: nn(r.LicenseType), sector: "הנדסת סביבה ואסבסט",
      fields: { license_no: nn(r.LicenseNumber), license: nn(r.LicenseType), phone: tel.map((p) => p.d), valid_until: nn(r.LicenseExpirationDate) },
    };
  },
  garages: (r) => {
    const reg = regOk(r.rasham_havarot);
    const tel = phones([r.telephone]);
    return {
      reg_id: reg, reg_type: regType(reg), name: s(r.shem_mosah), address: nn(r.ktovet), city: nn(r.yishuv), zip: nn(r.mikud),
      phones: tel, sector: "רכב – מוסכים ומכוני רישוי", activity: nn(r.sug_mosah), activities: [nn(r.miktzoa)].filter(Boolean),
      people: nn(r.menahel_miktzoa) ? [{ name: nn(r.menahel_miktzoa), role: "מנהל מקצועי (מוסך)" }] : [],
      logistics: ["שירותי רכב"],
      fields: { garage_no: nn(r.mispar_mosah), type: nn(r.sug_mosah), profession: nn(r.miktzoa), phone: tel.map((p) => p.d) },
    };
  },
  tourism_vat: (r) => {
    const reg = regOk(r.id);
    const tel = phones([r.phone]);
    return {
      reg_id: reg, reg_type: regType(reg), name: s(r.name), address: nn(r.address), city: nn(r.city), phones: tel,
      sector: "מסחר קמעונאי", activity: nn(r.category), fields: { category: nn(r.category), phone: tel.map((p) => p.d) },
    };
  },
  daycare: (r) => {
    const reg = regOk(r["ח.פ. ארגון"]);
    if (!reg) return null; // משפחתון של אדם פרטי ללא ארגון – לא נאסף
    const bname = nn(r["שם מעון"]);
    const baddr = [nn(r["שם רחוב"]), nn(r["מספר בית"]), nn(r["שם עיר"])].filter(Boolean).join(" ");
    const tel = phones([r["מספר טלפון"]], { sub: "branch", branch_name: bname, branch_address: baddr });
    return {
      reg_id: reg, reg_type: regType(reg), name: s(r["שם ארגון"]), phones: tel, sector: "חינוך – מעונות יום", activity: nn(r["תיאור סוג מעון"]),
      people: nn(r["שם מנהל"]) ? [{ name: nn(r["שם מנהל"]), role: `מנהל/ת מעון – ${bname}` }] : [],
      fields: { daycare_code: nn(r["סמל מעון"]), daycare_name: bname, branch_phone: tel.map((p) => p.d) },
    };
  },
  welfare: (r) => {
    const reg = regOk(r.Registered_Business_Id);
    if (!reg) return null;
    const bname = nn(r.Name);
    const tel = phones([r.Telephone], { sub: "branch", branch_name: bname, branch_address: [nn(r.Adrees), nn(r.City_Name)].filter(Boolean).join(" ") });
    return {
      reg_id: reg, reg_type: regType(reg), name: bname, phones: tel, sector: "רווחה", activity: nn(r.Type_Descr),
      people: nn(r.Maneger_Name) ? [{ name: nn(r.Maneger_Name), role: `מנהל/ת מסגרת – ${bname}` }] : [],
      fields: { framework_id: nn(r.Misgeret_Id), framework: bname, status: nn(r.Status_des), branch_phone: tel.map((p) => p.d) },
    };
  },
  museums: (r) => {
    const tel = phones([r["מספר  טלפון"]]);
    const addr = nn(r["כתובת"]);
    return {
      name: s(r["שם המוזאון"]).replace(/[,–-][^,–-]*$/, "").trim() || s(r["שם המוזאון"]), alt: s(r["שם המוזאון"]), address: addr,
      phones: tel, emails: emails([r["כתובת מייל"]]), websites: site(r["כתובת אתר המוזאון"]), sector: "תרבות – מוזאונים",
      people: nn(r["שם המנהל"]) ? [{ name: nn(r["שם המנהל"]), role: "מנהל/ת המוזאון" }] : [],
      fields: { phone: tel.map((p) => p.d), email: nn(r["כתובת מייל"]) },
    };
  },
  protected_housing: (r) => {
    const tel = phones([r.telephone], { sub: "branch", branch_name: nn(r.protected_house_name), branch_address: nn(r.settlement) });
    return {
      name: s(r.company) || s(r.protected_house_name), phones: tel, websites: site(r.internet_site), sector: "דיור מוגן", activity: "בית דיור מוגן",
      fields: { house: nn(r.protected_house_name), city: nn(r.settlement), branch_phone: tel.map((p) => p.d) },
    };
  },
  mail_permits: (r) => {
    const addr = nn(r["כתובת"]);
    const tel = phones([r["טלפון"], r["נייד"]]);
    return {
      name: s(r["שם בעל היתר"]), address: addr, city: cityFromAddress(addr), phones: [...tel, ...phones([r["פקס"]], { sub: "fax" })],
      emails: emails([r["מייל"], r["מייל נוסף"]]), activity: "שירותי דואר ושליחויות (היתר משרד התקשורת)", sector: "שליחויות ודואר",
      logistics: ["שליחויות / חלוקת דואר"], fields: { phone: tel.map((p) => p.d), valid_until: nn(r["תוקף היתר עד ליום"]) },
    };
  },
  employers: (r) => {
    const reg = regOk(r.employer_number);
    return {
      reg_id: reg, reg_type: regType(reg), name: s(r.employer_name), city: nn(r.city), address: nn(r.address), sector: nn(r.industry),
      employees: nn(r.employees_general_number),
      fields: { employees_general_number: nn(r.employees_general_number) || null, decision_date: nn(r.decision_date), note: "עיצום כספי משרד העבודה" },
    };
  },
  manpower: (r) => {
    const reg = regOk(r.identitynumber);
    const people = [];
    if (nn(r.companyceo)) people.push({ name: nn(r.companyceo), role: "מנכ\"ל" });
    if (nn(r.companyowner)) people.push({ name: nn(r.companyowner), role: "בעלים" });
    const acts = nn(r.fieldfactivity).split(";").map((x) => x.trim()).filter(Boolean);
    return {
      reg_id: reg, reg_type: regType(reg), name: s(r.companyname), address: nn(r.address), city: nn(r.town),
      sector: "כוח אדם, שמירה וניקיון", activity: acts[0] || nn(r.sugrishayon), activities: acts, people,
      fields: { license_no: nn(r.licensenumber), license_type: nn(r.sugrishayon), license_status: nn(r.status), valid_until: nn(r.validuntil) },
    };
  },
  gov_suppliers: (r) => {
    const reg = regOk(r["מספר חפ ספק"]);
    if (!reg || !nn(r["שם ספק"]) && !nn(r["שם ספק זוכה"])) return null;
    return {
      reg_id: reg, reg_type: regType(reg), name: s(r["שם ספק"] || r["שם ספק זוכה"]), activities: ["ספק של משרד ממשלתי"],
      fields: { ministry: nn(r["שם המשרד"]), procedure: clip(nn(r["שם הליך"]), 160), date: nn(r["תאריך פרסום"]) },
    };
  },
  factories: (r) => {
    const reg = regOk(r.Mispar_Atar);
    return {
      reg_id: reg, reg_type: regType(reg), name: s(r.Shem_Atar_Svivati).replace(/\s+-\s+.*$/, ""), alt: s(r.Shem_Atar_Svivati),
      city: reg ? "" : nn(r.Yeshuv), region: nn(r.Machoz), activity: nn(r.mehute_Atar).replace(/^\d+\s*/, ""), sector: "תעשייה",
      activities: [nn(r.mehute_Atar).replace(/^\d+\s*/, "")].filter(Boolean),
      fields: { site: nn(r.Shem_Atar_Svivati), site_city: nn(r.Yeshuv), site_id: nn(r.Mispar_Mezahe) },
    };
  },
  cooperatives: (r) => {
    const name = s(r.Name);
    if (/בדיקה בדיקה/.test(name)) return null;
    const reg = regOk(r.Identity);
    const tel = phones([r.phone]);
    return {
      reg_id: reg, reg_type: "cooperative", name, corp_type: "אגודה שיתופית", city: nn(r.TownName), address: [nn(r.StreetName), nn(r.Building)].filter(Boolean).join(" "),
      zip: nn(r.zip), phones: tel, status: statusOf(r.StatusDesc), status_raw: nn(r.StatusDesc), sector: nn(r.PrimaryType),
      activities: nn(r.SecondaryTypes).split(/[,;]/).map((x) => x.trim()).filter(Boolean), founded_year: yearOf(r.RegistrationDate),
      fields: { reg_id: true, status: nn(r.StatusDesc), phone: tel.map((p) => p.d) },
    };
  },
  transport_trade: (r) => {
    const reg = regOk(r.mispar_esek);
    const tel = phones([r.telephone]);
    return {
      reg_id: reg, reg_type: regType(reg), name: s(r.shem_esek), city: nn(r.yishuv), address: nn(r.ktovet), phones: tel,
      sector: "רכב – סחר, יבוא וייצור מוצרי תעבורה", activity: [nn(r.sug_esek), nn(r.isuk)].filter(Boolean).join(" – "),
      fields: { type: nn(r.sug_esek), phone: tel.map((p) => p.d) },
    };
  },
  fuel_stations: (r) => {
    const tel = phones([r.telephone], { sub: "branch", branch_name: nn(r.station_name), branch_address: [nn(r.location), nn(r.City)].filter(Boolean).join(", ") });
    return {
      name: s(r.company), phones: tel, sector: "דלק ותחנות תדלוק", activity: "רשת / מפעיל תחנות דלק", logistics: ["תחנות דלק"],
      fields: { station: nn(r.station_name), station_no: nn(r.station_number), city: nn(r.City), branch_phone: tel.map((p) => p.d) },
    };
  },
  extinguishers: (r) => {
    if (!nn(r.company)) return null; // אדם פרטי ללא חברה – לא נאסף
    const tel = phones([r.phone]);
    return {
      name: s(r.company), address: nn(r.adress), phones: tel, emails: emails([r.email]), sector: "בטיחות אש", activity: nn(r.type),
      fields: { status: nn(r.status), phone: tel.map((p) => p.d) },
    };
  },
  pension_funds: (r) => {
    const reg = regOk(r["ח.פ. של חברה"]);
    const tel = phones([r["טלפון"]]);
    return {
      reg_id: reg, reg_type: regType(reg), name: s(r["שם חברה"]), address: nn(r["כתובת"]), city: nn(r["עיר"]),
      phones: [...tel, ...phones([r["פקס"]], { sub: "fax" })], emails: emails([r["דואר אלקטרוני"]]), sector: "פיננסים – גמל ופנסיה",
      activity: nn(r["תחום"]), fields: { fund: nn(r["שם קופה / קרן"]), phone: tel.map((p) => p.d) },
    };
  },
  bank_branches: (r) => {
    const tel = phones([r.telephone], { sub: "branch", branch_name: `סניף ${nn(r.branch_code)} ${nn(r.branch_name)}`.trim(), branch_address: [nn(r.address), nn(r.city)].filter(Boolean).join(", ") });
    return {
      name: s(r.name), phones: tel, sector: "בנקאות", activity: "תאגיד בנקאי – סניפים",
      fields: { branch: nn(r.branch_code), city: nn(r.city), branch_phone: tel.map((p) => p.d) },
    };
  },
  liquidation: (r) => {
    const reg = regOk(r["מספר חברה"]);
    return {
      reg_id: reg, reg_type: "company", name: s(r["שם חברה"]), corp_type: nn(r["סוג תאגיד"]), city: nn(r["שם עיר"]),
      address: [nn(r["שם רחוב"]), nn(r["מספר בית"])].filter(Boolean).join(" "), status_raw: nn(r["תת סטטוס"]),
      fields: { sub_status: nn(r["תת סטטוס"]), liquidation_approved: nn(r["אישור בקשת הפירוק"]), expected_end: nn(r["מועד החיסול הצפוי"]) },
    };
  },
};

// Config-driven mapper for small datasets found by discovery: nr_sources.config.map says which field is what.
type GenericMap = {
  name: string | string[]; name_prefix?: string; name_en?: string; reg?: string; city?: string; city_const?: string; address?: string[];
  phones?: string[]; area_code?: string; phone_sub?: string; branch_name?: string[]; branch_address?: string[]; emails?: string[]; website?: string;
  activity?: string[]; sector?: string; people?: { name: string[]; role?: string; role_field?: string }[]; create?: boolean; fields?: string[];
};
const pick = (r: Rec, f?: string | string[]) => (Array.isArray(f) ? f : f ? [f] : []).map((k) => nn(r[k])).filter(Boolean);
// broken encoding in some municipal files (Hangul / math symbols instead of Hebrew)
const garbled = (t: string) => /[\u1100-\u11ff\uac00-\ud7af\u2200-\u22ff]/.test(t);
export function genericRow(r: Rec, m: GenericMap): Row | null {
  const raw = pick(r, m.name)[0] || "";
  if (!raw || garbled(raw) || normPhone(raw)) return null; // a "name" that is a phone number is not a business name
  const name = (m.name_prefix || "") + raw;
  const reg = m.reg ? regOk(r[m.reg]) : "";
  const branch = m.phone_sub === "branch" ? { sub: "branch", branch_name: pick(r, m.branch_name).join(" "), branch_address: pick(r, m.branch_address).join(", ") } : {};
  const tel = phones(pick(r, m.phones), branch, m.area_code || "");
  const people = (m.people || []).map((p) => ({ name: pick(r, p.name).join(" "), role: p.role_field ? nn(r[p.role_field]) : (p.role || "") }))
    .filter((p) => p.name && !garbled(p.name));
  const fields: Record<string, unknown> = { phone: tel.map((x) => x.d) };
  for (const f of m.fields || []) if (nn(r[f])) fields[f] = nn(r[f]);
  return {
    reg_id: reg, reg_type: regType(reg), name, name_en: m.name_en ? nn(r[m.name_en]) : "",
    city: m.city_const || (m.city ? nn(r[m.city]) : ""), address: pick(r, m.address).join(" "), phones: tel,
    emails: emails(pick(r, m.emails)), websites: m.website ? site(r[m.website]) : [], activity: pick(r, m.activity).join(" – "),
    sector: m.sector || "", people, create: m.create === false ? false : undefined, fields,
  };
}

// Tel Aviv-Yafo municipal GIS (IView2) – business layers
export const TLV_CITY = "תל אביב - יפו";
export const TLV_MAPPERS: Record<string, Mapper> = {
  // layer 925 "עסקים": main holder of each business. Only holders with a company / non-profit / cooperative number –
  // a private person's ID number is never stored.
  tlv_holders: (r) => {
    const reg = regOk(r.ms_mezahe_machzik_rashi);
    if (!reg) return null;
    return {
      reg_id: reg, reg_type: regType(reg), name: s(r.shem_machzik_rashi), activities: [nn(r.shimush)].filter(Boolean),
      fields: { tlv_business_id: nn(r.id_esek), use: nn(r.shimush), address_tlv: [nn(r.shem_rechov), nn(r.ms_bayit)].filter(Boolean).join(" "),
        area_sqm: nn(r.shetach), license_required: nn(r.sw_taun_rishui) },
    };
  },
  // layer 964 "מאגר עסקים ברשיון או בהיתר": licensed businesses by trade name
  tlv_licensed: (r) => ({
    name: s(r.t_shem_esek), city: TLV_CITY, address: nn(r.shem_rechov), activity: nn(r.t_hesber_mahut_esek),
    activities: nn(r.mahuiot).split(/[,;]/).map((x) => x.trim()).filter(Boolean).slice(0, 8),
    fields: { license_no: nn(r.t_rishaion_letezuga), license_type: nn(r.t_sug), valid_until: nn(r.taarich_tokef), business_no: nn(r.ms_esek_rashi) },
  }),
};

export function withBase(sourceRid: string, rec: Rec, row: Row | null, urlOf?: (id: unknown) => string): Row | null {
  if (!row || !s(row.name)) return null;
  const id = rec._id;
  const r: Row = { ...row, rid: String(id), url: urlOf ? urlOf(id) : recordUrl(sourceRid, id) };
  if (row.alt && row.alt !== row.name) r.alt_names = [row.alt];
  delete r.alt;
  for (const k of Object.keys(r)) {
    const v = r[k];
    if (v === "" || v == null || (Array.isArray(v) && v.length === 0)) delete r[k];
  }
  return r;
}
