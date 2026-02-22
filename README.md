# قارئ كتاب — موقع قراءة محلي (بدون خادم)

هذا مشروع قالب لعرض كتاب عربي كبير في واجهة قارئ مُحسّنة للهواتف والحواسيب، يعمل بالكامل على المتصفح باستخدام HTML/CSS/JS وlocalStorage. مناسب للنشر على GitHub Pages.

ملفات مهمة
- [index.html](index.html) — الصفحة الرئيسية (واجهة القارئ)
- [assets/styles.css](assets/styles.css) — أنماط واجهة المستخدم
- [assets/app.js](assets/app.js) — منطق تحميل الفصول وإعدادات المستخدم
- [content/manifest.json](content/manifest.json) — فهرس الفصول
- [content/*.html](content/) — ملفات الفصول

كيفية إضافة كتابك (من ملف Word كبير)
1. استخدم أداة تحويل مثل Pandoc أو LibreOffice لتحويل ملف Word إلى HTML:

```bash
pandoc -s book.docx -t html -o book.html
```

2. قسّم ملف HTML الناتج إلى ملفات فصلية. مثال Python بسيط لتقسيم حسب عنوان H1:

```python
from bs4 import BeautifulSoup
html = open('book.html',encoding='utf-8').read()
soup = BeautifulSoup(html,'html.parser')
sections = soup.find_all(['h1','h2'])
# عملية بسيطة: كتابة كل ه1+محتواها إلى ملف منفصل (تعديل حسب هيكلة الملف)
```

أداة أسرع (مقترح): استخدم سكربت لتقسيم بـ regex على رؤوس الفصل ثم حفظ كل جزء إلى `content/chapter-N.html` وتعديل `content/manifest.json` ليحتوي على قائمة الفصول.

التشغيل محلياً
افتح `index.html` في المتصفح أو انشر على GitHub Pages (فرع `main` أو `gh-pages`). لا يلزم خادم.

نقاط هامة
- الموقع يخزن آخر فصل ومكان التمرير وإعدادات القارئ في `localStorage`.
- يدعم أوضاع الألوان، تغيير الخط، حجم الخط، وتباعد الأسطر.
- صُمّم للعمل مع النص العربي (dir=rtl) وخطوط عربية من Google Fonts.

نصائح النشر على GitHub Pages
1. أنشئ مستودعاً جديداً، ضع محتويات هذا المجلد في الجذر، ثم ادفع إلى `main`.
2. قم بتمكين GitHub Pages في إعدادات المستودع واختر الفرع `main` و`/ (root)`.
