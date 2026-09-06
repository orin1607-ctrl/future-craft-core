import { NavLink, useLocation } from 'react-router-dom';
import { Home, Car, Users, Route, Wrench, FileText, AlertTriangle, BarChart3, RefreshCw, Menu, X, LogOut, Settings, Bell, Briefcase, ClipboardList, History, UserCheck, Phone, Building2, ChevronsUpDown, Check, Truck, Shield, CheckSquare, Mail, Tag, MessageCircle, CreditCard, ScrollText, Upload, Search as SearchIcon, HeartPulse, Download, Database, Smartphone, Calendar } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyScope } from '@/contexts/CompanyScopeContext';
import { useUnreadNotifications } from '@/hooks/useUnreadNotifications';
import { useHiddenButtons } from '@/hooks/useHiddenButtons';
import { useDriverActionVisibility } from '@/hooks/useDriverActionVisibility';
import logo from '@/assets/white-logo.png';
import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';

interface NavItem {
  path: string;
  label: string;
  icon: any;
}

// New structured manager menu
const managerCategories = [
  {
    title: 'בית',
    items: [
      { path: '/dashboard', label: 'דשבורד', icon: Home },
      { path: '/alerts', label: 'התראות', icon: Bell },
    ],
  },
  {
    title: 'לקוחות',
    items: [
      { path: '/customers', label: 'לקוחות שלי', icon: Users },
      { path: '/attach-customer', label: 'הצמדת נהג ללקוח', icon: UserCheck },
      { path: '/customer-docs', label: 'מסמכי לקוח', icon: FileText },
    ],
  },
  {
    title: 'ניהול צי רכב',
    items: [
      { path: '/vehicles', label: 'רכבים', icon: Car },
      { path: '/drivers', label: 'נהגים', icon: Users },
      { path: '/companions', label: 'מלווים', icon: Users },
      { path: '/attach-car', label: 'הצמדת רכב לנהג', icon: UserCheck },
      { path: '/vehicle-inspections', label: 'ביקורות רכב', icon: CheckSquare },
      { path: '/private-vehicle-inspection', label: 'בדיקה תלת/חצי', icon: CheckSquare },
      { path: '/vehicle-tasks', label: 'ליקויים', icon: AlertTriangle },
      { path: '/vehicle-import', label: 'יבוא רכבים', icon: Upload },
      { path: '/driver-import', label: 'יבוא נהגים', icon: Upload },
      { path: '/vehicle-lookup', label: 'בדיקת רכב ממשלתי', icon: SearchIcon },
      { path: '/health-declaration', label: 'הצהרת בריאות', icon: HeartPulse },
      { path: '/driver-declarations', label: 'תצהירי נהגים', icon: FileText },
      { path: '/history', label: 'היסטוריית שינויים', icon: History },
    ],
  },
  {
    title: 'תפעול ושירות',
    items: [
      { path: '/faults', label: 'מעקב רכב', icon: Wrench },
      { path: '/service-orders', label: 'שירותים ותחזוקה', icon: Briefcase },
      { path: '/routes', label: 'ניהול מסלולים', icon: Route },
      { path: '/work-orders', label: 'סידור עבודה', icon: ClipboardList },
      { path: '/pickup-appointments', label: 'תיאומי איסוף', icon: Calendar },
      { path: '/towing', label: 'שינועים', icon: Truck },
      { path: '/vehicle-exchange', label: 'החלפת רכב', icon: RefreshCw },
      { path: '/accidents', label: 'דיווח תאונה', icon: AlertTriangle },
    ],
  },
  {
    title: 'דוחות ובקרה',
    items: [
      { path: '/reports', label: 'דוחות', icon: BarChart3 },
      { path: '/documents', label: 'מסמכים', icon: FileText },
    ],
  },
  {
    title: 'מערכת והגדרות',
    items: [
      { path: '/user-management', label: 'ניהול משתמשים', icon: Users },
      { path: '/permissions', label: 'הרשאות', icon: Shield },
      { path: '/alert-settings', label: 'הגדרות חברות', icon: Building2 },
      { path: '/approval-settings', label: 'הגדרות אישורים', icon: CheckSquare },
      { path: '/suppliers', label: 'ניהול ספקים', icon: Building2 },
      { path: '/emergency', label: 'מספרי חירום', icon: Phone },
      { path: '/emergency-settings', label: 'הגדרות חירום', icon: Phone },
      { path: '/email-templates', label: 'תבניות מייל', icon: Mail },
      { path: '/alerts', label: 'התראות ועדכונים', icon: Bell },
      { path: '/settings', label: 'הגדרות', icon: Settings },
    ],
  },
];

// Manager mobile bottom nav
const managerMobileNav: NavItem[] = [
  { path: '/dashboard', label: 'בית', icon: Home },
  { path: '/alerts', label: 'התראות', icon: Bell },
  { path: '/service-orders', label: 'שירותים', icon: Briefcase },
  { path: '/settings', label: 'הגדרות', icon: Settings },
];

// Driver mobile bottom nav
const driverMobileNav: NavItem[] = [
  { path: '/dashboard', label: 'בית', icon: Home },
  { path: '/driver-notifications', label: 'התראות', icon: Bell },
  { path: '/faults', label: 'תקלה', icon: Wrench },
  { path: '/expenses', label: 'חשבוניות', icon: FileText },
];

// Private customer mobile bottom nav
const privateCustomerMobileNav: NavItem[] = [
  { path: '/dashboard', label: 'לוח בקרה', icon: Home },
  { path: '/service-orders', label: 'הבקשות שלי', icon: ClipboardList },
  { path: '/driver-notifications', label: 'התראות', icon: Bell },
  { path: '/settings', label: 'הגדרות', icon: Settings },
];

const allManagerItems = managerCategories.flatMap(c => c.items);

// Extra items for all managers (promotions, chat, subscriptions)
const extraItems: NavItem[] = [
  { path: '/promotions', label: 'מבצעים', icon: Tag },
  { path: '/internal-chat', label: 'צ\'אט פנימי', icon: MessageCircle },
];
const superAdminExtra: NavItem[] = [
  { path: '/subscriptions', label: 'מנויים וחיוב', icon: CreditCard },
  { path: '/driver-app-notifications', label: 'ניהול אפליקציית נהג והתראות', icon: Smartphone },
  { path: '/project-summary', label: 'דוח תוספות', icon: ScrollText },
  { path: '/completed-tasks', label: 'משימות פיתוח תוכנה', icon: CheckSquare },
  { path: '/system-update/code', label: 'עדכון קוד', icon: Download },
  { path: '/system-update/database', label: 'עדכון מסד נתונים', icon: Database },
  { path: '/system-update/audit', label: 'יומן עדכונים', icon: ScrollText },
];

export default function BottomNav() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [showMore, setShowMore] = useState(false);
  const unreadCount = useUnreadNotifications();
  const hiddenButtons = useHiddenButtons();
  const { isPathVisible } = useDriverActionVisibility();

  const isDriver = user?.role === 'driver';
  const isPrivateCustomer = user?.role === 'private_customer';
  const isSuperAdmin = user?.role === 'super_admin';
  const mobileNav = (isDriver ? driverMobileNav : isPrivateCustomer ? privateCustomerMobileNav : managerMobileNav)
    .filter(item => isPathVisible(item.path));
  const allItemsForMobile = [
    ...allManagerItems,
    ...extraItems,
    ...(isSuperAdmin ? superAdminExtra : []),
  ].filter(item => !hiddenButtons.includes(item.path));
  const moreItems = (isDriver || isPrivateCustomer) ? [] : allItemsForMobile.filter(
    item => !managerMobileNav.some(m => m.path === item.path)
  );

  const isMoreActive = moreItems.some(item => location.pathname.startsWith(item.path));

  return (
    <>
      {showMore && !isDriver && !isPrivateCustomer && (
        <div className="fixed inset-0 z-40 bg-foreground/50" onClick={() => setShowMore(false)}>
          <div className="absolute bottom-[80px] left-0 right-0 bg-card rounded-t-3xl shadow-2xl p-4 animate-fade-in max-h-[60vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4 px-2">
              <h3 className="text-xl font-bold">תפריט נוסף</h3>
              <button onClick={() => setShowMore(false)} className="p-2 rounded-xl bg-muted"><X size={24} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {moreItems.map(item => (
                <NavLink key={item.path} to={item.path} onClick={() => setShowMore(false)}
                  className={({ isActive }) => `big-action-btn ${isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}>
                  <item.icon size={32} /><span>{item.label}</span>
                </NavLink>
              ))}
              <button onClick={() => { setShowMore(false); logout(); }} className="big-action-btn bg-destructive/10 text-destructive">
                <LogOut size={32} /><span>התנתקות</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-card border-t-2 border-border shadow-[0_-4px_20px_rgba(0,0,0,0.1)] md:hidden">
        <div className="flex justify-around items-center px-1">
          {mobileNav.map(item => (
            <NavLink key={item.path} to={item.path}
              className={({ isActive }) => `nav-item-mobile flex-1 relative ${isActive ? 'text-primary font-bold' : 'text-muted-foreground'}`}>
              <item.icon size={26} />
              {item.path === '/driver-notifications' && unreadCount > 0 && (
                <span className="absolute top-1 left-1/2 bg-destructive text-destructive-foreground text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1">{unreadCount > 99 ? '99+' : unreadCount}</span>
              )}
              <span className="text-xs">{item.label}</span>
            </NavLink>
          ))}
          {!isDriver && !isPrivateCustomer && (
            <button onClick={() => setShowMore(!showMore)} className={`nav-item-mobile flex-1 ${isMoreActive ? 'text-primary font-bold' : 'text-muted-foreground'}`}>
              <Menu size={26} /><span className="text-xs">עוד</span>
            </button>
          )}
        </div>
      </nav>
    </>
  );
}

export function DesktopSidebar() {
  const { user, logout } = useAuth();
  const { selectedCompany, setSelectedCompany, companyOptions } = useCompanyScope();
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({ 'בית': true, 'תפעול ושירות': true });
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const unreadCount = useUnreadNotifications();
  const hiddenButtons = useHiddenButtons();
  const { isPathVisible } = useDriverActionVisibility();

  const isDriver = user?.role === 'driver';
  const isSuperAdmin = user?.role === 'super_admin';

  const toggleCategory = (title: string) => {
    setOpenCategories(prev => ({ ...prev, [title]: !prev[title] }));
  };

  const driverSidebarItems: NavItem[] = [
    { path: '/dashboard', label: 'דשבורד', icon: Home },
    { path: '/driver-notifications', label: 'התראות', icon: Bell },
    { path: '/driver-schedule', label: 'לוח זמנים', icon: ClipboardList },
    { path: '/faults', label: 'דיווח תקלה', icon: Wrench },
    { path: '/expenses', label: 'דלק וחשבוניות', icon: FileText },
    { path: '/accidents', label: 'תאונה וחירום', icon: AlertTriangle },
    { path: '/handover', label: 'החלפת נהג', icon: RefreshCw },
    { path: '/work-orders', label: 'סידור עבודה', icon: ClipboardList },
    { path: '/history', label: 'היסטוריה טיפולים', icon: History },
    { path: '/emergency', label: 'שירותי חירום 24/7', icon: Phone },
  ];


  return (
    <aside className="hidden md:flex flex-col w-72 bg-[hsl(218,58%,15%)] text-primary-foreground h-screen fixed right-0 top-0 z-20">
      {/* Logo */}
      <div className="p-5 flex flex-col items-center border-b border-primary-foreground/10">
        <img src={logo} alt="דליה" className="h-14 mb-2" />
        <p className="text-sm font-medium opacity-90">דליה — פתרונות תפעול ותחזוקה לרכב</p>
        <div className="mt-2 text-center">
          <p className="text-sm font-bold">{user?.full_name}</p>
          <p className="text-xs opacity-60">{user?.company_name}</p>
          <span className="mt-1 inline-block text-xs bg-primary-foreground/15 px-3 py-0.5 rounded-full">
            {user?.role === 'super_admin' ? 'מנהל על' : user?.role === 'fleet_manager' ? 'מנהל צי' : 'נהג'}
          </span>
        </div>
      </div>

      {/* Company scope */}
      {isSuperAdmin && (
        <div className="px-4 py-3 border-b border-primary-foreground/10">
          <Popover open={companyPickerOpen} onOpenChange={setCompanyPickerOpen}>
            <PopoverTrigger asChild>
              <button className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-primary-foreground/10 hover:bg-primary-foreground/20 transition-colors text-sm font-medium">
                <Building2 size={16} className="shrink-0" />
                <span className="flex-1 text-right truncate">{selectedCompany || 'כל החברות'}</span>
                <ChevronsUpDown size={14} className="shrink-0 opacity-60" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0 z-[60] bg-[hsl(218,58%,12%)] border-primary-foreground/20 rounded-xl shadow-2xl" align="start">
              <Command dir="rtl" className="bg-transparent text-primary-foreground">
                <CommandInput placeholder="חיפוש חברה..." className="border-primary-foreground/15 text-primary-foreground placeholder:text-primary-foreground/40" />
                <CommandList className="max-h-[260px]">
                  <CommandEmpty className="text-primary-foreground/50 py-4 text-center text-sm">לא נמצאו חברות</CommandEmpty>
                  <CommandGroup>
                    <CommandItem value="__all__" onSelect={() => { setSelectedCompany(null); setCompanyPickerOpen(false); }} className="flex items-center justify-between text-primary-foreground hover:bg-primary-foreground/10 data-[selected=true]:bg-primary-foreground/15 data-[selected=true]:text-primary-foreground rounded-lg mx-1">
                      <Check size={16} className={cn("shrink-0", !selectedCompany ? "opacity-100" : "opacity-0")} />
                      <span className="flex-1 text-right font-medium">כל החברות</span>
                    </CommandItem>
                    {companyOptions.map((option) => (
                      <CommandItem key={option.name} value={`${option.name} ${option.businessId}`} onSelect={() => { setSelectedCompany(option.name); setCompanyPickerOpen(false); }} className="flex items-center justify-between text-primary-foreground hover:bg-primary-foreground/10 data-[selected=true]:bg-primary-foreground/15 data-[selected=true]:text-primary-foreground rounded-lg mx-1">
                        <Check size={16} className={cn("shrink-0", selectedCompany === option.name ? "opacity-100" : "opacity-0")} />
                        <div className="flex-1 text-right">
                          <span className="font-medium">{option.name}</span>
                          {option.businessId && <span className="text-xs opacity-40 mr-2">({option.businessId})</span>}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      )}

      <nav className="flex-1 py-3 overflow-y-auto sidebar-scroll">
        {isDriver ? (
          driverSidebarItems.filter(item => isPathVisible(item.path)).map(item => (
            <NavLink key={item.path} to={item.path}
              className={({ isActive }) => `flex items-center gap-3 px-6 py-3.5 text-[15px] font-medium transition-colors relative ${isActive ? 'bg-primary-foreground/20 font-bold border-r-4 border-primary-foreground' : 'hover:bg-primary-foreground/10'}`}>
              <item.icon size={20} /><span>{item.label}</span>
              {item.path === '/driver-notifications' && unreadCount > 0 && (
                <span className="bg-destructive text-destructive-foreground text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1 mr-auto">{unreadCount > 99 ? '99+' : unreadCount}</span>
              )}
            </NavLink>
          ))
        ) : (
          <>
            {managerCategories.map(cat => {
              const visibleItems = cat.items.filter(item => !hiddenButtons.includes(item.path));
              if (visibleItems.length === 0) return null;
              return (
              <div key={cat.title} className="mb-0.5">
                <button onClick={() => toggleCategory(cat.title)}
                  className="w-full flex items-center justify-between px-5 py-2.5 text-xs font-bold uppercase tracking-wider opacity-50 hover:opacity-80 transition-opacity">
                  <span>{cat.title}</span>
                  <span className={`transition-transform text-[10px] ${openCategories[cat.title] ? 'rotate-180' : ''}`}>▼</span>
                </button>
                {openCategories[cat.title] && (
                  <div>
                    {visibleItems.map(item => (
                      <NavLink key={item.path} to={item.path}
                        className={({ isActive }) => `flex items-center gap-3 px-7 py-2.5 text-[15px] font-medium transition-colors ${isActive ? 'bg-primary-foreground/20 font-bold border-r-4 border-primary-foreground' : 'hover:bg-primary-foreground/10'}`}>
                        <item.icon size={18} /><span>{item.label}</span>
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
              );
            })}

            {/* Extra: Promotions, Chat */}
            <div className="border-t border-primary-foreground/10 mt-2 pt-2">
              {extraItems.filter(item => !hiddenButtons.includes(item.path)).map(item => (
                <NavLink key={item.path} to={item.path}
                  className={({ isActive }) => `flex items-center gap-3 px-7 py-2.5 text-[15px] font-medium transition-colors ${isActive ? 'bg-primary-foreground/20 font-bold border-r-4 border-primary-foreground' : 'hover:bg-primary-foreground/10'}`}>
                  <item.icon size={18} /><span>{item.label}</span>
                </NavLink>
              ))}
              {isSuperAdmin && superAdminExtra.map(item => (
                <NavLink key={item.path} to={item.path}
                  className={({ isActive }) => `flex items-center gap-3 px-7 py-2.5 text-[15px] font-medium transition-colors ${isActive ? 'bg-primary-foreground/20 font-bold border-r-4 border-primary-foreground' : 'hover:bg-primary-foreground/10'}`}>
                  <item.icon size={18} /><span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          </>
        )}
      </nav>

      <button onClick={() => logout()}
        className="flex items-center gap-3 px-6 py-4 text-[15px] font-medium border-t border-primary-foreground/10 hover:bg-primary-foreground/10 transition-colors">
        <LogOut size={20} /><span>התנתקות</span>
      </button>
    </aside>
  );
}
