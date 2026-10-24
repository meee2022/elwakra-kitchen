/* ============================================================
   مطابخ الجنوب للمأكولات الشعبية — STDK POS
   البيانات الافتراضية: بيانات المنشأة + الأصناف
   مستخرجة من: السجل التجاري، منيو الوجبات، منيو الولائم 2024،
                ودفتر الفواتير الرسمي.
   ============================================================ */

const DEFAULT_SETTINGS = {
  nameAr: 'مطابخ الجنوب للمأكولات الشعبية',
  nameEn: 'Southern Traditional Dishes Kitchens',
  brandCode: 'STDK',
  sloganAr: 'طبّاخ ـ بنكهة أول',
  crNumber: '27781/3',
  entityNumber: '11-9255-03',
  taxNumber: '5000967356',
  ownerName: 'خالد محمود يوسف محمود المحمود',
  activity: 'المطابخ الشعبية (5621001)',
  logo: '',               // شعار مرفوع من الإعدادات (يحل محل الشعار المرسوم)
  tel: '44760614 - 44647458',
  mobile: '66315591 - 66315592',
  poBox: '12488',
  city: 'الدوحة - قطر',
  cityEn: 'Doha - Qatar',
  currency: 'ر.ق',
  currencyEn: 'QR',
  nextInvoiceNo: 95099,   // يكمل بعد آخر رقم في الدفتر الورقي (95098)
  printSize: 'thermal',   // thermal (80 mm receipt printer) | a5; the PDF and electronic copy are always A5
  showTafqeet: true,      // كتابة المبلغ بالحروف
  kitchenTicket: false,   // print a kitchen ticket with every saved order
  vatEnabled: false,      // ضريبة القيمة المضافة (غير مفعّلة في قطر حالياً)
  vatRate: 0
};

/* الأصناف — cat: meals (وجبات) | banquet (ولائم) | extra (إضافات)
   price بالريال القطري · weight بالجرام · state: طازج/مجمد · origin: المنشأ */
/* Added after devices were already set up: normalize() offers each to existing devices once. */
const ADDED_PRODUCTS = ['وجبة سمك', 'صالونة ربيان', 'صالونة لحم', 'صالونة دجاج', 'وجبة دجاج', 'وجبة لحم أسترالي', 'خروف صغير', 'خروف وسط', 'نص خروف (برياني أو خصوصي)'];

const DEFAULT_PRODUCTS = [
  // ---------- منيو الوجبات ----------
  { ar: 'مكبوس سمك',                 en: 'Magbus Samak',              cat: 'meals', price: 40, weight: 1200, state: 'طازج', origin: 'محلي' },
  { ar: 'وجبة سمك',                  en: 'Samak Meal (No Rice)',      cat: 'meals', price: 30, weight: 0,    state: 'طازج', origin: 'محلي' },
  { ar: 'صالونة سمك مع رز',          en: 'Salona Samak + Rice',       cat: 'meals', price: 40, weight: 1200, state: 'طازج', origin: 'محلي' },
  { ar: 'صالونة ربيان + عيش أبيض',   en: 'Salona Robiyan + Aish Abiad', cat: 'meals', price: 50, weight: 1000, state: 'مجمد', origin: 'كندا' },
  { ar: 'صالونة ربيان',              en: 'Salona Robiyan (No Rice)',  cat: 'meals', price: 40, weight: 0,    state: 'مجمد', origin: 'كندا' },
  { ar: 'برياني ربيان',              en: 'Robiyan Biryani',           cat: 'meals', price: 50, weight: 1000, state: 'مجمد', origin: 'كندا' },
  { ar: 'سمك مقلي + عيش أبيض',       en: 'Fried Samak + Aish Abiad',  cat: 'meals', price: 40, weight: 1000, state: 'طازج', origin: 'محلي' },
  { ar: 'سمك مشوي + عيش أبيض',       en: 'Aish Abiad Samak Mashwi',   cat: 'meals', price: 50, weight: 1000, state: 'طازج', origin: 'محلي' },
  { ar: 'جشيد + عيش أبيض',           en: 'Gesheed + Aish Abiad',      cat: 'meals', price: 40, weight: 900,  state: 'طازج', origin: 'محلي' },
  { ar: 'مشخول تونة',                en: 'Mashkhoul Tuna',            cat: 'meals', price: 40, weight: 900,  state: 'طازج', origin: 'محلي' },
  { ar: 'صالونة لحم + عيش أبيض',     en: 'Aish Abiad + Salona Laham', cat: 'meals', price: 55, weight: 1200, state: 'طازج', origin: 'استرالي' },
  { ar: 'صالونة لحم',                en: 'Salona Laham (No Rice)',    cat: 'meals', price: 45, weight: 0,    state: 'طازج', origin: 'استرالي' },
  { ar: 'صالونة دجاج + عيش أبيض',    en: 'Aish Abiad + Salona Degag', cat: 'meals', price: 35, weight: 1200, state: 'مجمد', origin: 'برازيلي' },
  { ar: 'صالونة دجاج',               en: 'Salona Degag (No Rice)',    cat: 'meals', price: 25, weight: 0,    state: 'مجمد', origin: 'برازيلي' },
  { ar: 'مكبوس دجاج',                en: 'Magbus Digag',              cat: 'meals', price: 30, weight: 1200, state: 'مجمد', origin: 'برازيلي' },
  { ar: 'وجبة دجاج',                 en: 'Digag Meal (No Rice)',      cat: 'meals', price: 20, weight: 0,    state: 'مجمد', origin: 'برازيلي' },
  { ar: 'برياني دجاج',               en: 'Biryani Digag',             cat: 'meals', price: 30, weight: 1200, state: 'مجمد', origin: 'برازيلي' },
  { ar: 'مكبوس لحم',                 en: 'Magbus Laham',              cat: 'meals', price: 55, weight: 1200, state: 'طازج', origin: 'استرالي' },
  { ar: 'وجبة لحم أسترالي',          en: 'Australian Laham Meal (No Rice)', cat: 'meals', price: 45, weight: 0, state: 'طازج', origin: 'استرالي' },
  { ar: 'برياني لحم',                en: 'Biryani Laham',             cat: 'meals', price: 55, weight: 1200, state: 'طازج', origin: 'استرالي' },
  { ar: 'برياني هندي لحم',           en: 'Biryani Hindi Laham',       cat: 'meals', price: 55, weight: 1000, state: 'طازج', origin: 'استرالي' },
  { ar: 'برياني هندي دجاج',          en: 'Biryani Hindi Digag',       cat: 'meals', price: 35, weight: 1000, state: 'مجمد', origin: 'برازيلي' },
  { ar: 'خصوصي الجنوب لحم',          en: 'Aish Abiud + Special Junoub', cat: 'meals', price: 55, weight: 1200, state: 'طازج', origin: 'هندي' },
  { ar: 'خصوصي الجنوب دجاج',         en: 'Special Junoub Digag',      cat: 'meals', price: 40, weight: 1200, state: 'طازج', origin: '' },
  { ar: 'مرقوقة لحم (صغير)',         en: 'Marquqa Sagir',             cat: 'meals', price: 20, weight: 400,  state: 'طازج', origin: 'استرالي' },
  { ar: 'مرقوقة لحم (كبير)',         en: 'Marquqa Kabir',             cat: 'meals', price: 30, weight: 600,  state: 'طازج', origin: 'استرالي' },
  { ar: 'معكرونة لحم (صغير)',        en: 'Macronia Sagir',            cat: 'meals', price: 20, weight: 400,  state: 'طازج', origin: 'استرالي' },
  { ar: 'معكرونة لحم (كبير)',        en: 'Macronia Kabir',            cat: 'meals', price: 30, weight: 600,  state: 'طازج', origin: 'استرالي' },
  { ar: 'هريس لحم (صغير)',           en: 'Haris Sagir',               cat: 'meals', price: 20, weight: 400,  state: 'طازج', origin: 'استرالي' },
  { ar: 'هريس لحم (كبير)',           en: 'Haris Kabir',               cat: 'meals', price: 30, weight: 600,  state: 'طازج', origin: 'استرالي' },
  { ar: 'مضروبة دجاج (صغير)',        en: 'Madaruba Sagir',            cat: 'meals', price: 15, weight: 400,  state: 'مجمد', origin: 'برازيلي' },
  { ar: 'مضروبة دجاج (كبير)',        en: 'Madaruba Kabir',            cat: 'meals', price: 20, weight: 600,  state: 'مجمد', origin: 'برازيلي' },
  { ar: 'ثريد لحم',                  en: 'Threed Laham',              cat: 'meals', price: 45, weight: 700,  state: 'طازج', origin: 'استرالي' },
  { ar: 'قشيط برياني',               en: 'Gesheat Biryani',           cat: 'meals', price: 0,  weight: 0,    state: '',     origin: '' },

  // ---------- إضافات ----------
  { ar: 'شوربة',  en: 'Shorba', cat: 'extra', price: 10, weight: 500, state: '', origin: '' },
  { ar: 'ساغو',   en: 'Sago',   cat: 'extra', price: 20, weight: 600, state: '', origin: '' },
  { ar: 'رسوم توصيل', en: 'Delivery', cat: 'extra', price: 0, weight: 0, state: '', origin: '' },

  // ---------- منيو الولائم 2024 ----------
  { ar: 'طبخ خصوصي الجنوبي (خروف أو دجاج)', en: 'Special Junoub Feast',        cat: 'banquet', price: 500,  weight: 0, state: '', origin: '' },
  { ar: 'طبخ الخروف مكبوس',                  en: 'Magbus Kharoof',              cat: 'banquet', price: 400,  weight: 0, state: '', origin: '' },
  { ar: 'طبخ الخروف برياني',                 en: 'Biryani Kharoof',             cat: 'banquet', price: 500,  weight: 0, state: '', origin: '' },
  // fixed id: every manager device offers it, and the menu sync must see one item, not one per device
  { id: 'half-kharoof', ar: 'نص خروف (برياني أو خصوصي)', en: 'Half Kharoof (Biryani / Special)', cat: 'banquet', price: 250, weight: 0, state: '', origin: '' },
  { ar: 'طبخ تيس (برياني - مكبوس)',          en: 'Tais (Biryani / Magbus)',     cat: 'banquet', price: 350,  weight: 0, state: '', origin: '' },
  { ar: 'طبخ سنام حوار مكبوس',               en: 'Sanam Hawar Magbus',          cat: 'banquet', price: 650,  weight: 0, state: '', origin: '' },
  { ar: 'طبخ سنام حوار عيش أبيض',            en: 'Sanam Hawar Aish Abiad',      cat: 'banquet', price: 600,  weight: 0, state: '', origin: '' },
  { ar: 'طبخ سنام حوار برياني',              en: 'Sanam Hawar Biryani',         cat: 'banquet', price: 700,  weight: 0, state: '', origin: '' },
  { ar: 'طبخ حوار كامل مكبوس',               en: 'Full Hawar Magbus',           cat: 'banquet', price: 1300, weight: 0, state: '', origin: '' },
  { ar: 'طبخ حوار كامل برياني',              en: 'Full Hawar Biryani',          cat: 'banquet', price: 1400, weight: 0, state: '', origin: '' },
  { ar: 'برياني هندي دجاج (وليمة)',          en: 'Biryani Hindi Digag (Feast)', cat: 'banquet', price: 500,  weight: 0, state: '', origin: '' },
  { ar: 'طبخ خروف + عيش أبيض',               en: 'Kharoof + Aish Abiad',        cat: 'banquet', price: 400,  weight: 0, state: '', origin: '' },
  { ar: 'طبخ خروف استرالي مكبوس',            en: 'Australian Kharoof Magbus',   cat: 'banquet', price: 450,  weight: 0, state: '', origin: 'استرالي' },
  { ar: 'طبخ خروف استرالي برياني',           en: 'Australian Kharoof Biryani',  cat: 'banquet', price: 550,  weight: 0, state: '', origin: 'استرالي' },
  { ar: 'خروف صغير',                        en: 'Small Kharoof',               cat: 'banquet', price: 1350, weight: 0, state: '', origin: '' },
  { ar: 'خروف وسط',                         en: 'Medium Kharoof',              cat: 'banquet', price: 1500, weight: 0, state: '', origin: '' },
  { ar: 'كرتون دجاج برياني (الدجاج من المطبخ)', en: 'Chicken Biryani Carton (kitchen)', cat: 'banquet', price: 500, weight: 0, state: '', origin: '' },
  { ar: 'كرتون دجاج برياني (الدجاج من الزبون)', en: 'Chicken Biryani Carton (customer)', cat: 'banquet', price: 350, weight: 0, state: 'مجمد', origin: '' },
  { ar: 'كرتون دجاج مكبوس (الدجاج من المطبخ)',  en: 'Chicken Magbus Carton (kitchen)',  cat: 'banquet', price: 500, weight: 0, state: '', origin: '' },
  { ar: 'كرتون دجاج مكبوس (الدجاج من الزبون)',  en: 'Chicken Magbus Carton (customer)', cat: 'banquet', price: 350, weight: 0, state: 'مجمد', origin: '' }
];

const CATEGORIES = [
  { key: 'meals',   label: 'وجبات',  labelEn: 'Meals' },
  { key: 'banquet', label: 'ولائم',  labelEn: 'Banquets' },
  { key: 'extra',   label: 'إضافات', labelEn: 'Extras' }
];
