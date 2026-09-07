/* ============================================================
   ثنائية اللغة — عربي / English
   المعجم مفتاحه النص العربي نفسه، فيبقى الكود مقروءاً بالعربية
   ويعمل بلا ترجمة لو نقص مفتاح.

   ملاحظة: الفاتورة وسجل الوزارة وتقرير المبيعات المطبوعة تبقى
   ثنائية اللغة كما هي — لأنها مستندات رسمية تُقدَّم بالعربية.
   ============================================================ */
'use strict';

const I18N = {
  /* ── التنقّل وعناوين الشاشات ── */
  'نقطة البيع': 'Point of Sale',
  'الفواتير': 'Invoices',
  'الأصناف': 'Items',
  'التقارير': 'Reports',
  'الإعدادات': 'Settings',
  'الأصناف والأسعار': 'Items & Prices',
  'تقارير المبيعات': 'Sales Reports',
  'اختَر الأصناف، راجع الطلب، وأصدر الفاتورة.': 'Pick items, review the order, and issue the invoice.',
  'راجع الفواتير الصادرة وتابع التحصيل من مكان واحد.': 'Review issued invoices and track collection in one place.',
  'نظّم قائمة المطعم وحدّث الأسعار وتوافر الأصناف.': 'Organise the menu and update prices and availability.',
  'تابع أداء المبيعات والأصناف الأكثر طلبًا خلال الفترة.': 'Track sales performance and best-selling items for the period.',
  'بيانات المنشأة، الطباعة، والنسخ الاحتياطي والمزامنة.': 'Business details, printing, backup and sync.',
  'مطابخ الجنوب · مساحة العمل': 'Southern Kitchens · Workspace',
  'مطابخ الجنوب للمأكولات الشعبية': 'Southern Traditional Dishes Kitchens',
  'متابعة المبيعات': 'Sales Dashboard',

  /* ── نقطة البيع ── */
  'قائمة الأصناف': 'Menu Items',
  'الفاتورة الحالية': 'Current Invoice',
  'الفاتورة': 'Invoice',
  'اسم العميل / الجهة': 'Customer / Organisation',
  'نوع الدفع': 'Payment Type',
  'نقداً': 'Cash',
  'على الحساب': 'Credit',
  'تاريخ الفاتورة': 'Invoice Date',
  'الجوال والخصم والتوصيل': 'Mobile, Discount & Delivery',
  'رقم الجوال': 'Mobile Number',
  'خصم (ر.ق)': 'Discount (QR)',
  'توصيل (ر.ق)': 'Delivery (QR)',
  'ملاحظات على الفاتورة': 'Invoice Notes',
  'الإجمالي قبل الخصم': 'Subtotal',
  'الخصم': 'Discount',
  'التوصيل': 'Delivery',
  'المطلوب': 'Total Due',
  'حفظ وطباعة الفاتورة': 'Save & Print Invoice',
  'حفظ فقط': 'Save Only',
  'إفراغ': 'Clear',
  'وجبات': 'Meals',
  'ولائم': 'Banquets',
  'إضافات': 'Extras',
  'ابدأ طلبًا جديدًا': 'Start a new order',
  'اختَر صنفًا من القائمة لإضافته هنا.': 'Pick an item from the menu to add it here.',
  'لا توجد أصناف مطابقة': 'No matching items',
  'جرّب اسمًا آخر أو امسح البحث لعرض القسم.': 'Try another name or clear the search to show the category.',
  'رقم الفاتورة القادم: ': 'Next invoice no.: ',
  'صنف': 'items',
  'تم حفظ الفاتورة رقم {0} — {1} ر.ق': 'Invoice {0} saved — {1} QR',
  'تم تحصيل الفاتورة {0}': 'Invoice {0} marked as paid',
  'تم إلغاء الفاتورة {0}': 'Invoice {0} cancelled',
  'سبب إلغاء الفاتورة رقم {0}؟\n(الفاتورة تبقى محفوظة في السجل كملغاة ولا تُحذف)':
    'Reason for cancelling invoice {0}?\n(The invoice stays in the record marked as cancelled; it is never deleted.)',
  'حذف الصنف "{0}"؟\nالفواتير القديمة لن تتأثر.':
    'Delete the item "{0}"?\nPast invoices will not be affected.',
  '{0} فاتورة · إجمالي {1} ر.ق': '{0} invoice(s) · total {1} QR',
  'تقليل كمية {0}': 'Decrease quantity of {0}',
  'زيادة كمية {0}': 'Increase quantity of {0}',
  'كمية {0}': 'Quantity of {0}',
  'سعر {0}': 'Price of {0}',
  'إفراغ الفاتورة الحالية؟': 'Clear the current invoice?',
  'حذف': 'Remove',
  'ر.ق': 'QR',
  'جم': 'g',

  /* ── سجل الفواتير ── */
  'سجل الفواتير': 'Invoice Records',
  'كل الفواتير': 'All Invoices',
  'على الحساب (غير محصّلة)': 'Credit (Unpaid)',
  'آجل محصّل': 'Credit — Paid',
  'ملغاة': 'Cancelled',
  'سارية': 'Valid',
  'إلغاء الفلترة': 'Clear Filters',
  'رقم الفاتورة': 'Invoice No.',
  'التاريخ': 'Date',
  'الوقت': 'Time',
  'العميل / الجهة': 'Customer',
  'العميل': 'Customer',
  'أصناف': 'Items',
  'الإجمالي': 'Total',
  'الحالة': 'Status',
  'إجراءات': 'Actions',
  'عرض': 'View',
  'طباعة': 'Print',
  'تحصيل': 'Collect',
  'إلغاء': 'Cancel',
  'آجل — محصّل': 'Credit — Paid',
  'طباعة سجل الفواتير الرسمي (للوزارة)': 'Print Official Invoice Register (for the Ministry)',
  'تصدير Excel / CSV': 'Export Excel / CSV',
  'لا توجد فواتير مطابقة': 'No matching invoices',
  'مبيعات اليوم': "Today's Sales",
  'نقداً اليوم': 'Cash Today',
  'مستحقات آجلة': 'Outstanding Credit',
  'إجمالي الفواتير': 'Total Invoices',
  'منذ بداية التشغيل': 'since day one',
  'فاتورة': 'invoice(s)',
  'فاتورة غير محصّلة': 'unpaid invoice(s)',
  'لا توجد فواتير في النطاق المحدد': 'No invoices in the selected range',
  'لا توجد فواتير للتصدير': 'No invoices to export',
  'تم تصدير الملف — يفتح مباشرة في Excel': 'File exported — opens directly in Excel',

  /* ── الأصناف ── */
  'إدارة الأصناف والأسعار': 'Manage Items & Prices',
  '+ إضافة صنف': '+ Add Item',
  'إضافة صنف': 'Add Item',
  'تعديل صنف': 'Edit Item',
  'الصنف (عربي)': 'Item (Arabic)',
  'الاسم بالإنجليزي': 'English Name',
  'الاسم بالعربي *': 'Arabic Name *',
  'القسم': 'Category',
  'السعر': 'Price',
  'السعر (ر.ق) *': 'Price (QR) *',
  'الوزن (جم)': 'Weight (g)',
  'المنشأ': 'Origin',
  'مُفعّل': 'Active',
  'تعديل': 'Edit',
  'طازج': 'Fresh',
  'مجمد': 'Frozen',
  'نعم': 'Yes',
  'لا': 'No',
  'حفظ': 'Save',
  'لا توجد أصناف': 'No items',
  'اكتب اسم الصنف بالعربي': 'Enter the item name in Arabic',
  'تم تعديل الصنف': 'Item updated',
  'تمت إضافة الصنف': 'Item added',
  'تم الحذف': 'Deleted',

  /* ── التقارير ── */
  'الفترة': 'Period',
  'اليوم': 'Today',
  'آخر 7 أيام': 'Last 7 Days',
  'هذا الشهر': 'This Month',
  'هذه السنة': 'This Year',
  'المبيعات حسب القسم': 'Sales by Category',
  'طباعة تقرير المبيعات': 'Print Sales Report',
  'تصدير الأصناف Excel / CSV': 'Export Items to Excel / CSV',
  'الأصناف المباعة — مرتّبة بالأكثر مبيعاً': 'Items Sold — Best Sellers First',
  'القيمة قبل الخصم والتوصيل': 'Value before discount & delivery',
  'الصنف': 'Item',
  'الكمية': 'Qty',
  'الكمية المباعة': 'Qty Sold',
  'القيمة': 'Value',
  'القيمة (ر.ق)': 'Value (QR)',
  'النسبة': 'Share',
  'المبيعات اليومية': 'Daily Sales',
  'فواتير': 'Invoices',
  'آجل': 'Credit',
  'الوجبات': 'Meals',
  'إجمالي المبيعات': 'Total Sales',
  'عدد الوجبات المباعة': 'Meals Sold',
  'إجمالي الوحدات في الفترة': 'total units in period',
  'غير محصّل: ': 'Unpaid: ',
  'متوسط الفاتورة': 'Average Invoice',
  'متوسط ': 'avg ',
  ' وجبة/فاتورة': ' meals/invoice',
  'متوسط اليوم': 'Daily Average',
  ' يوم عمل': ' working day(s)',
  'وحدة': 'units',
  'من المبيعات': 'of sales',
  'لا توجد بيانات في هذه الفترة': 'No data for this period',
  'لا توجد بيانات': 'No data',
  'لا توجد مبيعات في هذه الفترة': 'No sales in this period',
  'تم تصدير تقرير الأصناف': 'Items report exported',
  'الكل': 'all',

  /* ── الحماية برمز دخول ── */
  'الحماية برمز دخول': 'Passcode Protection',
  'أدخل رمز الدخول للمتابعة': 'Enter your passcode to continue',
  'رمز الدخول': 'Passcode',
  'دخول': 'Unlock',
  'الرمز': 'Passcode',
  'تأكيد': 'Confirm',
  'قفل الشاشة': 'Lock the screen',
  'رمز الدخول للموقع': 'Site Passcode',
  'رمز شاشة الإعدادات': 'Settings Passcode',
  'تعيين': 'Set',
  'تغيير': 'Change',
  'إزالة': 'Remove',
  'مفعّل': 'On',
  'غير مفعّل': 'Off',
  'رمز الدخول الجديد': 'New site passcode',
  'رمز الإعدادات الجديد': 'New settings passcode',
  'أعد إدخال الرمز للتأكيد': 'Re-enter the passcode to confirm',
  'أدخل رمز الإعدادات': 'Enter the settings passcode',
  'أدخل الرمز الحالي للتأكيد': 'Enter the current passcode to confirm',
  'رمز غير صحيح': 'Wrong passcode',
  'جاري التحقق…': 'Checking…',
  'الرمز لا يقل عن 4 خانات': 'The passcode must be at least 4 characters',
  'الرمزان غير متطابقين': 'The two entries do not match',
  'تم حفظ الرمز': 'Passcode saved',
  'تم إلغاء رمز الدخول': 'Site passcode removed',
  'تم إلغاء رمز الإعدادات': 'Settings passcode removed',
  'رمز الدخول يُطلب عند فتح الموقع، ورمز الإعدادات يُطلب عند دخول هذه الشاشة. الرمز نفسه لا يُحفظ — تُحفظ بصمته فقط.':
    'The site passcode is asked for when the site opens; the settings passcode when entering this screen. The passcode itself is never stored — only its hash.',
  'لو نسيت الرمز: استعد نسخة احتياطية — ملف النسخة لا يحتوي الرموز، فيفتح النظام بلا قفل. النظام يعمل داخل المتصفح، فالقفل يمنع التصفّح العابر ولا يحمي من شخص تقني يملك الجهاز.':
    'If you forget the passcode: restore a backup — the backup file holds no passcodes, so the system opens unlocked. The system runs inside the browser, so the lock stops casual browsing; it does not protect against a technical person who has the device.',

  /* ── الإعدادات ── */
  'بيانات المنشأة (تظهر على كل فاتورة إلكترونية)': 'Business Details (shown on every invoice)',
  'الاسم التجاري بالعربي': 'Trade Name (Arabic)',
  'الاسم التجاري بالإنجليزي': 'Trade Name (English)',
  'رقم السجل التجاري': 'Commercial Registration No.',
  'رقم قيد المنشأة': 'Entity No.',
  'رقم التسجيل الضريبي': 'Tax Registration No.',
  'اسم المالك': 'Owner Name',
  'النشاط التجاري': 'Business Activity',
  'الهاتف': 'Telephone',
  'الجوال': 'Mobile',
  'صندوق البريد': 'P.O. Box',
  'المدينة / الدولة': 'City / Country',
  'العبارة التعريفية': 'Tagline',
  'شعار المطبخ على الفاتورة': 'Logo on the Invoice',
  'رفع صورة الشعار': 'Upload Logo Image',
  'استخدام الشعار الافتراضي': 'Use Default Logo',
  'يُفضَّل شعار مربّع بخلفية شفافة (PNG). الصورة تُصغَّر تلقائياً قبل الحفظ.':
    'A square logo with a transparent background (PNG) works best. The image is resized automatically before saving.',
  'إعدادات الفوترة': 'Invoicing Settings',
  'رقم الفاتورة القادمة': 'Next Invoice No.',
  'مقاس الطباعة': 'Print Size',
  'A5 (ورق عادي)': 'A5 (plain paper)',
  'رول حراري 80 مم': '80 mm thermal roll',
  'كتابة المبلغ بالحروف': 'Amount in Words',
  'ضريبة القيمة المضافة': 'VAT',
  'غير مفعّلة': 'Disabled',
  'مفعّلة': 'Enabled',
  'نسبة الضريبة %': 'VAT Rate %',
  'حفظ الإعدادات': 'Save Settings',
  'تثبيت التطبيق على الجهاز': 'Install App on This Device',
  'تم حفظ الإعدادات': 'Settings saved',
  'تم حفظ الشعار — سيظهر على الفواتير الجديدة والمطبوعة': 'Logo saved — it will appear on new and printed invoices',
  'تعذّرت قراءة الصورة': 'Could not read the image',
  'رجع الشعار الافتراضي': 'Default logo restored',

  /* ── المزامنة ── */
  'المزامنة السحابية': 'Cloud Sync',
  'نقطة البيع تشتغل محلياً دائماً. لما المزامنة تكون مفعّلة، الفواتير بتترفع تلقائياً لقاعدة البيانات السحابية عشان تتابعها من الموبايل ويبقى عندك نسخة برّه الجهاز.':
    'The POS always works locally. When sync is on, invoices upload automatically to the cloud database so you can follow them from your phone and keep a copy off this device.',
  'رابط النشرة (Deployment URL)': 'Deployment URL',
  'مفتاح المزامنة (SYNC_KEY)': 'Sync Key (SYNC_KEY)',
  'مفتاح المزامنة': 'Sync Key',
  'تفعيل المزامنة التلقائية': 'Enable automatic sync',
  'اختبار الاتصال': 'Test Connection',
  'حفظ وتفعيل المزامنة': 'Save & Enable Sync',
  'مزامنة الآن': 'Sync Now',
  'متزامن': 'Synced',
  'جاري الرفع…': 'Uploading…',
  'بدون إنترنت': 'Offline',
  'تعذّرت المزامنة': 'Sync failed',
  'في انتظار الرفع: ': 'Waiting to upload: ',
  'لم تتم أي مزامنة بعد.': 'No sync has run yet.',
  'آخر خطأ:': 'Last error:',
  'آخر مزامنة ناجحة: ': 'Last successful sync: ',
  'اكتب رابط النشرة والمفتاح أولاً': 'Enter the deployment URL and key first',
  'اكتب رابط النشرة والمفتاح': 'Enter the deployment URL and key',
  'تم تفعيل المزامنة — الفواتير هترفع تلقائياً': 'Sync enabled — invoices will upload automatically',
  'احفظ رابط النشرة والمفتاح وفعّل المزامنة أولاً': 'Save the URL and key and enable sync first',
  'فشل الاتصال: ': 'Connection failed: ',
  'حُفظت البيانات لكن الاتصال فشل: ': 'Saved, but the connection failed: ',
  'تعذّرت المزامنة: ': 'Sync failed: ',

  /* ── النسخ الاحتياطي ── */
  'النسخ الاحتياطي': 'Backup',
  'البيانات محفوظة على هذا الجهاز. اعمل نسخة احتياطية بشكل دوري واحتفظ بها على فلاشة أو على الإيميل.':
    'Data is stored on this device. Back up regularly and keep the file on a USB drive or in your email.',
  'تنزيل نسخة احتياطية': 'Download Backup',
  'استعادة من ملف': 'Restore from File',
  'مسح كل البيانات والبدء من جديد': 'Erase All Data and Start Over',
  'تم تنزيل النسخة الاحتياطية': 'Backup downloaded',
  'لم تأخذ نسخة احتياطية بعد. عدد الفواتير المحفوظة: ': 'No backup taken yet. Invoices stored: ',
  'آخر نسخة احتياطية: ': 'Last backup: ',
  ' — عدد الفواتير المحفوظة: ': ' — invoices stored: ',
  'ملف غير صالح': 'Invalid file',
  'تمت الاستعادة بنجاح': 'Restored successfully',
  'تعذّر قراءة الملف: ': 'Could not read the file: ',
  'سيتم مسح كل الفواتير والأصناف والإعدادات نهائياً.\nهل أخذت نسخة احتياطية؟':
    'This will permanently erase all invoices, items and settings.\nHave you taken a backup?',
  'تأكيد أخير: مسح كل البيانات؟': 'Final confirmation: erase all data?',
  'تم نقل بياناتك إلى قاعدة البيانات المحلية': 'Your data was moved to the local database',
  'تعذّر حفظ البيانات — اعمل نسخة احتياطية فوراً وأعد تشغيل المتصفح.':
    'Could not save data — take a backup now and restart the browser.',

  /* ── النوافذ والطباعة ── */
  'حفظ كملف PDF': 'Save as PDF',
  'تنزيل نسخة إلكترونية (HTML)': 'Download Electronic Copy (HTML)',
  'إغلاق': 'Close',
  'في نافذة الطباعة اختر الوجهة: "حفظ كـ PDF" أو "Microsoft Print to PDF"':
    'In the print dialog choose the destination "Save as PDF" or "Microsoft Print to PDF"',

  /* ── العناصر النائبة والتلميحات ── */
  'ابحث باسم الصنف بالعربي أو الإنجليزي…': 'Search item by Arabic or English name…',
  'اسم الشخص أو الشركة أو الوزارة (اختياري)': 'Person, company or ministry name (optional)',
  'اختياري': 'Optional',
  'بحث برقم الفاتورة أو اسم العميل / الجهة': 'Search by invoice no. or customer',
  'بحث': 'Search',
  'نفس المفتاح المضبوط في Convex': 'The same key set in Convex',
  'من تاريخ': 'From date',
  'إلى تاريخ': 'To date',
  'يُحفظ على هذا الجهاز فقط.': 'Stored on this device only.',
  'الاتصال بقاعدة البيانات': 'Connect to the Database',
  'اتصال': 'Connect',
  'تحديث': 'Refresh',
  'من': 'From',
  'إلى': 'To',
  'الأصناف الأكثر مبيعاً': 'Best-Selling Items',
  'تغيير بيانات الاتصال': 'Change connection details',
  'فواتير ملغاة': 'Cancelled Invoices',
  'جاري الاتصال…': 'Connecting…',
  'جاري التحميل…': 'Loading…',
  'اكتب رابط النشرة والمفتاح.': 'Enter the deployment URL and key.',
  'تعذّر التحميل: ': 'Could not load: ',
  'لا توجد مبيعات في هذه الفترة': 'No sales in this period',
  'آخر فاتورة وصلت: ': 'Last invoice received: ',
  'لم تصل أي فاتورة بعد': 'No invoices received yet'
};

const I18n = (function () {
  let lang = 'ar';

  /** يترجم نصاً؛ يعيده كما هو إن لم يوجد له مقابل */
  function t(s) {
    if (lang === 'ar') return s;
    return I18N[s] !== undefined ? I18N[s] : s;
  }

  /** يترجم نصاً يحوي أجزاء متغيّرة: t2('مرحبا {0}', name) */
  function t2(tpl, ...args) {
    return t(tpl).replace(/\{(\d)\}/g, (_, i) => args[i]);
  }

  /** يطبّق الترجمة على العناصر الساكنة الموسومة في HTML */
  function applyStatic(root = document) {
    root.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    root.querySelectorAll('[data-i18n-ph]').forEach(el => {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph')));
    });
    root.querySelectorAll('[data-i18n-title]').forEach(el => {
      el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
    });
    root.querySelectorAll('[data-i18n-aria]').forEach(el => {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
    });
  }

  /** يبدّل اللغة: الاتجاه والوسوم الساكنة ثم إعادة رسم الشاشات */
  function set(next, onChange) {
    lang = next === 'en' ? 'en' : 'ar';
    const html = document.documentElement;
    html.lang = lang;
    html.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.body.classList.toggle('lang-en', lang === 'en');
    applyStatic();
    const btn = document.querySelector('#btnLang');
    if (btn) {
      btn.textContent = lang === 'ar' ? 'English' : 'عربي';
      btn.setAttribute('aria-label', lang === 'ar' ? 'Switch to English' : 'التحويل إلى العربية');
    }
    if (typeof onChange === 'function') onChange(lang);
  }

  const get = () => lang;
  /** اسم الصنف حسب اللغة، مع الرجوع للعربي إن لم توجد ترجمة */
  const itemName = p => (lang === 'en' && p.en) ? p.en : p.ar;
  const itemAlt = p => (lang === 'en' && p.en) ? p.ar : (p.en || '');

  return { t, t2, set, get, applyStatic, itemName, itemAlt };
})();

const t = I18n.t;
