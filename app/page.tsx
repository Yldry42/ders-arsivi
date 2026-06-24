'use client';
import { CSSProperties, MouseEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import dersler from '../data/dersler.json';
import akademisyenVerileri from '../data/akademisyen.json';
import arsivVerileri from '../data/arsiv.json';

type Ders = {
  id: number;
  kod: string;
  no: string;
  ders_adi: string;
  ders_adi_en?: string;
  ogretim_uyesi: string | string[];
  donem: string;
  yil: string;
  kategori: string;
  renk_kodu?: string;
  drive_link: string;
  not_sahipleri?: string[];
  cikmis_soru?: string;
  degerlendirme?: string;
};

type Degerlendirme = {
  puan: number | null;
  aciklama: string;
};

type Akademisyen = {
  ad: string;
  notlandirma?: Degerlendirme;
  yoklama_onemi?: Degerlendirme;
  ders_anlatimi?: Degerlendirme;
};

type ArsivDosyasi = {
  yil: string;
  dosya_adi: string;
  yerel_yol?: string;
  url?: string;
  boyut?: string;
  boyut_byte?: number;
};

type ArsivOnizleme = {
  ad: string;
  url: string;
  downloadUrl: string;
  uzanti: string;
};

type ArchiveFolderNode = {
  name: string;
  files: ArsivDosyasi[];
  folders: Record<string, ArchiveFolderNode>;
};

const getContrastTextColor = (hex: string) => {
  const normalized = hex.replace('#', '');
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#0f172a' : '#ffffff';
};

const getCardBackground = (hex: string) => {
  const normalized = hex.replace('#', '');
  return normalized.length === 6 ? `#${normalized}1a` : hex;
};

const highlightText = (text: string, query: string): ReactNode => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return text;

  const lowerText = text.toLowerCase();
  const startIndex = lowerText.indexOf(normalizedQuery);

  if (startIndex === -1) return text;

  return (
    <>
      {text.slice(0, startIndex)}
      <mark className="rounded bg-yellow-200 px-0.5 text-slate-900">
        {text.slice(startIndex, startIndex + normalizedQuery.length)}
      </mark>
      {text.slice(startIndex + normalizedQuery.length)}
    </>
  );
};

const highlightCourseCode = (code: string, no: string, display: string, query: string): ReactNode => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return display;

  const normalizedQueryNoSpace = normalizedQuery.replace(/\s+/g, '');
  const codeNo = `${code}${no}`.toLowerCase();
  const codeWithNoSpace = `${code} ${no}`.toLowerCase();

  if (codeNo.includes(normalizedQueryNoSpace) || codeWithNoSpace.includes(normalizedQuery) || code.toLowerCase().includes(normalizedQuery)) {
    return <mark className="rounded bg-yellow-200 px-0.5 text-slate-900">{display}</mark>;
  }

  return highlightText(display, query);
};

const shuffleArray = <T,>(array: T[]) => {
  const items = [...array];
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
};

const SunIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="2" />
    <path d="M12 1v6M12 17v6M23 12h-6M7 12H1M20.485 3.515l-4.243 4.243M7.757 16.243l-4.243 4.243M20.485 20.485l-4.243-4.243M7.757 7.757L3.515 3.515" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const MoonIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const lightenHex = (hex: string, mix = 0.85) => {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return hex;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  const mixWhite = (c: number) => Math.round(c + (255 - c) * mix);
  const rr = mixWhite(r).toString(16).padStart(2, '0');
  const gg = mixWhite(g).toString(16).padStart(2, '0');
  const bb = mixWhite(b).toString(16).padStart(2, '0');
  return `#${rr}${gg}${bb}`;
};

const translate = {
  tr: {
    title: 'İTÜ - Uzay Mühendisliği Ders Arşivi',
    description: 'Uzay mühendsiliği bölümü öğrencileri tarafından hazırlanmış ders arşivi.',
    searchPlaceholder: 'Ders kodu, isim veya akademisyen ara...',
    searchNote: 'Arama yalnızca seçili sekmede yapılıyor.',
    instructorPanelTitle: 'Akademisyenler',
    instructorPanelDescription: 'Yazdıkça potansiyel akademisyenler görünür.',
    instructorSearchPlaceholder: 'Akademisyen ara...',
    instructorNoResults: 'Eşleşen akademisyen bulunamadı.',
    instructorClearSelection: 'Seçimi temizle',
    instructorSelected: 'Seçili',
    instructorCourses: 'ders',
    instructorDetail: 'Akademisyen Detayı',
    grading: 'Notlandırma',
    attendance: 'Yoklama Önemi',
    teaching: 'Ders Anlatımı',
    givenCourses: 'Verdiği Dersler',
    notRated: 'Henüz puanlanmadı',
    menu: ['Dersler', 'Akademisyenler', 'Hazırlayanlar', 'Hakkımızda'],
    menuDescriptions: [
      'Arşivdeki derslere, kategorilere ve ders içeriklerine buradan ulaşabilirsiniz.',
      'Ders arşivinde yer alan akademisyenleri ve ilişkili dersleri inceleyebilirsiniz.',
      'Bu arşivin hazırlanmasına katkı sağlayan kişileri burada görebilirsiniz.',
      'Ders Arşivim projesinin amacı ve kapsamı hakkında bilgi edinebilirsiniz.',
    ],
    openedSection: 'Açılan Bölüm',
    openCourse: 'Açılan Ders',
    close: 'Kapat',
    notesTitle: 'Not Sahipleri',
    pastQuestionsTitle: 'Çıkmış Soru',
    courseNoteTitle: 'Ders Notu',
    yearLabel: 'Yıl',
    termLabel: 'Dönem',
    clear: 'Temizle',
    allCourses: 'Tüm Dersler',
    menuOpen: 'Menüyü aç',
    menuClose: 'Menüyü kapat',
    itemsLabel: 'adet',
    instructorSingular: 'Akademisyen',
    instructorPlural: 'Akademisyenler',
    noInfo: 'Bilgi yok',
    noNotesInfo: 'Bu ders için not sahipleri bilgisi henüz bulunmuyor.',
    noPastQuestionInfo: 'Çıkmış soru bilgisi eklenmedi.',
    noCourseNoteInfo: 'Ders hakkında kısa değerlendirme bilgisi yok.',
    archiveTitle: 'Ders Arşivi',
    archiveDescription: 'Yıl seçerek bu derse ait klasör ve dosyaları inceleyebilirsiniz.',
    archiveNoFiles: 'Bu ders için arşiv dosyası bulunamadı.',
    archiveSelectYear: 'Önce bir yıl seçin',
    archiveSelectInstructor: 'Akademisyen seçimi',
    archiveSelectTerm: 'Dönem seçimi',
    archiveAll: 'Tümü',
    archiveGeneral: 'Genel',
    archiveNoFilteredFiles: 'Bu seçim için dosya bulunamadı.',
    preview: 'Ön İzle',
    download: 'İndir',
    previewUnavailable: 'Bu dosya türü tarayıcı içinde ön izlenemeyebilir. İndirerek açabilirsiniz.',
  },
  en: {
    title: 'ITU - Astronautical Engineering Archive',
    description: 'A course archive prepared by Astronautical Engineering students.',
    searchPlaceholder: 'Search by course code, name, or instructor...',
    searchNote: 'Search only applies within the selected tab.',
    instructorPanelTitle: 'Instructors',
    instructorPanelDescription: 'Potential instructors appear as you type.',
    instructorSearchPlaceholder: 'Search instructor...',
    instructorNoResults: 'No matching instructors found.',
    instructorClearSelection: 'Clear selection',
    instructorSelected: 'Selected',
    instructorCourses: 'courses',
    instructorDetail: 'Instructor Detail',
    grading: 'Grading',
    attendance: 'Attendance Importance',
    teaching: 'Teaching',
    givenCourses: 'Courses Taught',
    notRated: 'Not rated yet',
    menu: ['Courses', 'Instructors', 'Creators', 'About'],
    menuDescriptions: [
      'Browse archived courses, categories, and course content from this section.',
      'Explore instructors included in the archive and their related courses.',
      'See the people who contributed to the preparation of this archive.',
      'Learn more about the purpose and scope of the Course Archive project.',
    ],
    openedSection: 'Opened Section',
    openCourse: 'Opened Course',
    close: 'Close',
    notesTitle: 'Note Owners',
    pastQuestionsTitle: 'Past Question',
    courseNoteTitle: 'Course Note',
    yearLabel: 'Year',
    termLabel: 'Term',
    clear: 'Clear',
    allCourses: 'All Courses',
    menuOpen: 'Open menu',
    menuClose: 'Close menu',
    itemsLabel: 'items',
    instructorSingular: 'Instructor',
    instructorPlural: 'Instructors',
    noInfo: 'No info available',
    noNotesInfo: 'No note owner information available.',
    noPastQuestionInfo: 'No past question information provided.',
    noCourseNoteInfo: 'No course note available.',
    archiveTitle: 'Course Archive',
    archiveDescription: 'Select a year to browse folders and files for this course.',
    archiveNoFiles: 'No archive files found for this course.',
    archiveSelectYear: 'Select a year first',
    archiveSelectInstructor: 'Instructor selection',
    archiveSelectTerm: 'Term selection',
    archiveAll: 'All',
    archiveGeneral: 'General',
    archiveNoFilteredFiles: 'No files found for this selection.',
    preview: 'Preview',
    download: 'Download',
    previewUnavailable: 'This file type may not be previewable in the browser. You can download it instead.',
  },
} as const;

const normalizeInstructors = (value: string | string[] | undefined): string[] =>
  !value ? [] : Array.isArray(value) ? value : [value];

const getCategoryShortLabel = (kategori: string, language: 'tr' | 'en' = 'tr') => {
  const trMap: Record<string, string> = {
    'Havuz Dersleri': 'Havuz',
    'Bölüm Dersleri': 'Bölüm',
    'Dil + İnsan Toplum Bilimleri (İTB) Dersleri': 'ITB',
    'Temel Bilimler (TB) Dersleri': 'TB',
    'Temel Mühendislik (TM) Dersleri': 'TM',
    'Mühendislik Tasarımı (MT) Dersleri': 'MT',
    'Yüksek Lisans Dersleri': 'Yüksek',
    'ATA / TUR Dersleri': 'ATA/TUR',
  };
  const enMap: Record<string, string> = {
    'Havuz Dersleri': 'Common',
    'Bölüm Dersleri': 'Department',
    'Dil + İnsan Toplum Bilimleri (İTB) Dersleri': 'ITB',
    'Temel Bilimler (TB) Dersleri': 'TB',
    'Temel Mühendislik (TM) Dersleri': 'TM',
    'Mühendislik Tasarımı (MT) Dersleri': 'MT',
    'Yüksek Lisans Dersleri': 'Master',
    'ATA / TUR Dersleri': 'ATA/TUR',
  };
  const map = language === 'en' ? enMap : trMap;
  return map[kategori] ?? kategori;
};

const getInstructorLabel = (value: string | string[] | undefined, locale: typeof translate.tr | typeof translate.en) =>
  normalizeInstructors(value).length > 1 ? locale.instructorPlural : locale.instructorSingular;

const normalizeArchiveToken = (value: string) => value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

const debugArchiveMatches = process.env.NODE_ENV === 'development';

const archivePublicBaseUrl = 'https://pub-9166db2e46694c818420c32e7545d40c.r2.dev';

const courseArchiveAliases: Record<string, string[]> = {
  BIL110E: ['BIL110'],
  FIZ201E: ['FIZ201E (Modern Fizik)'],
  ITB228E: ['ITB222E'],
  UCK203E: ['UCK203E (Circuits, Signals and Systems)'],
  UCK207E: ['UCK207E (Thermodynamics)'],
  UCK217E: ['MAL 201', 'MAL201', 'UCK217E (Aerospace Materials)'],
  UCK303E: ['UCK303E (Automatic Control)'],
  UCK304E: ['UCK304E (Experimental Engineering)'],
  UCK305E: ['UCK305E (Aerodynamics)'],
  UCK348E: ['UCK348E (Eng. Compt. App.)'],
  UCK419E: ['UCK419E (Compt. Aero)'],
  UUM509E: ['UUM509E (Turbulent Flow)'],
  UUM511: ['UUM511 (Viskoz Akışlar)'],
  UUM535E: ['UUM535E (Engineering Mathematics)'],
  UZB220E: ['UZB220E (Mechanical Vibrations)'],
  UZB301E: ['UZB301E (Measurement Techniques)'],
  UZB310E: ['UZB310E (Compressible Aerodynamics)'],
  UZB314E: ['UZB314E (Heat Transfer)'],
  UZB318E: ['UZB318E (FEM)'],
  UZB337E: ['UZB337E (Aerospace Structures)'],
  UZB352E: ['UZB352E (Orbital Mechanics)'],
  UZB411E: ['UZB411E (Space Environment)'],
  UZB419E: ['UZB419E (SSD I)'],
  UZB420E: ['UZB420E (SSD II)'],
  UZB421E: ['UZB421E (ADCS)'],
  UZB441E: ['UZB441E (Rocket Propulsion)'],
  UZB451E: ['UZB451E (Spacecraft Communication)'],
  UZB475E: ['UZB475E (Hypersonic Flows)'],
};

const getArchivePath = (item: ArsivDosyasi) => {
  if (item.yerel_yol) return item.yerel_yol;
  if (!item.url) return item.dosya_adi;

  try {
    return decodeURIComponent(new URL(item.url).pathname.replace(/^\/+/, ''));
  } catch {
    return item.url.split('/').slice(3).join('/') || item.dosya_adi;
  }
};

const buildArchivePublicUrl = (path: string) =>
  `${archivePublicBaseUrl}/${path.split(/[\\/]/).filter(Boolean).map((segment) => encodeURIComponent(segment)).join('/')}`;

const getArchiveFileUrl = (item: ArsivDosyasi) => {
  const path = getArchivePath(item);
  return item.url ? buildArchivePublicUrl(path) : `/arsiv/${path.split(/[\\/]/).filter(Boolean).map((segment) => encodeURIComponent(segment)).join('/')}`;
};

const getArchiveDownloadUrl = (item: ArsivDosyasi) =>
  `/api/download?url=${encodeURIComponent(getArchiveFileUrl(item))}&name=${encodeURIComponent(item.dosya_adi)}`;

const getFileExtension = (fileName: string) => {
  const extension = fileName.split('.').pop();
  return extension ? extension.toLowerCase() : '';
};

const getArchiveTerm = (path: string, language: 'tr' | 'en') => {
  const normalizedPath = path.toLowerCase();
  if (/(^|[\\/ ])fall|güz|guz/.test(normalizedPath)) return language === 'tr' ? 'Güz' : 'Fall';
  if (/(^|[\\/ ])spring|bahar/.test(normalizedPath)) return language === 'tr' ? 'Bahar' : 'Spring';
  if (/(^|[\\/ ])summer|yaz/.test(normalizedPath)) return language === 'tr' ? 'Yaz' : 'Summer';
  return language === 'tr' ? 'Dönemsiz' : 'No term';
};

const getArchiveFileIcon = (extension: string) => {
  const iconMap: Record<string, { label: string; className: string }> = {
    pdf: { label: 'PDF', className: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-200 dark:border-red-800' },
    doc: { label: 'DOC', className: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-200 dark:border-blue-800' },
    docx: { label: 'DOC', className: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-200 dark:border-blue-800' },
    xls: { label: 'XLS', className: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-800' },
    xlsx: { label: 'XLS', className: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-800' },
    ppt: { label: 'PPT', className: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/50 dark:text-orange-200 dark:border-orange-800' },
    pptx: { label: 'PPT', className: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/50 dark:text-orange-200 dark:border-orange-800' },
    png: { label: 'IMG', className: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-950/50 dark:text-fuchsia-200 dark:border-fuchsia-800' },
    jpg: { label: 'IMG', className: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-950/50 dark:text-fuchsia-200 dark:border-fuchsia-800' },
    jpeg: { label: 'IMG', className: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-950/50 dark:text-fuchsia-200 dark:border-fuchsia-800' },
    zip: { label: 'ZIP', className: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700' },
    rar: { label: 'RAR', className: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700' },
  };
  const icon = iconMap[extension] ?? { label: extension ? extension.toUpperCase().slice(0, 4) : 'FILE', className: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700' };

  return (
    <span className={`inline-flex h-9 w-11 shrink-0 items-center justify-center rounded-xl border text-[10px] font-black tracking-tight ${icon.className}`}>
      {icon.label}
    </span>
  );
};

export default function Home() {
  const dersList = dersler as Ders[];
  const archiveList = arsivVerileri as ArsivDosyasi[];

  const [language, setLanguage] = useState<'tr' | 'en'>('tr');
  const locale = translate[language];
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [isThemeChanging, setIsThemeChanging] = useState(false);
  const [isLanguageChanging, setIsLanguageChanging] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const savedTheme = (localStorage.getItem('theme') as 'light' | 'dark') ?? 'light';
    setTheme(savedTheme);
    
    if (savedTheme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
      document.documentElement.style.colorScheme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.setAttribute('data-theme', 'light');
      document.documentElement.style.colorScheme = 'light';
    }
  }, []);

  const setThemeMode = (nextTheme: 'light' | 'dark') => {
    setTheme(nextTheme);
    localStorage.setItem('theme', nextTheme);

    if (nextTheme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
      document.documentElement.style.colorScheme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.setAttribute('data-theme', 'light');
      document.documentElement.style.colorScheme = 'light';
    }
  };

  const categories = useMemo(
    () => [
      { id: 'all', label: { tr: 'Tümü', en: 'All' } },
      ...Array.from(new Set(dersList.map((ders) => ders.kategori))).map((kategori) => ({
        id: kategori,
        label: { tr: getCategoryShortLabel(kategori, 'tr'), en: getCategoryShortLabel(kategori, 'en') },
      })),
    ],
    [dersList]
  );

  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [instructorQuery, setInstructorQuery] = useState('');
  const [selectedInstructor, setSelectedInstructor] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const instructorInputRef = useRef<HTMLInputElement | null>(null);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isInstructorInputFocused, setIsInstructorInputFocused] = useState(false);
  const [animatedText, setAnimatedText] = useState('');
  const [instructorAnimatedText, setInstructorAnimatedText] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedMenuIndex, setSelectedMenuIndex] = useState<number | null>(null);
  const [selectedAcademicName, setSelectedAcademicName] = useState<string | null>(null);
  const [isAcademicModalClosing, setIsAcademicModalClosing] = useState(false);
  const [selectedDersId, setSelectedDersId] = useState<number | null>(null);
  const [modalRect, setModalRect] = useState<DOMRect | null>(null);
  const [modalStyle, setModalStyle] = useState<Record<string, string | number> | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [selectedArchiveYear, setSelectedArchiveYear] = useState<string | null>(null);
  const [selectedArchiveInstructor, setSelectedArchiveInstructor] = useState<string | null>(null);
  const [selectedArchiveTerm, setSelectedArchiveTerm] = useState<string | null>(null);
  const [openArchiveFolders, setOpenArchiveFolders] = useState<Record<string, boolean>>({});
  const [archivePreview, setArchivePreview] = useState<ArsivOnizleme | null>(null);
  const [isHeaderPinned, setIsHeaderPinned] = useState(false);
  const headerSentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const sentinel = headerSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsHeaderPinned(!entry.isIntersecting);
      },
      { threshold: 0 }
    );

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, []);

  const openModal = (event: MouseEvent<HTMLElement>, dersId: number) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setSelectedDersId(dersId);
    setModalRect(rect);
    setModalStyle({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      opacity: 0,
    });
    setIsClosing(false);
  };

  const closeModal = () => {
    if (!modalRect) {
      setSelectedDersId(null);
      setModalStyle(null);
      return;
    }
    setIsClosing(true);
    setModalStyle({
      top: modalRect.top,
      left: modalRect.left,
      width: modalRect.width,
      height: modalRect.height,
      opacity: 0,
    });
  };

  useEffect(() => {
    if (selectedDersId !== null && modalRect) {
      const targetWidth = Math.min(window.innerWidth * 0.9, 760);
      const targetHeight = Math.min(window.innerHeight * 0.85, 700);
      const targetTop = (window.innerHeight - targetHeight) / 2;
      const targetLeft = (window.innerWidth - targetWidth) / 2;

      requestAnimationFrame(() => {
        setModalStyle({
          top: targetTop,
          left: targetLeft,
          width: targetWidth,
          height: targetHeight,
          opacity: 1,
        });
      });
    }
  }, [selectedDersId, modalRect]);

  const onModalTransitionEnd = () => {
    if (isClosing) {
      setSelectedDersId(null);
      setModalRect(null);
      setModalStyle(null);
      setIsClosing(false);
    }
  };

  useEffect(() => {
    setSelectedArchiveYear(null);
    setSelectedArchiveInstructor(null);
    setSelectedArchiveTerm(null);
    setOpenArchiveFolders({});
    setArchivePreview(null);
  }, [selectedDersId]);

  const categoryColors = useMemo(
    () =>
      categories
        .filter((category) => category.id !== 'all')
        .reduce<Record<string, string>>((map, category) => {
          const ders = dersList.find((item) => item.kategori === category.id);
          map[category.id] = ders?.renk_kodu ?? '#64748b';
          return map;
        }, {}),
    [categories, dersList]
  );

  const getCourseCodeKey = (ders: Ders) => normalizeArchiveToken(`${ders.kod}${ders.no}`);

  const getCourseYearStart = (year: string) => {
    const firstYear = year.match(/\d{4}/)?.[0];
    if (firstYear) return Number(firstYear);
    const shortYear = year.match(/\d{2}/)?.[0];
    return shortYear ? 2000 + Number(shortYear) : 0;
  };

  const getTermOrder = (term: string) => {
    const normalizedTerm = term.toLocaleLowerCase('tr');
    if (normalizedTerm.includes('güz') || normalizedTerm.includes('fall')) return 1;
    if (normalizedTerm.includes('bahar') || normalizedTerm.includes('spring')) return 2;
    if (normalizedTerm.includes('yaz') || normalizedTerm.includes('summer')) return 3;
    return 4;
  };

  const compareCourseChronology = (left: Ders, right: Ders) =>
    getCourseYearStart(left.yil) - getCourseYearStart(right.yil) ||
    getTermOrder(left.donem) - getTermOrder(right.donem) ||
    left.ders_adi.localeCompare(right.ders_adi, 'tr');

  const getCourseOfferings = (course: Ders) =>
    dersList
      .filter((item) => getCourseCodeKey(item) === getCourseCodeKey(course))
      .sort(compareCourseChronology);

  const instructorCatalog = useMemo(() => {
    return (akademisyenVerileri.akademisyenler as Akademisyen[])
      .map((academic) => {
        const courses = dersList
          .filter((ders) => normalizeInstructors(ders.ogretim_uyesi).includes(academic.ad))
          .map((ders) => ders.id);
        return { name: academic.ad, count: courses.length, courses };
      })
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, 'tr'));
  }, [dersList]);

  const selectedAcademic = useMemo(() => {
    if (!selectedAcademicName) return null;
    const academic = (akademisyenVerileri.akademisyenler as Akademisyen[]).find((item) => item.ad === selectedAcademicName);
    if (!academic) return null;

    const defaults = akademisyenVerileri.varsayilan_degerlendirme;
    return {
      ...academic,
      notlandirma: academic.notlandirma ?? defaults.notlandirma,
      yoklama_onemi: academic.yoklama_onemi ?? defaults.yoklama_onemi,
      ders_anlatimi: academic.ders_anlatimi ?? defaults.ders_anlatimi,
      dersler: dersList
        .filter((ders) => normalizeInstructors(ders.ogretim_uyesi).includes(academic.ad))
        .sort(compareCourseChronology),
    };
  }, [dersList, selectedAcademicName]);

  const academicNames = useMemo(
    () => Array.from(new Set((akademisyenVerileri.akademisyenler as Akademisyen[]).map((academic) => academic.ad).filter(Boolean))),
    []
  );

  const closeAcademicModal = () => {
    setIsAcademicModalClosing(true);
    window.setTimeout(() => {
      setSelectedAcademicName(null);
      setIsAcademicModalClosing(false);
    }, 240);
  };

  const normalizedInstructorQuery = instructorQuery.trim().toLowerCase();
  const instructorResults = useMemo(() => {
    if (!normalizedInstructorQuery) return [];
    const results = instructorCatalog.filter((item) => item.name.toLowerCase().includes(normalizedInstructorQuery));
    return results.slice(0, 12);
  }, [instructorCatalog, normalizedInstructorQuery]);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const normalizedQueryNoSpace = normalizedQuery.replace(/\s+/g, '');
  const displayedDersler = dersList.filter((ders) => {
    const instructorText = normalizeInstructors(ders.ogretim_uyesi).join(' ').toLowerCase();
    const codeNo = `${ders.kod}${ders.no}`.toLowerCase();
    const codeNoWithSpace = `${ders.kod} ${ders.no}`.toLowerCase();
    const matchesSearch = !normalizedQuery ||
      ders.ders_adi.toLowerCase().includes(normalizedQuery) ||
      ders.ders_adi_en?.toLowerCase().includes(normalizedQuery) ||
      ders.kod.toLowerCase().includes(normalizedQuery) ||
      codeNo.includes(normalizedQueryNoSpace) ||
      codeNoWithSpace.includes(normalizedQuery) ||
      instructorText.includes(normalizedQuery);

    const matchesCategory = selectedCategory === 'all' || ders.kategori === selectedCategory;
    const matchesInstructor = !selectedInstructor || normalizeInstructors(ders.ogretim_uyesi).includes(selectedInstructor);
    return matchesSearch && matchesCategory && matchesInstructor;
  });

  const displayedCourseCards = useMemo(() => {
    const courseMap = new Map<string, Ders>();

    displayedDersler
      .sort(compareCourseChronology)
      .forEach((ders) => {
        const courseKey = getCourseCodeKey(ders);
        if (!courseMap.has(courseKey)) {
          courseMap.set(courseKey, ders);
        }
      });

    return Array.from(courseMap.values());
  }, [displayedDersler]);

  const groupedDisplayedDersler = useMemo(() => {
    if (selectedCategory !== 'all') return null;

    return categories.slice(1).reduce<Record<string, Ders[]>>((groupMap, category) => {
      const groupItems = displayedCourseCards.filter((ders) => ders.kategori === category.id);
      if (groupItems.length) {
        groupMap[category.id] = groupItems;
      }
      return groupMap;
    }, {});
  }, [selectedCategory, displayedCourseCards, categories]);

  const renderDersCard = (ders: Ders) => {
    const accentColor = ders.renk_kodu ?? '#64748b';
    const contrastText = getContrastTextColor(accentColor);
    const cardInstructors = Array.from(
      new Set(getCourseOfferings(ders).flatMap((offering) => normalizeInstructors(offering.ogretim_uyesi)).filter((name) => name && name !== '-'))
    );

    return (
      <article
        key={ders.id}
        onClick={(event) => openModal(event, ders.id)}
        className="flex h-48 w-full min-w-0 flex-col overflow-hidden rounded-3xl border p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg cursor-pointer dark:border-slate-700"
        style={{ borderColor: accentColor, backgroundColor: getCardBackground(accentColor) }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="mb-1 line-clamp-2 break-words [overflow-wrap:anywhere] text-lg font-bold leading-snug text-slate-900 dark:text-white">
              {highlightCourseCode(ders.kod, ders.no, `${ders.kod} ${getDisplayNo(ders)}`, searchQuery)}
            </h2>
            <p className="h-10 line-clamp-2 break-words [overflow-wrap:anywhere] text-sm leading-5 text-slate-700 dark:text-slate-300">
              {highlightText(language === 'en' && ders.ders_adi_en ? ders.ders_adi_en : ders.ders_adi, searchQuery)}
            </p>
          </div>
          <span
            className="inline-flex shrink-0 h-4 items-center rounded-full px-1.5 text-[9px] font-semibold uppercase leading-none"
            style={{ backgroundColor: accentColor, color: contrastText }}
          >
            {getCategoryShortLabel(ders.kategori, language)}
          </span>
        </div>

        <div className="mt-4 space-y-1.5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {cardInstructors.length > 1 ? locale.instructorPlural : locale.instructorSingular}
            </p>
            <div className="mt-1 space-y-0.5">
              {cardInstructors.length ? (
                cardInstructors.map((instructor) => (
                  <p key={instructor} className="break-words text-sm leading-4 text-slate-600 dark:text-slate-300">
                    {highlightText(instructor, searchQuery)}
                  </p>
                ))
              ) : (
                <p className="text-sm leading-4 text-slate-600 dark:text-slate-300">{locale.noInfo}</p>
              )}
            </div>
          </div>
        </div>
      </article>
    );
  };

  const getSuffixFor = (d: Ders) => {
    if (d.kod === 'TUR' || d.kod === 'ATA') return '';
    if (`${d.kod}${d.no}` === 'UUM511') return '';
    const name = (d.ders_adi || '').toLowerCase();
    if (/laboratuvar|laboratuvarı|lab/.test(name)) return 'EL';
    if (/uygulama|pratik/.test(name)) return 'A';
    return 'E';
  };

  const getDisplayNo = (d: Ders) => {
    if (/[0-9]{3}(EL|A|E)$/i.test(String(d.no))) return String(d.no);
    return `${d.no}${getSuffixFor(d)}`;
  };

  const getArchiveKeysForCourse = (ders: Ders) =>
    Array.from(
      new Set(
        [
          `${ders.kod}${ders.no}`,
          `${ders.kod}${getDisplayNo(ders)}`,
          ...(courseArchiveAliases[normalizeArchiveToken(`${ders.kod}${getDisplayNo(ders)}`)] ?? []),
          ...(courseArchiveAliases[normalizeArchiveToken(`${ders.kod}${ders.no}`)] ?? []),
        ].map(normalizeArchiveToken)
      )
    );

  const courseArchiveMap = useMemo(() => {
    const usableArchiveItems = archiveList.filter((item) => {
      const extension = getFileExtension(item.dosya_adi);
      return item.dosya_adi.toLowerCase() !== 'desktop.ini' && extension !== 'ini';
    });

    return dersList.reduce<Record<number, ArsivDosyasi[]>>((map, ders) => {
      const courseKeys = new Set(getArchiveKeysForCourse(ders));

      map[ders.id] = usableArchiveItems.filter((item) => {
        const pathSegments = getArchivePath(item).split(/[\\/]/).filter(Boolean);
        return pathSegments.some((segment) => courseKeys.has(normalizeArchiveToken(segment)));
      });

      if (debugArchiveMatches && map[ders.id].length === 0) {
        console.warn('[Ders Arşivi] Arşiv eşleşmesi bulunamadı:', {
          ders: `${ders.kod} ${getDisplayNo(ders)} - ${ders.ders_adi}`,
          arananAnahtarlar: Array.from(courseKeys),
          aliasEklemekIcin: `courseArchiveAliases.${normalizeArchiveToken(`${ders.kod}${getDisplayNo(ders)}`)} = ['ARŞİV_KLASÖR_ADI']`,
        });
      }

      return map;
    }, {});
  }, [archiveList, dersList]);

  const getArchiveFolderSegments = (item: ArsivDosyasi, ders: Ders) => {
    const courseKeys = new Set(getArchiveKeysForCourse(ders));
    const segments = getArchivePath(item).split(/[\\/]/).filter(Boolean);
    const courseSegmentIndex = segments.findIndex((segment) => courseKeys.has(normalizeArchiveToken(segment)));
    return courseSegmentIndex >= 0 ? segments.slice(courseSegmentIndex + 1, -1) : segments.slice(1, -1);
  };

  const renderArchiveExplorer = (ders: Ders, archiveItems: ArsivDosyasi[], accentColor: string) => {
    const textColor = getContrastTextColor(lightenHex(accentColor, 0.7));
    const courseOfferings = getCourseOfferings(ders);
    const courseInstructorOptions = Array.from(
      new Set(courseOfferings.flatMap((offering) => normalizeInstructors(offering.ogretim_uyesi)).filter((name) => name && name !== '-'))
    );
    const getArchiveInstructor = (item: ArsivDosyasi) => {
      const normalizedPath = normalizeArchiveToken(getArchivePath(item));
      return courseInstructorOptions.find((name) => normalizedPath.includes(normalizeArchiveToken(name))) ?? null;
    };
    const archiveInstructorOptions = Array.from(
      new Set([
        ...archiveItems.map((item) => getArchiveInstructor(item)).filter((name): name is string => Boolean(name)),
        ...courseInstructorOptions,
      ])
    );
    const instructorFilteredItems =
      selectedArchiveInstructor === null
        ? archiveItems
        : archiveItems.filter((item) => {
            const archiveInstructor = getArchiveInstructor(item);
            if (archiveInstructor) return archiveInstructor === selectedArchiveInstructor;
            return courseInstructorOptions.includes(selectedArchiveInstructor);
          });
    const years = Array.from(new Set(instructorFilteredItems.map((item) => item.yil))).sort((left, right) => getCourseYearStart(left) - getCourseYearStart(right));
    const activeYear = selectedArchiveYear && years.includes(selectedArchiveYear) ? selectedArchiveYear : null;
    const yearItems = activeYear ? instructorFilteredItems.filter((item) => item.yil === activeYear) : [];
    const terms: string[] = Array.from(new Set(yearItems.map((item) => getArchiveTerm(getArchivePath(item), language))));
    const activeTerm = selectedArchiveTerm && terms.includes(selectedArchiveTerm) ? selectedArchiveTerm : null;
    const termItems = activeTerm ? yearItems.filter((item) => getArchiveTerm(getArchivePath(item), language) === activeTerm) : yearItems;
    const archiveTree = termItems.reduce<ArchiveFolderNode>((tree, item) => {
      const folderSegments = getArchiveFolderSegments(item, ders);
      let currentNode = tree;

      for (const segment of folderSegments) {
        if (!currentNode.folders[segment]) {
          currentNode.folders[segment] = { name: segment, files: [], folders: {} };
        }
        currentNode = currentNode.folders[segment];
      }

      currentNode.files.push(item);
      return tree;
    }, { name: '', files: [], folders: {} });
    const rootFiles = archiveTree.files;
    const rootFolders = Object.values(archiveTree.folders);
    const renderArchiveFileRow = (file: ArsivDosyasi) => {
      const extension = getFileExtension(file.dosya_adi);
      const url = getArchiveFileUrl(file);
      const downloadUrl = getArchiveDownloadUrl(file);
      const archivePath = getArchivePath(file);

      return (
        <div
          key={archivePath}
          className="flex flex-col gap-3 rounded-2xl border border-white/30 bg-white/20 p-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex min-w-0 items-start gap-3">
            {getArchiveFileIcon(extension)}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="break-words text-sm font-medium" style={{ color: textColor }}>
                  {file.dosya_adi}
                </p>
                {file.boyut ? (
                  <span
                    className="rounded-full border px-2 py-0.5 text-[11px] font-semibold opacity-80"
                    style={{ borderColor: `${accentColor}80`, color: textColor }}
                  >
                    {file.boyut}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 break-words text-xs opacity-75" style={{ color: textColor }}>
                {archivePath}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2 sm:pl-3">
            <button
              type="button"
              onClick={() => setArchivePreview({ ad: file.dosya_adi, url, downloadUrl, uzanti: extension })}
              className="rounded-full bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-700"
            >
              {locale.preview}
            </button>
            <a
              href={downloadUrl}
              className="rounded-full border px-3 py-2 text-xs font-semibold transition hover:opacity-90"
              style={{ borderColor: accentColor, color: textColor }}
            >
              {locale.download}
            </a>
          </div>
        </div>
      );
    };

    const countArchiveNodeFiles = (node: ArchiveFolderNode): number =>
      node.files.length + Object.values(node.folders).reduce((total, childNode) => total + countArchiveNodeFiles(childNode), 0);

    const renderArchiveFolderNode = (node: ArchiveFolderNode, parentKey = '', depth = 0): ReactNode => {
      const folderKey = `${ders.id}-${activeYear}-${activeTerm ?? 'all'}-${parentKey}-${node.name}`;
      const isFolderOpen = Boolean(openArchiveFolders[folderKey]);
      const childFolders = Object.values(node.folders);
      const fileCount = countArchiveNodeFiles(node);

      return (
        <div
          key={folderKey}
          className="overflow-hidden rounded-2xl border bg-white/10"
          style={{ borderColor: `${accentColor}80`, marginLeft: depth ? 12 : 0 }}
        >
          <button
            type="button"
            onClick={() => setOpenArchiveFolders((current) => ({ ...current, [folderKey]: !current[folderKey] }))}
            className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/20"
            aria-expanded={isFolderOpen}
          >
            <span className="flex min-w-0 items-center gap-3">
              <span
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-sm"
                style={{ borderColor: `${accentColor}80`, color: textColor }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M3 7.75A2.75 2.75 0 0 1 5.75 5h4.1c.73 0 1.43.29 1.94.8l1.1 1.1c.24.22.55.35.88.35h4.48A2.75 2.75 0 0 1 21 10v6.25A2.75 2.75 0 0 1 18.25 19H5.75A2.75 2.75 0 0 1 3 16.25v-8.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold" style={{ color: textColor }}>
                  {node.name}
                </span>
                <span className="mt-0.5 block text-xs opacity-70" style={{ color: textColor }}>
                  {fileCount} {language === 'tr' ? 'dosya' : fileCount === 1 ? 'file' : 'files'}
                </span>
              </span>
            </span>
            <span
              className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-transform duration-300 ${isFolderOpen ? 'rotate-180' : 'rotate-0'}`}
              style={{ borderColor: `${accentColor}80`, color: textColor }}
              aria-hidden
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </button>

          <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${isFolderOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
            <div className="min-h-0 overflow-hidden">
              <div className="space-y-2 border-t p-3" style={{ borderColor: `${accentColor}50` }}>
                {node.files.map((file) => renderArchiveFileRow(file))}
                {childFolders.map((childNode) => renderArchiveFolderNode(childNode, folderKey, depth + 1))}
              </div>
            </div>
          </div>
        </div>
      );
    };

    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.15em]" style={{ color: textColor }}>
            {locale.archiveTitle}
          </h3>
          <p className="mt-2 text-sm leading-6" style={{ color: textColor }}>
            {archiveItems.length ? locale.archiveDescription : locale.archiveNoFiles}
          </p>
        </div>

        {archiveItems.length ? (
          <>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: textColor }}>
                {locale.archiveSelectInstructor}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedArchiveInstructor(null);
                    setSelectedArchiveYear(null);
                    setSelectedArchiveTerm(null);
                  }}
                  className="rounded-full border px-4 py-2 text-xs font-semibold transition hover:opacity-90"
                  style={{
                    borderColor: accentColor,
                    backgroundColor: selectedArchiveInstructor === null ? accentColor : 'transparent',
                    color: selectedArchiveInstructor === null ? getContrastTextColor(accentColor) : textColor,
                  }}
                >
                  {locale.archiveAll}
                </button>
                {archiveInstructorOptions.map((instructor) => {
                  const active = selectedArchiveInstructor === instructor;
                  return (
                    <button
                      key={instructor}
                      type="button"
                      onClick={() => {
                        setSelectedArchiveInstructor(instructor);
                        setSelectedArchiveYear(null);
                        setSelectedArchiveTerm(null);
                      }}
                      className="rounded-full border px-4 py-2 text-xs font-semibold transition hover:opacity-90"
                      style={{
                        borderColor: accentColor,
                        backgroundColor: active ? accentColor : 'transparent',
                        color: active ? getContrastTextColor(accentColor) : textColor,
                      }}
                    >
                      {instructor}
                    </button>
                  );
                })}
              </div>
            </div>

            {years.length ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: textColor }}>
                  {locale.yearLabel}
                </p>
                <div className="flex flex-wrap gap-2">
                  {years.map((year) => {
                const active = activeYear === year;
                return (
                  <button
                    key={year}
                    type="button"
                    onClick={() => {
                      setSelectedArchiveYear(year);
                      setSelectedArchiveTerm(null);
                    }}
                    className="rounded-full border px-4 py-2 text-xs font-semibold transition hover:opacity-90"
                    style={{
                      borderColor: accentColor,
                      backgroundColor: active ? accentColor : 'transparent',
                      color: active ? getContrastTextColor(accentColor) : textColor,
                    }}
                  >
                    {year}
                  </button>
                );
                  })}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed p-4 text-sm" style={{ borderColor: `${accentColor}80`, color: textColor }}>
                {locale.archiveNoFilteredFiles}
              </div>
            )}

            {activeYear && terms.length ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: textColor }}>
                  {locale.archiveSelectTerm}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedArchiveTerm(null)}
                    className="rounded-full border px-4 py-2 text-xs font-semibold transition hover:opacity-90"
                    style={{
                      borderColor: accentColor,
                      backgroundColor: activeTerm === null ? accentColor : 'transparent',
                      color: activeTerm === null ? getContrastTextColor(accentColor) : textColor,
                    }}
                  >
                    {locale.archiveAll}
                  </button>
                  {terms.map((term) => {
                    const active = activeTerm === term;
                    return (
                      <button
                        key={term}
                        type="button"
                        onClick={() => setSelectedArchiveTerm(term)}
                        className="rounded-full border px-4 py-2 text-xs font-semibold transition hover:opacity-90"
                        style={{
                          borderColor: accentColor,
                          backgroundColor: active ? accentColor : 'transparent',
                          color: active ? getContrastTextColor(accentColor) : textColor,
                        }}
                      >
                        {term}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {activeYear ? (
              <div className="space-y-3">
                {rootFiles.length ? (
                  <div className="space-y-2">
                    {rootFiles.map((file) => renderArchiveFileRow(file))}
                  </div>
                ) : null}

                {rootFolders.map((folderNode) => renderArchiveFolderNode(folderNode))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed p-4 text-sm" style={{ borderColor: `${accentColor}80`, color: textColor }}>
                {locale.archiveSelectYear}
              </div>
            )}
          </>
        ) : null}
      </div>
    );
  };

  const suggestions = useMemo(() => {
    const s: string[] = [];
    for (const d of dersList) {
      s.push(`${d.kod} ${d.no}`);
      if (d.ders_adi) s.push(d.ders_adi);
      if (d.ders_adi_en) s.push(d.ders_adi_en);
      for (const instructor of normalizeInstructors(d.ogretim_uyesi)) {
        if (instructor) s.push(instructor);
      }
    }
    return shuffleArray(Array.from(new Set(s)));
  }, [dersList]);

  const instructorSuggestions = useMemo(() => shuffleArray(instructorCatalog.map((item) => item.name)), [instructorCatalog]);

  useEffect(() => {
    if (isInputFocused) return;
    let mounted = true;
    let idx = 0;
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    (async function run() {
      while (mounted && !isInputFocused) {
        const text = suggestions[idx % suggestions.length] ?? '';
        await sleep(1000);
        for (let i = 1; i <= text.length; i += 1) {
          if (!mounted || isInputFocused) return;
          setAnimatedText(text.slice(0, i));
          await sleep(30 + Math.random() * 20);
        }
        await sleep(2000);
        for (let i = text.length; i >= 0; i -= 1) {
          if (!mounted || isInputFocused) return;
          setAnimatedText(text.slice(0, i));
          await sleep(15 + Math.random() * 15);
        }
        await sleep(250 + Math.random() * 250);
        idx += 1;
      }
      if (mounted) setAnimatedText('');
    })();

    return () => {
      mounted = false;
    };
  }, [isInputFocused, suggestions]);

  useEffect(() => {
    if (isInstructorInputFocused || instructorQuery) {
      setInstructorAnimatedText('');
      return;
    }

    let mounted = true;
    let idx = 0;
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    (async function run() {
      while (mounted && !isInstructorInputFocused) {
        const text = instructorSuggestions[idx % instructorSuggestions.length] ?? '';
        await sleep(1000);
        for (let i = 1; i <= text.length; i += 1) {
          if (!mounted || isInstructorInputFocused) return;
          setInstructorAnimatedText(text.slice(0, i));
          await sleep(30 + Math.random() * 20);
        }
        await sleep(2000);
        for (let i = text.length; i >= 0; i -= 1) {
          if (!mounted || isInstructorInputFocused) return;
          setInstructorAnimatedText(text.slice(0, i));
          await sleep(15 + Math.random() * 15);
        }
        await sleep(250 + Math.random() * 250);
        idx += 1;
      }
      if (mounted) setInstructorAnimatedText('');
    })();

    return () => {
      mounted = false;
    };
  }, [isInstructorInputFocused, instructorQuery, instructorSuggestions]);

  return (
    <main className="min-h-screen px-6 py-10 max-w-7xl mx-auto bg-[var(--background)] text-[var(--foreground)] transition-colors duration-300">
      <div className="sticky top-0 z-30 -mx-6 mb-6 bg-[var(--background)]/95 px-6 pb-4 pt-2 backdrop-blur-md">
        <div className="mx-auto max-w-7xl rounded-3xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-950/90">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="max-w-xl px-6 pt-5">
              <h1 className="text-3xl font-semibold text-slate-900 dark:text-white">{locale.title}</h1>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{locale.description}</p>
            </div>

            <div className="ml-auto flex shrink-0 flex-col items-end gap-3 px-6 pb-5 pt-5">
              <div className="flex flex-nowrap items-center gap-2">
                <div className="relative flex w-[6.75rem] flex-none items-center overflow-hidden rounded-full border border-[color:var(--border)] bg-[var(--surface)] p-1 shadow-sm backdrop-blur-sm">
                  <span className={`absolute left-1 top-1 z-0 h-9 w-12 rounded-full bg-[var(--foreground)] transition-transform duration-300 ease-out ${language === 'en' ? 'translate-x-12' : 'translate-x-0'}`} />
                  <button
                    type="button"
                    onClick={() => {
                      setIsLanguageChanging(true);
                      setTimeout(() => {
                        setLanguage('tr');
                        setIsLanguageChanging(false);
                      }, 150);
                    }}
                    className={`relative z-10 flex h-9 w-12 items-center justify-center rounded-full border px-0 text-xs font-semibold uppercase transition-colors duration-300 ${language === 'tr' ? 'border-transparent bg-[var(--foreground)] text-[var(--background)]' : 'border-transparent bg-transparent text-[var(--foreground)] opacity-75 hover:opacity-100'}`}
                  >
                    TR
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsLanguageChanging(true);
                      setTimeout(() => {
                        setLanguage('en');
                        setIsLanguageChanging(false);
                      }, 150);
                    }}
                    className={`relative z-10 flex h-9 w-12 items-center justify-center rounded-full border px-0 text-xs font-semibold uppercase transition-colors duration-300 ${language === 'en' ? 'border-transparent bg-[var(--foreground)] text-[var(--background)]' : 'border-transparent bg-transparent text-[var(--foreground)] opacity-75 hover:opacity-100'}`}
                  >
                    EN
                  </button>
                </div>

                <div className="relative flex items-center overflow-hidden rounded-full border border-[color:var(--border)] bg-[var(--surface)] p-1 shadow-sm backdrop-blur-sm">
                  <span className={`absolute left-1 top-1 z-0 h-9 w-9 rounded-full transition-transform duration-300 ease-out ${theme === 'light' ? 'translate-x-0 bg-amber-400' : 'translate-x-9 bg-[var(--foreground)]'}`} />
                  <button
                    type="button"
                    onClick={() => {
                      setIsThemeChanging(true);
                      setTimeout(() => {
                        setThemeMode('light');
                        setIsThemeChanging(false);
                      }, 150);
                    }}
                    className={`relative z-10 flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-200 ${theme === 'light' ? 'text-white' : 'text-[var(--foreground)] opacity-75 hover:opacity-100'}`}
                    aria-label="Light mode"
                  >
                    <SunIcon />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsThemeChanging(true);
                      setTimeout(() => {
                        setThemeMode('dark');
                        setIsThemeChanging(false);
                      }, 150);
                    }}
                    className={`relative z-10 flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-200 ${theme === 'dark' ? 'text-amber-400' : 'text-[var(--foreground)] opacity-75 hover:opacity-100'}`}
                    aria-label="Dark mode"
                  >
                    <MoonIcon />
                  </button>
                </div>
              </div>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((open) => !open)}
                  className="relative h-12 w-12 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 text-slate-700 dark:text-slate-300 shadow-sm transition hover:bg-slate-50 dark:hover:bg-slate-800"
                  aria-label={menuOpen ? locale.menuClose : locale.menuOpen}
                >
                  <span className={`absolute left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-full bg-slate-700 dark:bg-slate-400 transition-all duration-200 ${menuOpen ? 'top-1/2 -translate-y-1/2 rotate-45' : 'top-4'}`} />
                  <span className={`absolute left-1/2 h-0.5 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-700 dark:bg-slate-400 transition-all duration-200 ${menuOpen ? 'opacity-0' : 'top-1/2 opacity-100'}`} />
                  <span className={`absolute left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-full bg-slate-700 dark:bg-slate-400 transition-all duration-200 ${menuOpen ? 'top-1/2 -translate-y-1/2 -rotate-45' : 'bottom-4'}`} />
                </button>

                {menuOpen ? (
                  <div className="absolute right-0 top-14 z-40 w-64 rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-2xl">
                    <nav className="space-y-3">
                      {locale.menu.map((item, index) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => {
                            setSelectedMenuIndex(index);
                            setMenuOpen(false);
                          }}
                          className="block w-full rounded-2xl px-4 py-3 text-left text-sm font-semibold text-slate-800 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          {item}
                        </button>
                      ))}
                    </nav>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

        <div className="relative z-0 mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <section className="min-w-0">
            <div className="relative mb-5 max-w-md">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                  <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <input
                type="search"
                value={searchQuery}
                ref={inputRef}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={searchQuery || isInputFocused ? locale.searchPlaceholder : ''}
                className="w-full rounded-full border border-[color:var(--border)] bg-[var(--surface)] px-10 py-2 text-sm text-[var(--foreground)] shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600 transition-shadow duration-150 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
              {!isInputFocused && !searchQuery && animatedText ? (
                <span className="pointer-events-none select-none absolute left-10 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">
                  {animatedText}
                </span>
              ) : null}
              {searchQuery ? (
                <button
                  type="button"
                  aria-label={locale.clear}
                  onClick={() => { setSearchQuery(''); inputRef.current?.focus(); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              ) : null}
            </div>

            <div className="-mx-2 overflow-x-auto px-2 py-2">
              <div className="inline-flex items-center gap-3 px-1">
                {categories.map((category) => {
                  const active = category.id === selectedCategory;
                  const accentColor = category.id === 'all' ? '#64748b' : categoryColors[category.id] ?? '#64748b';
                  const textColor = getContrastTextColor(accentColor);

                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => setSelectedCategory(category.id)}
                      className={`inline-flex h-11 min-w-max items-center justify-center whitespace-nowrap rounded-full border px-5 text-sm font-semibold leading-none transition-all duration-300 ${
                        active ? 'scale-[1.03] shadow-md animate-tab-slide' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                      style={
                        active
                          ? { backgroundColor: accentColor, color: textColor, borderColor: accentColor }
                          : undefined
                      }
                    >
                      {category.label[language]}
                    </button>
                  );
                })}
              </div>
            </div>

            {searchQuery ? (
              <div className="mt-3 rounded-2xl bg-slate-100 dark:bg-slate-900 px-4 py-3 text-sm text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                {locale.searchNote}
              </div>
            ) : null}

            {selectedCategory === 'all' ? (
              <div className="mt-6 space-y-10">
                {Object.entries(groupedDisplayedDersler ?? {}).map(([category, items]) => (
                  <div key={category}>
                    <div className="mb-4 flex items-center justify-between gap-4">
                      <h3 className="min-w-0 flex-1 text-lg font-semibold text-slate-900 dark:text-white">{categories.find((cat) => cat.id === category)?.label[language] ?? category}</h3>
                      <span className="shrink-0 min-w-[4.5rem] text-right tabular-nums text-sm text-slate-500 dark:text-slate-400">{items.length} {locale.itemsLabel}</span>
                    </div>
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-[repeat(2,16rem)] xl:grid-cols-[repeat(3,16rem)]">
                      {items.map((ders) => renderDersCard(ders))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <section className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-[repeat(2,16rem)] xl:grid-cols-[repeat(3,16rem)]">
                {displayedCourseCards.map((ders) => renderDersCard(ders))}
              </section>
            )}
          </section>

          <aside className="lg:sticky lg:top-[13.5rem]">
            <div className="max-h-[calc(100vh-15rem)] overflow-y-auto rounded-3xl border border-[color:var(--border)] bg-[var(--surface)] p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{locale.instructorPanelTitle}</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{locale.instructorPanelDescription}</p>
                </div>
                {selectedInstructor ? (
                  <button
                    type="button"
                    onClick={() => setSelectedInstructor(null)}
                    className="rounded-full border border-[color:var(--border)] px-3 py-1 text-xs font-semibold text-[var(--foreground)] transition hover:opacity-90"
                  >
                    {locale.instructorClearSelection}
                  </button>
                ) : null}
              </div>

              <div className="mt-4 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" aria-hidden>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <input
                  type="search"
                  value={instructorQuery}
                  ref={instructorInputRef}
                  onFocus={() => setIsInstructorInputFocused(true)}
                  onBlur={() => setIsInstructorInputFocused(false)}
                  onChange={(e) => setInstructorQuery(e.target.value)}
                  placeholder={isInstructorInputFocused || instructorQuery ? locale.instructorSearchPlaceholder : ''}
                  className="w-full rounded-full border border-[color:var(--border)] bg-[var(--surface)] px-10 py-2 text-sm text-[var(--foreground)] shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600 transition-shadow duration-150 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                />
                {!isInstructorInputFocused && !instructorQuery && instructorAnimatedText ? (
                  <span className="pointer-events-none select-none absolute left-10 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">
                    {instructorAnimatedText}
                  </span>
                ) : null}
              </div>

              {normalizedInstructorQuery ? (
                <div className="mt-4 space-y-2">
                  {instructorResults.length ? (
                  instructorResults.map((item) => {
                    const isSelected = selectedInstructor === item.name;
                    return (
                      <button
                        key={item.name}
                        type="button"
                        onClick={() => {
                          setSelectedAcademicName(item.name);
                          setIsAcademicModalClosing(false);
                        }}
                        className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                          isSelected
                            ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
                            : 'border-[color:var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:opacity-90'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-semibold">{item.name}</p>
                            <p className={`mt-1 text-xs ${isSelected ? 'text-white/80 dark:text-slate-700' : 'text-slate-500 dark:text-slate-400'}`}>
                              {item.count} {locale.instructorCourses}
                            </p>
                          </div>
                          {isSelected ? (
                            <span className="shrink-0 rounded-full bg-white/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] dark:bg-slate-900/10">
                              {locale.instructorSelected}
                            </span>
                          ) : null}
                        </div>
                      </button>
                    );
                  })
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 px-4 py-6 text-sm text-slate-500 dark:text-slate-400">
                      {locale.instructorNoResults}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </aside>
        </div>

      {selectedAcademic ? (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 ${
            isAcademicModalClosing ? 'animate-modal-backdrop-out' : 'animate-modal-backdrop'
          }`}
          onClick={closeAcademicModal}
        >
          <section
            className={`max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-slate-200 bg-white/90 shadow-2xl backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/90 ${
              isAcademicModalClosing ? 'animate-section-modal-out' : 'animate-section-modal'
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-5 border-b border-slate-200 p-6 dark:border-slate-700">
              <div>
                <h2 className="text-3xl font-semibold text-slate-900 dark:text-white">
                  {selectedAcademic.ad}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeAcademicModal}
                className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
              >
                {locale.close}
              </button>
            </div>

            <div className="grid gap-4 p-6 md:grid-cols-3">
              {[
                { label: locale.grading, data: selectedAcademic.notlandirma },
                { label: locale.attendance, data: selectedAcademic.yoklama_onemi },
                { label: locale.teaching, data: selectedAcademic.ders_anlatimi },
              ].map(({ label, data }) => (
                <article key={label} className="rounded-3xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-950">
                  <h3 className="font-semibold text-slate-900 dark:text-white">{label}</h3>
                  <div className="mt-3 flex items-center gap-1" aria-label={data.puan === null ? locale.notRated : `${data.puan} / 5`}>
                    {[1, 2, 3, 4, 5].map((point) => (
                      <span
                        key={point}
                        className={`h-3 w-3 rounded-full ${
                          data.puan !== null && point <= data.puan ? 'bg-amber-400' : 'bg-slate-200 dark:bg-slate-700'
                        }`}
                      />
                    ))}
                    <span className="ml-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
                      {data.puan === null ? '— / 5' : `${data.puan} / 5`}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-400">{data.aciklama}</p>
                </article>
              ))}
            </div>

            <div className="border-t border-slate-200 p-6 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{locale.givenCourses}</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {selectedAcademic.dersler.map((ders) => (
                  <div
                    key={ders.id}
                    className="relative rounded-2xl border px-4 py-3"
                    style={{
                      borderColor: ders.renk_kodu ?? '#64748b',
                      backgroundColor: getCardBackground(ders.renk_kodu ?? '#64748b'),
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold" style={{ color: ders.renk_kodu ?? '#64748b' }}>
                        {ders.kod} {getDisplayNo(ders)}
                      </p>
                      <span
                        className="inline-flex h-4 shrink-0 items-center rounded-full px-1.5 text-[9px] font-semibold uppercase leading-none"
                        style={{
                          backgroundColor: ders.renk_kodu ?? '#64748b',
                          color: getContrastTextColor(ders.renk_kodu ?? '#64748b'),
                        }}
                      >
                        {getCategoryShortLabel(ders.kategori, language)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{ders.ders_adi}</p>
                    <p className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                      {ders.yil} · {ders.donem}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {selectedMenuIndex !== null ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-6 animate-modal-backdrop"
          onClick={() => setSelectedMenuIndex(null)}
        >
          <section
            className="w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white/90 shadow-2xl backdrop-blur-xl animate-section-modal dark:border-slate-700 dark:bg-slate-900/90"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-5 border-b border-slate-200 p-6 dark:border-slate-700">
              <div>
                <h2 className="text-3xl font-semibold text-slate-900 dark:text-white">
                  {locale.menu[selectedMenuIndex]}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMenuIndex(null)}
                className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
              >
                {locale.close}
              </button>
            </div>
            <div className="min-h-64 p-6">
              <p className="max-w-xl text-base leading-7 text-slate-600 dark:text-slate-300">
                {locale.menuDescriptions[selectedMenuIndex]}
              </p>
            </div>
          </section>
        </div>
      ) : null}

      {selectedDersId !== null && modalStyle && (
        <div
          className="fixed inset-0 z-50"
          onClick={() => closeModal()}
        >
          <div
            className="absolute inset-0 bg-slate-950/70"
            style={{
              opacity: (modalStyle.opacity as number) ?? 0,
              transition: 'opacity 220ms cubic-bezier(0.2,0.8,0.2,1)',
            }}
          />
          {(() => {
            const ders = dersList.find((item) => item.id === selectedDersId);
            if (!ders) return null;
            const accentColor = ders.renk_kodu ?? '#64748b';
            const contrastText = getContrastTextColor(accentColor);
            const archiveItems = courseArchiveMap[ders.id] ?? [];
            const courseOfferings = getCourseOfferings(ders);

            return (
              <div
                className="absolute overflow-hidden rounded-3xl bg-white dark:bg-slate-900 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
                onTransitionEnd={onModalTransitionEnd}
                style={{
                  ...modalStyle,
                  border: `2px solid ${accentColor}`,
                  backgroundColor: `${lightenHex(accentColor, 0.7)}e8`,
                  '--course-modal-scrollbar-track': `${lightenHex(accentColor, 0.7)}e8`,
                  '--course-modal-scrollbar-thumb': accentColor,
                  color: getContrastTextColor(lightenHex(accentColor, 0.7)),
                  position: 'absolute',
                  transitionProperty: 'top, left, width, height, opacity, transform',
                  transitionDuration: '220ms',
                  transitionTimingFunction: 'cubic-bezier(0.2,0.8,0.2,1)',
                  willChange: 'top, left, width, height, opacity, transform',
                } as CSSProperties}
              >
                <div
                  className="course-modal-scrollbar h-full overflow-y-auto"
                >
                <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
                      {ders.kod} {getDisplayNo(ders)} — {language === 'en' && ders.ders_adi_en ? ders.ders_adi_en : ders.ders_adi}
                    </h2>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{ders.donem} · {ders.yil}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => closeModal()}
                    className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white transition hover:bg-slate-700"
                  >
                    {locale.close}
                  </button>
                </div>

                <div
                  className="space-y-6 border-t px-6 py-6"
                  style={{
                    color: getContrastTextColor(lightenHex(accentColor, 0.7)),
                    borderColor: accentColor,
                  }}
                >
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.15em]" style={{ color: getContrastTextColor(lightenHex(accentColor, 0.7)) }}>{locale.notesTitle}</h3>
                    <p className="text-sm" style={{ color: getContrastTextColor(lightenHex(accentColor, 0.7)) }}>
                      {ders.not_sahipleri?.length ? ders.not_sahipleri.join(', ') : locale.noNotesInfo}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.15em]" style={{ color: getContrastTextColor(lightenHex(accentColor, 0.7)) }}>{locale.pastQuestionsTitle}</h3>
                    <p className="text-sm" style={{ color: getContrastTextColor(lightenHex(accentColor, 0.7)) }}>{ders.cikmis_soru ?? locale.noPastQuestionInfo}</p>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.15em]" style={{ color: getContrastTextColor(lightenHex(accentColor, 0.7)) }}>{locale.courseNoteTitle}</h3>
                    <p className="mt-2 text-sm leading-7" style={{ color: getContrastTextColor(lightenHex(accentColor, 0.7)) }}>{ders.degerlendirme ?? locale.noCourseNoteInfo}</p>
                  </div>
                  <div className="border-t pt-6" style={{ borderColor: `${accentColor}80` }}>
                    {renderArchiveExplorer(ders, archiveItems, accentColor)}
                  </div>
                </div>

                <div
                  className="border-t px-6 py-5"
                  style={{
                    color: getContrastTextColor(lightenHex(accentColor, 0.7)),
                    borderColor: accentColor,
                  }}
                >
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-[0.2em]" style={{ color: getContrastTextColor(lightenHex(accentColor, 0.7)) }}>{locale.instructorPlural}</p>
                    <div className="space-y-3">
                      {courseOfferings.map((offering) => (
                        <div key={`${offering.id}-${offering.yil}-${offering.donem}`} className="rounded-2xl border border-white/30 bg-white/15 px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] opacity-75" style={{ color: getContrastTextColor(lightenHex(accentColor, 0.7)) }}>
                            {offering.yil} · {offering.donem}
                          </p>
                          <div className="mt-2 space-y-1">
                            {normalizeInstructors(offering.ogretim_uyesi).map((instructor) => (
                              <p key={`${offering.id}-${instructor}`} className="font-medium" style={{ color: getContrastTextColor(lightenHex(accentColor, 0.7)) }}>
                                {instructor}
                              </p>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {archivePreview ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/75 p-4 animate-modal-backdrop"
          onClick={() => setArchivePreview(null)}
        >
          <section
            className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white/95 shadow-2xl backdrop-blur-xl animate-section-modal dark:border-slate-700 dark:bg-slate-900/95"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-5 border-b border-slate-200 p-5 dark:border-slate-700">
              <div className="min-w-0">
                <h2 className="break-words text-xl font-semibold text-slate-900 dark:text-white">
                  {archivePreview.ad}
                </h2>
                <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                  {archivePreview.uzanti || 'dosya'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <a
                  href={archivePreview.downloadUrl}
                  className="rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-900 transition hover:bg-slate-100 dark:border-slate-700 dark:text-white dark:hover:bg-slate-800"
                >
                  {locale.download}
                </a>
                <button
                  type="button"
                  onClick={() => setArchivePreview(null)}
                  className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                >
                  {locale.close}
                </button>
              </div>
            </div>

            <div className="min-h-[60vh] flex-1 bg-slate-100 p-4 dark:bg-slate-950">
              {['pdf', 'txt', 'md', 'csv'].includes(archivePreview.uzanti) ? (
                <iframe
                  src={archivePreview.uzanti === 'pdf' ? `${archivePreview.url}#toolbar=0&navpanes=0` : archivePreview.url}
                  title={archivePreview.ad}
                  className="h-[65vh] w-full rounded-2xl border border-slate-200 bg-white dark:border-slate-700"
                />
              ) : ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(archivePreview.uzanti) ? (
                <div className="flex h-[65vh] items-center justify-center overflow-auto rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={archivePreview.url} alt={archivePreview.ad} className="max-h-full max-w-full object-contain" />
                </div>
              ) : (
                <div className="flex h-[65vh] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
                  <p className="max-w-md text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {locale.previewUnavailable}
                  </p>
                  <a
                    href={archivePreview.downloadUrl}
                    className="mt-5 rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                  >
                    {locale.download}
                  </a>
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
