---
id: "LOC-11"
title: "Top-languages research: is there untapped in-language traffic behind the site's top countries?"
status: "in_progress"
priority: "P2"
epic: "localized-search"
phase: "near-term"
depends_on: ["LOC-08"]
legacy_state: "Open"
---

# LOC-11 · Top-languages research: is there untapped in-language traffic behind the site's top countries?

## Why this exists

Shlomi, 2026-09-12: "users will use their own language for search" and "I will want more validation
around the top languages to see we are not missing out on untapped traffic." [LOC-10](LOC-10.md) had
made the case for removing page localization; he stopped the removal to do this research first. This
ticket is that research. It reports into LOC-10, which decides.

The blind spot is real and GSC cannot see it by construction: Search Console only reports queries we
already rank for, and with no page in a language there is nothing for Google to rank there (SEO-27's
lesson). The evidence so far says the intuition holds in some markets and not others, so it is
measured per language, never assumed either way:

- **Held:** Indonesian (Trends parity with English on compress and sign; in-language queries leaking
  onto the English page). Declined on field, not demand ([LOC-07](LOC-07.md)).
- **Did not hold:** India, the top country by a distance, where all 50 recent queries are English and
  Hindi, Telugu and Tamil are flat at zero ([LOC-01](LOC-01.md), [LOC-08](LOC-08.md)); Israel, four
  English queries, Hebrew a third of English at best. The vocabulary of this niche ("pdf", "merge",
  "compress", "jpg") stays English inside many languages.

## The site's top twenty countries (GSC, 2026-09-12) and their languages

India, United States, Indonesia, Malaysia, Philippines, Vietnam, Pakistan, United Kingdom, Bangladesh,
Israel, Turkey, New Zealand, United Arab Emirates, South Africa, Canada, Mexico, Hong Kong, Singapore,
Morocco, Italy.

| Already measured | Unmeasured, this ticket | English-search countries |
| --- | --- | --- |
| Hebrew (IL), Indonesian (ID), Malay (MY), Hindi, Telugu, Tamil (IN) | **Vietnamese** (VN, 6th), **Turkish** (TR, 11th), **Spanish** (MX, 16th), **Italian** (IT, 20th), **Arabic** (AE 13th, MA 19th), **Filipino** (PH, 5th), **Bengali** (BD, 9th), **Urdu** (PK, 7th); Traditional Chinese (HK, 17th) noted, not charted | US, UK, NZ, ZA, CA, SG |

**The site's top queries, all countries (same day): all English, all niche.** `blur pdf online`,
`blur pdf`, `file compressor to 100kb`, `reduce file size to 100kb`, `pdf blur online`, `blur text in
pdf`, `extract pdf`, `sign pdf on iphone`, `blackout text in pdf free`, `how to sign pdf on computer`.
The majors do not compete on blur or on 100kb; that is why this domain ranks there and sits at
position 36 on `/merge/`. Keep this in view when reading a native "compress pdf" chart: demand there is
real and irrelevant if the field is the one we already lose to in English.

## Incumbent check, 2026-09-12 (direct URL fetches of each major's own locale routes; status, `lang`, title)

| Language | PDF24 | Smallpdf | iLovePDF | Sejda | Read |
| --- | --- | --- | --- | --- | --- |
| Vietnamese | native, all four tools ("Nén file PDF", "Ghép file PDF", "Ký PDF", "Chuyển đổi PDF sang JPG") | native ("Giảm dung lượng PDF", "Ghép file PDF", "Ký PDF", "Chuyển PDF sang JPG") | localized under its own slugs (the guessed URL 404s; the edition exists) | native | Full native ecosystem |
| Turkish | native ("PDF küçültme", "PDF birleştirme", "PDF imzalama") | native ("PDF Küçültme", "PDF Birleştirme", "PDF JPG Çevirme") | own slugs | native ("PDF'yi online sıkıştır", "PDF Dosyalarını Online Birleştir") | Full native ecosystem |
| Spanish | native ("Comprimir PDF", "Unir PDF", "Firmar PDF") | native ("Comprime PDF", "Unir PDF", "Firmar PDF") | iLovePDF is a Spanish company | native | The most saturated field possible |
| Italian | native ("Comprimi PDF", "Unisci PDF", "Firma il PDF") | own slugs ("Unisci PDF", "PDF in JPG" resolved) | own slugs | native ("Comprimere PDF online", "Unisci PDF online") | Full native ecosystem |
| Arabic | native | native | native | native | Full native ecosystem (LOC-01 said so already) |
| Filipino | `/tl/` resolves 200 but `lang="en"`, English title | 404 | 404 | 404 | **No incumbent at all**, same shape as Tamil |
| Bengali | native ("PDF সংকোচন করুন", "PDF একত্রিত করা", "PDF সই করুন") | 404 | 404 | `lang="bn"` on an English page | One real incumbent, same shape as Telugu |
| Urdu | `/ur/` resolves 200, English | 404 | 404 | `lang="ur"` on an English page | No native incumbent, same shape as Tamil |
| Trad. Chinese | serves *simplified* Chinese at `/zh-tw/` | 404 | native `zh-Hant` | 404 | Mixed; Hong Kong also searches in English |

**Google's translated-results list, verified from Google's own documentation on 2026-09-12:** Arabic,
Bengali, English, French, German, Gujarati, Hindi, Indonesian, Kannada, Korean, Malayalam, Marathi,
Persian, Portuguese, Spanish, Tamil, Telugu, Thai, Turkish, Urdu, Vietnamese. On a listed language our
English page already reaches searchers translated by Google, so the untapped share is only what a
native page adds over that. **Not listed:** Italian, Filipino, Hebrew, Malay, Chinese, Japanese. Those
are the languages where a native page adds the most, and on our list that is Italian (rank 20) and
Filipino (rank 5, no incumbent, but LOC-01 found the queries code-switch).

## For Shlomi: ready-to-click links

Five terms per Trends chart (English yardstick first, then native phrasing lifted from the titles
above; the fifth term is sometimes constructed and should be read as the weaker one), twelve months,
the country's own geo. One SERP per task on the primary native term. Two things to read off every
SERP: how many results carry Google's "translated, see original" badge (LOC-08: a SERP Google backfills
with its own translations is thin native demand), and whether the related-searches block is in the
language or in English.

**Vietnamese** (`hl=vi&gl=VN`; incumbents: PDF24, Smallpdf, Sejda all native; iLovePDF too (own slugs); on Google's translated-results list: yes)

- Compress: Trends [compress pdf / nén pdf / nén file pdf / giảm dung lượng pdf / nén pdf trực tuyến](https://trends.google.com/trends/explore?date=today%2012-m&geo=VN&q=compress%20pdf,n%C3%A9n%20pdf,n%C3%A9n%20file%20pdf,gi%E1%BA%A3m%20dung%20l%C6%B0%E1%BB%A3ng%20pdf,n%C3%A9n%20pdf%20tr%E1%BB%B1c%20tuy%E1%BA%BFn&hl=en) · SERP [nén pdf](https://www.google.com/search?q=n%C3%A9n%20pdf&hl=vi&gl=VN)
- Sign: Trends [sign pdf / ký pdf / ký file pdf / chữ ký pdf / điền và ký pdf](https://trends.google.com/trends/explore?date=today%2012-m&geo=VN&q=sign%20pdf,k%C3%BD%20pdf,k%C3%BD%20file%20pdf,ch%E1%BB%AF%20k%C3%BD%20pdf,%C4%91i%E1%BB%81n%20v%C3%A0%20k%C3%BD%20pdf&hl=en) · SERP [ký pdf](https://www.google.com/search?q=k%C3%BD%20pdf&hl=vi&gl=VN)
- Merge: Trends [merge pdf / ghép file pdf / ghép pdf / hợp nhất pdf / gộp file pdf](https://trends.google.com/trends/explore?date=today%2012-m&geo=VN&q=merge%20pdf,gh%C3%A9p%20file%20pdf,gh%C3%A9p%20pdf,h%E1%BB%A3p%20nh%E1%BA%A5t%20pdf,g%E1%BB%99p%20file%20pdf&hl=en) · SERP [ghép file pdf](https://www.google.com/search?q=gh%C3%A9p%20file%20pdf&hl=vi&gl=VN)
- PDF to JPG: Trends [pdf to jpg / chuyển pdf sang jpg / chuyển đổi pdf sang jpg / pdf sang jpg / đổi pdf sang ảnh](https://trends.google.com/trends/explore?date=today%2012-m&geo=VN&q=pdf%20to%20jpg,chuy%E1%BB%83n%20pdf%20sang%20jpg,chuy%E1%BB%83n%20%C4%91%E1%BB%95i%20pdf%20sang%20jpg,pdf%20sang%20jpg,%C4%91%E1%BB%95i%20pdf%20sang%20%E1%BA%A3nh&hl=en) · SERP [chuyển pdf sang jpg](https://www.google.com/search?q=chuy%E1%BB%83n%20pdf%20sang%20jpg&hl=vi&gl=VN)

**Turkish** (`hl=tr&gl=TR`; incumbents: PDF24, Smallpdf, Sejda all native; iLovePDF too; on Google's translated-results list: yes)

- Compress: Trends [compress pdf / pdf küçültme / pdf sıkıştır / pdf sıkıştırma / pdf boyutu küçültme](https://trends.google.com/trends/explore?date=today%2012-m&geo=TR&q=compress%20pdf,pdf%20k%C3%BC%C3%A7%C3%BCltme,pdf%20s%C4%B1k%C4%B1%C5%9Ft%C4%B1r,pdf%20s%C4%B1k%C4%B1%C5%9Ft%C4%B1rma,pdf%20boyutu%20k%C3%BC%C3%A7%C3%BCltme&hl=en) · SERP [pdf küçültme](https://www.google.com/search?q=pdf%20k%C3%BC%C3%A7%C3%BCltme&hl=tr&gl=TR)
- Sign: Trends [sign pdf / pdf imzalama / pdf imzala / pdf imza / pdf doldur ve imzala](https://trends.google.com/trends/explore?date=today%2012-m&geo=TR&q=sign%20pdf,pdf%20imzalama,pdf%20imzala,pdf%20imza,pdf%20doldur%20ve%20imzala&hl=en) · SERP [pdf imzalama](https://www.google.com/search?q=pdf%20imzalama&hl=tr&gl=TR)
- Merge: Trends [merge pdf / pdf birleştirme / pdf birleştir / pdf birleştirici / pdf dosyalarını birleştir](https://trends.google.com/trends/explore?date=today%2012-m&geo=TR&q=merge%20pdf,pdf%20birle%C5%9Ftirme,pdf%20birle%C5%9Ftir,pdf%20birle%C5%9Ftirici,pdf%20dosyalar%C4%B1n%C4%B1%20birle%C5%9Ftir&hl=en) · SERP [pdf birleştirme](https://www.google.com/search?q=pdf%20birle%C5%9Ftirme&hl=tr&gl=TR)
- PDF to JPG: Trends [pdf to jpg / pdf jpg çevirme / pdf jpg dönüştürme / pdf'yi jpg'ye dönüştür / pdf jpg çevir](https://trends.google.com/trends/explore?date=today%2012-m&geo=TR&q=pdf%20to%20jpg,pdf%20jpg%20%C3%A7evirme,pdf%20jpg%20d%C3%B6n%C3%BC%C5%9Ft%C3%BCrme,pdf%27yi%20jpg%27ye%20d%C3%B6n%C3%BC%C5%9Ft%C3%BCr,pdf%20jpg%20%C3%A7evir&hl=en) · SERP [pdf jpg çevirme](https://www.google.com/search?q=pdf%20jpg%20%C3%A7evirme&hl=tr&gl=TR)

**Spanish** (`hl=es&gl=MX`; incumbents: PDF24, Smallpdf, Sejda all native; iLovePDF is a Spanish company; on Google's translated-results list: yes)

- Compress: Trends [compress pdf / comprimir pdf / comprime pdf / reducir pdf / reducir tamaño pdf](https://trends.google.com/trends/explore?date=today%2012-m&geo=MX&q=compress%20pdf,comprimir%20pdf,comprime%20pdf,reducir%20pdf,reducir%20tama%C3%B1o%20pdf&hl=en) · SERP [comprimir pdf](https://www.google.com/search?q=comprimir%20pdf&hl=es&gl=MX)
- Sign: Trends [sign pdf / firmar pdf / firma pdf / rellenar y firmar pdf / firma digital pdf](https://trends.google.com/trends/explore?date=today%2012-m&geo=MX&q=sign%20pdf,firmar%20pdf,firma%20pdf,rellenar%20y%20firmar%20pdf,firma%20digital%20pdf&hl=en) · SERP [firmar pdf](https://www.google.com/search?q=firmar%20pdf&hl=es&gl=MX)
- Merge: Trends [merge pdf / unir pdf / juntar pdf / combinar pdf / unir archivos pdf](https://trends.google.com/trends/explore?date=today%2012-m&geo=MX&q=merge%20pdf,unir%20pdf,juntar%20pdf,combinar%20pdf,unir%20archivos%20pdf&hl=en) · SERP [unir pdf](https://www.google.com/search?q=unir%20pdf&hl=es&gl=MX)
- PDF to JPG: Trends [pdf to jpg / convertir pdf a jpg / pdf a jpg / pasar pdf a jpg / convertir pdf a imagen](https://trends.google.com/trends/explore?date=today%2012-m&geo=MX&q=pdf%20to%20jpg,convertir%20pdf%20a%20jpg,pdf%20a%20jpg,pasar%20pdf%20a%20jpg,convertir%20pdf%20a%20imagen&hl=en) · SERP [convertir pdf a jpg](https://www.google.com/search?q=convertir%20pdf%20a%20jpg&hl=es&gl=MX)

**Italian** (`hl=it&gl=IT`; incumbents: PDF24, Sejda native; Smallpdf and iLovePDF too (own slugs); on Google's translated-results list: no)

- Compress: Trends [compress pdf / comprimi pdf / comprimere pdf / ridurre pdf / ridurre dimensioni pdf](https://trends.google.com/trends/explore?date=today%2012-m&geo=IT&q=compress%20pdf,comprimi%20pdf,comprimere%20pdf,ridurre%20pdf,ridurre%20dimensioni%20pdf&hl=en) · SERP [comprimi pdf](https://www.google.com/search?q=comprimi%20pdf&hl=it&gl=IT)
- Sign: Trends [sign pdf / firma pdf / firmare pdf / compila e firma pdf / firma digitale pdf](https://trends.google.com/trends/explore?date=today%2012-m&geo=IT&q=sign%20pdf,firma%20pdf,firmare%20pdf,compila%20e%20firma%20pdf,firma%20digitale%20pdf&hl=en) · SERP [firma pdf](https://www.google.com/search?q=firma%20pdf&hl=it&gl=IT)
- Merge: Trends [merge pdf / unisci pdf / unire pdf / unire file pdf / unisci file pdf](https://trends.google.com/trends/explore?date=today%2012-m&geo=IT&q=merge%20pdf,unisci%20pdf,unire%20pdf,unire%20file%20pdf,unisci%20file%20pdf&hl=en) · SERP [unisci pdf](https://www.google.com/search?q=unisci%20pdf&hl=it&gl=IT)
- PDF to JPG: Trends [pdf to jpg / convertire pdf in jpg / pdf in jpg / da pdf a jpg / pdf a jpg](https://trends.google.com/trends/explore?date=today%2012-m&geo=IT&q=pdf%20to%20jpg,convertire%20pdf%20in%20jpg,pdf%20in%20jpg,da%20pdf%20a%20jpg,pdf%20a%20jpg&hl=en) · SERP [convertire pdf in jpg](https://www.google.com/search?q=convertire%20pdf%20in%20jpg&hl=it&gl=IT)

**Arabic** (`hl=ar&gl=AE`; incumbents: PDF24, Smallpdf, iLovePDF, Sejda all native (LOC-01 already noted the deep ecosystem); on Google's translated-results list: yes)

- Compress: Trends [compress pdf / ضغط pdf / ضغط ملف pdf / تقليص حجم pdf / تصغير حجم pdf](https://trends.google.com/trends/explore?date=today%2012-m&geo=AE&q=compress%20pdf,%D8%B6%D8%BA%D8%B7%20pdf,%D8%B6%D8%BA%D8%B7%20%D9%85%D9%84%D9%81%20pdf,%D8%AA%D9%82%D9%84%D9%8A%D8%B5%20%D8%AD%D8%AC%D9%85%20pdf,%D8%AA%D8%B5%D8%BA%D9%8A%D8%B1%20%D8%AD%D8%AC%D9%85%20pdf&hl=en) · SERP [ضغط pdf](https://www.google.com/search?q=%D8%B6%D8%BA%D8%B7%20pdf&hl=ar&gl=AE)
- Sign: Trends [sign pdf / توقيع pdf / توقيع ملف pdf / التوقيع على ملف pdf / تعبئة وتوقيع pdf](https://trends.google.com/trends/explore?date=today%2012-m&geo=AE&q=sign%20pdf,%D8%AA%D9%88%D9%82%D9%8A%D8%B9%20pdf,%D8%AA%D9%88%D9%82%D9%8A%D8%B9%20%D9%85%D9%84%D9%81%20pdf,%D8%A7%D9%84%D8%AA%D9%88%D9%82%D9%8A%D8%B9%20%D8%B9%D9%84%D9%89%20%D9%85%D9%84%D9%81%20pdf,%D8%AA%D8%B9%D8%A8%D8%A6%D8%A9%20%D9%88%D8%AA%D9%88%D9%82%D9%8A%D8%B9%20pdf&hl=en) · SERP [توقيع pdf](https://www.google.com/search?q=%D8%AA%D9%88%D9%82%D9%8A%D8%B9%20pdf&hl=ar&gl=AE)
- Merge: Trends [merge pdf / دمج pdf / دمج ملفات pdf / دمج ملفين pdf / جمع ملفات pdf](https://trends.google.com/trends/explore?date=today%2012-m&geo=AE&q=merge%20pdf,%D8%AF%D9%85%D8%AC%20pdf,%D8%AF%D9%85%D8%AC%20%D9%85%D9%84%D9%81%D8%A7%D8%AA%20pdf,%D8%AF%D9%85%D8%AC%20%D9%85%D9%84%D9%81%D9%8A%D9%86%20pdf,%D8%AC%D9%85%D8%B9%20%D9%85%D9%84%D9%81%D8%A7%D8%AA%20pdf&hl=en) · SERP [دمج pdf](https://www.google.com/search?q=%D8%AF%D9%85%D8%AC%20pdf&hl=ar&gl=AE)
- PDF to JPG: Trends [pdf to jpg / تحويل pdf إلى jpg / تحويل pdf الى صور / pdf الى jpg / تحويل ملف pdf إلى صورة](https://trends.google.com/trends/explore?date=today%2012-m&geo=AE&q=pdf%20to%20jpg,%D8%AA%D8%AD%D9%88%D9%8A%D9%84%20pdf%20%D8%A5%D9%84%D9%89%20jpg,%D8%AA%D8%AD%D9%88%D9%8A%D9%84%20pdf%20%D8%A7%D9%84%D9%89%20%D8%B5%D9%88%D8%B1,pdf%20%D8%A7%D9%84%D9%89%20jpg,%D8%AA%D8%AD%D9%88%D9%8A%D9%84%20%D9%85%D9%84%D9%81%20pdf%20%D8%A5%D9%84%D9%89%20%D8%B5%D9%88%D8%B1%D8%A9&hl=en) · SERP [تحويل pdf إلى jpg](https://www.google.com/search?q=%D8%AA%D8%AD%D9%88%D9%8A%D9%84%20pdf%20%D8%A5%D9%84%D9%89%20jpg&hl=ar&gl=AE)

**Filipino** (`hl=tl&gl=PH`; no incumbent: PDF24 `/tl/` falls back to English, Smallpdf, iLovePDF and Sejda 404; not on the translated-results list). Reconnaissance SERPs only, phrasing constructed on LOC-01's observed pattern (Filipino verb, English object), so read the SERP and the autocomplete, not the phrasing:

- Compress: [paano mag compress ng pdf](https://www.google.com/search?q=paano%20mag%20compress%20ng%20pdf&hl=tl&gl=PH)
- Merge: [paano pagsamahin ang pdf files](https://www.google.com/search?q=paano%20pagsamahin%20ang%20pdf%20files&hl=tl&gl=PH)
- Sign: [paano pumirma sa pdf](https://www.google.com/search?q=paano%20pumirma%20sa%20pdf&hl=tl&gl=PH)
- PDF to JPG: [paano gawing jpg ang pdf](https://www.google.com/search?q=paano%20gawing%20jpg%20ang%20pdf&hl=tl&gl=PH)

**Bengali** (`hl=bn&gl=BD`; PDF24 native only, same shape as Telugu; on the translated-results list). Two reconnaissance SERPs on PDF24's own title terms:

- Compress: [pdf সংকোচন](https://www.google.com/search?q=pdf%20%E0%A6%B8%E0%A6%82%E0%A6%95%E0%A7%8B%E0%A6%9A%E0%A6%A8&hl=bn&gl=BD)
- Sign: [pdf সই](https://www.google.com/search?q=pdf%20%E0%A6%B8%E0%A6%87&hl=bn&gl=BD)

**Urdu** (`hl=ur&gl=PK`; no native incumbent: PDF24 `/ur/` falls back to English, Sejda tags an English page `lang="ur"`; on the translated-results list). Two reconnaissance SERPs, romanized, constructed:

- Compress: [pdf compress karne ka tarika](https://www.google.com/search?q=pdf%20compress%20karne%20ka%20tarika&hl=ur&gl=PK)
- Sign: [pdf par sign kaise karen](https://www.google.com/search?q=pdf%20par%20sign%20kaise%20karen&hl=ur&gl=PK)

**Two more checks that cost nothing while you are in GSC:**

1. **Per-country queries and positions** for Vietnam, Turkey, Mexico, Italy, the Philippines and the
   UAE (3 months). This is the field check: if a country's queries are all English blur/100kb at
   position 15+, the domain has no foothold there and a native page would start from zero authority
   in a field the majors own natively.
2. **The niche angle.** In-language versions of the queries we actually win: blur and compress-to-100kb.
   Constructed, so treat as SERP probes and not as demand: Vietnamese `làm mờ pdf`, Turkish `pdf
   bulanıklaştırma`, Spanish `difuminar pdf`, Italian `sfocare pdf`. If a native blur SERP has no tool
   result, only how-to articles, that is the one kind of opening consistent with where this domain
   already ranks. Report what shows, not a volume.

## Evidence, 2026-09-12 (Shlomi's Trends and SERP screenshots, same day)

**Trends, twelve months, native terms against the English yardstick (average bars, read off the charts):**

| Country | Task | English | Native | Ratio |
| --- | --- | --- | --- | --- |
| Vietnam | compress | `compress pdf` ~6 | `nén pdf` ~72, `nén file pdf` ~60, `giảm dung lượng pdf` ~30 | ~12x |
| Vietnam | merge | `merge pdf` ~7 | `ghép pdf` ~80, `ghép file pdf` ~70, `gộp file pdf` ~20 | ~11x |
| Vietnam | sign | `sign pdf` ~8 | `ký pdf` ~50, `ký file pdf` ~24, `chữ ký pdf` ~18 | ~6x |
| Turkey | compress | ~6 | `pdf küçültme` ~77, `pdf sıkıştırma` ~15 | ~13x |
| Turkey | sign | `sign pdf` ~38 | `pdf imza` ~30, `pdf imzalama` ~2 | parity |
| Mexico | compress | ~5 | `comprimir pdf` ~65, `reducir pdf` ~13 | ~13x |
| Mexico | merge | ~4 | `unir pdf` ~78, `juntar pdf` ~13 | ~20x |
| Italy | compress | ~11 | `comprimi pdf` ~74, `ridurre pdf` ~19, `comprimere pdf` ~17 | ~7x |
| UAE | compress | `compress pdf` ~78 | `ضغط pdf` ~8, `ضغط ملف pdf` ~6 | English 10x |
| UAE | merge | `merge pdf` ~83 | `دمج pdf` ~5, `دمج ملفات pdf` ~4 | English 17x |

**This refutes the premise LOC-10's removal case rested on.** "The ceiling is tens of impressions" was
generalised from India and Israel, which turn out to be the exceptions: in Vietnam, Turkey, Mexico and
Italy the native term is the market and the English term is the rounding error. Shlomi's intuition
("users will use their own language for search") holds for most of the top twenty; India, Israel,
Malaysia and the UAE (an expat market) are where it does not.

**SERPs, native primary term, desktop.** No Google-translated backfill on any of them; these fields
are full of real native pages.

| Query | Top ten | Read |
| --- | --- | --- |
| `nén pdf` (VN) | iLovePDF (native `/giam-dung-luong-pdf`), Smallpdf (511,392 reviews), PDF24 (14,955), FreePDFConvert, imagestool (native VN), Canva, Adobe, WPS; AI Overview; YouTube images. Related searches all Vietnamese, including `Nén PDF dưới 2MB`. | Majors native, six-figure review counts. |
| `ghép file pdf` (VN) | iLovePDF, Smallpdf (703,341), PDF24 (24,060), **O.Convertor at 4 with "Xử Lý Cục Bộ, file không cần upload"** (local processing, no upload), Canva, PDFStuff, FreePDFConvert, CleverPDF, CellphoneS blog. | The on-device claim is already taken in Vietnamese. |
| `pdf küçültme` (TR) | iLovePDF, Smallpdf (511,392), PDF24, PDF Guru (35,139), Adobe, Xodo, PDF Candy (211,139), pdfforge, i2PDF, Duplichecker. Related: `PDF küçültme 10 MB`, `PDF küçültme 5 MB`, `PDF küçültme 80`. | Majors native. **Target-size demand visible in the related block.** |
| `comprimir pdf` (MX) | iLovePDF, Adobe, Smallpdf (511,392), PDF24, PDFSmart, compress2go, AvePDF, PDFgear (10,143), Canva, PDF House. Related: `Comprimir PDF a 1mb`, `a 2MB`, `a 2MB gratis`, `al máximo`. | Same, plus **target-size demand**. |
| `unir pdf` (MX) | iLovePDF, Smallpdf (703,341), **UnePDF.com at 3: "Sin subir archivos, tus archivos nunca salen de tu dispositivo"**, PDF24, CamScanner, PDFgear, Adobe, PDFChef, Sejda. | The on-device claim is already at position 3 in Spanish. |
| `comprimi pdf` (IT) | iLovePDF (`/comprimere_pdf`), PDF24 (`/comprimi-pdf`), Adobe, Smallpdf, Canva, Foxit, PDFescape, **regispro.it: "no uploading to servers, no account required"**, Wondershare, Xodo. (Screenshot was Chrome-translated to English; the slugs are Italian, all native pages.) | Same, and the on-device claim is taken here too. |
| `دمج pdf` (AE) | iLovePDF, FreePDFConvert, Jotform, AvePDF, PDFAid, Smallpdf (703,341), Subformer, pdf2go, PDF Candy (666,765), WPS. | Native Arabic field, but the demand is English in the UAE. |
| `paano mag compress ng pdf` (PH) | AI Overview in Filipino, Adobe (Filipino), **pdf2go `/fil/` (27,337 reviews)**, piliapp `tl.`, PrintFriendly, compress2go `/fil/`, two English YouTube videos. | The incumbent probe above was too narrow: a real Filipino field exists on the second tier. Trends not run yet. |
| `pdf সংকোচন` (BD) | PDF24 (native), Xodo (native), 11zon, pdf2go, PrintFriendly, miniimagesvideos, rakko.tools, omnipdfsuite, all Bengali pages; AI answer. **Related searches all Bengali, including `পিডিএফ কম্প্রেসার 100`.** | Unlike Telugu, the related block is in the language. Trends not run yet. |

**Per-language verdict (criterion 1 / 2 / 3 against the decision rule):**

| Language | 1. Trends share | 2. Weak incumbent to beat | 3. Reviewer | Verdict |
| --- | --- | --- | --- | --- |
| Vietnamese | **Cleared, 6x to 12x** on compress, merge, sign | **Not met**: majors native, six-figure reviews, on-device claim already held by O.Convertor | None | Demand yes, generic tool page no (Indonesian's shape) |
| Turkish | **Cleared** on compress (13x); sign at parity | **Not met**: same field; target-size related searches (`5 MB`, `10 MB`, `80`) are the opening | None | Same; **strongest niche signal** |
| Spanish | **Cleared, 13x to 20x** | **Not met**: iLovePDF's home language; UnePDF holds the on-device claim at 3; `a 1MB / a 2MB` related searches | Easiest to source | Same; **easiest niche pilot to staff** |
| Italian | **Cleared, 7x**; not on Google's translated-results list, so a native page adds the most | **Not met**: same field, regispro.it holds the on-device claim | Sourceable | Same |
| Arabic (UAE) | **Fails**: English 10x to 17x | Native field, moot | | **No** for the UAE; Egypt and Saudi unmeasured and not in the top twenty |
| Filipino | Not run | A second-tier native field exists (pdf2go, piliapp, compress2go) | | Open; run the Trends chart before deciding |
| Bengali | Not run | One major (PDF24) plus second-tier native pages; related searches in Bengali | | Open; run the Trends chart before deciding |
| Urdu | Not run | | | Not run |

## Recommendation to LOC-10 (2026-09-12)

1. **Keep the mechanism.** The removal case's demand premise was wrong; the maintenance cost is real
   and is accepted knowingly.
2. **Do not localize a generic tool page into a new language.** LOC-07's lesson now has four more
   confirmations: the native `compress` and `merge` SERPs are the field this domain loses to in English,
   and the on-device differentiator is already claimed by a local site in Vietnamese, Spanish and
   Italian.
3. **Pilot the niche this domain already wins.** Target-size compression (`file compressor to 100kb`
   at 9.4, the site's best-converting query) shows up in the related-searches block of every strong
   market (`PDF küçültme 5 MB`, `comprimir pdf a 1MB`, `nén PDF dưới 2MB`, `পিডিএফ কম্প্রেসার 100`) and
   the majors do not build those pages. One localized target-size page, one market, a paid native
   reviewer, the SEO-17 rule applied (name the real portal limit behind the number, or do not build),
   eight weeks before a second. Spanish (Mexico) is the easiest to staff; Turkish has the clearest
   target-size cluster.
4. **Hebrew stays as is** and reads at LOC-03's date (2026-11-06). It is the weakest demand case of
   everything measured; LOC-09 waits.

## The ROI gate (goes into the findings doc section 2 with the decision)

Reopen or keep page localization for a language only when **both** hold:

- **Demand:** in-language search volume for the anchor tasks (or for the niche queries we win) of the
  order of the English page's own traffic from that country, on Trends and visible as in-language
  queries in GSC. Hebrew never met this; Indonesian did.
- **Field:** an English page of ours already ranks in the top ten on the *same kind of query* (not the
  same language), so the domain has shown it can compete in that field before a native edition asks it
  to. Generic compress/merge: never met, in any language. Target-size compress: met in English
  (`file compressor to 100kb`, position 9.4), which is why the niche is the only pilot on the table.

A language on Google's translated-results list needs a stronger case on both, because the English page
already reaches its searchers.

## Acceptance

- Every unmeasured language above has a verdict row in LOC-01's table format (Trends share / field /
  reviewer / verdict), with the evidence line and the screenshots noted, whatever the outcome.
- The per-country GSC positions recorded for the six countries named.
- The niche-angle SERPs read and recorded.
- One paragraph handed to [LOC-10](LOC-10.md): keep or remove, and why. LOC-10 decides; this ticket
  measures. No page built here.
