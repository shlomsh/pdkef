# Sign language and font acceptance matrix

Generated from [`scripts/language-acceptance.mjs`](../scripts/language-acceptance.mjs). Do not edit this table directly.

A shipped row means its real alphabet coverage is checked against bundled font bytes; its named Chrome guard covers shaping or records why shaping is not applicable; its sample is exercised through every real supported face for visible ink and searchable PDF text; direction and native digits are part of that sample. Export-render baseline cases add artifact-level visual coverage where listed. Typed signatures remain raster images and are outside the searchable-text claim.

| Order | State | Languages | Regional signal | Accepted fonts | Direction | Shaping evidence | Chrome visual evidence |
| ---: | --- | --- | --- | --- | --- | --- | --- |
| 1 | shipped | English, Spanish, French, German, Portuguese, Indonesian, Malay, Filipino, Irish, Polish | Latin script; regional accents are covered by the separate Latin Extended set | Kalam, Mali, Arimo, Tinos, Cousine, Heebo, Alef, PT Sans, Noto Sans Bengali, Mukta Mahee, Noto Sans Tamil, Mukta | LTR | e2e/sign/latin-shaping-guard.spec.js | e2e/sign/latin-shaping-guard.spec.js<br>e2e/sign/export-render-guard.spec.js |
| 2 | shipped | Chinese (Simplified) | Mainland China; Singapore | Noto Sans SC | LTR | not-applicable | e2e/sign/cjk-advance-parity-guard.spec.js<br>e2e/sign/export-render-guard.spec.js |
| 3 | shipped | Chinese (Traditional) | Taiwan; Hong Kong; Macao | Noto Sans TC | LTR | not-applicable | e2e/sign/cjk-advance-parity-guard.spec.js<br>e2e/sign/export-render-guard.spec.js |
| 4 | shipped | Hindi, Marathi | India; Marathi includes ळ and ऱ | Kalam, Mukta | LTR | e2e/sign/devanagari-shaping-guard.spec.js<br>e2e/sign/devanagari-mukta-shaping-guard.spec.js | e2e/sign/devanagari-shaping-guard.spec.js<br>e2e/sign/devanagari-mukta-shaping-guard.spec.js<br>e2e/sign/export-render-guard.spec.js |
| 5 | shipped | Arabic | Middle East; North Africa | Scheherazade New | RTL | e2e/sign/arabic-shaping-guard.spec.js | e2e/sign/arabic-shaping-guard.spec.js<br>e2e/sign/export-render-guard.spec.js |
| 6 | shipped | Dari, Farsi, Urdu, Pashto | Afghanistan; Iran; Pakistan; Urdu exports in Naskh, not conventional Nastaliq | Scheherazade New | RTL | e2e/sign/arabic-shaping-guard.spec.js | e2e/sign/arabic-shaping-guard.spec.js<br>e2e/sign/export-render-guard.spec.js |
| 7 | shipped | Bengali (Bangla), Assamese | Bangladesh; India; Assamese includes ৰ and ৱ | Noto Sans Bengali | LTR | e2e/sign/bengali-shaping-guard.spec.js | e2e/sign/bengali-shaping-guard.spec.js<br>e2e/sign/export-render-guard.spec.js |
| 8 | shipped | Russian, Ukrainian, Belarusian, Bulgarian, Serbian (Cyrillic), Macedonian, Kazakh (Cyrillic) | Eastern Europe; Central Asia | PT Sans | LTR | not-applicable | e2e/sign/export-render-guard.spec.js |
| 9 | shipped | Japanese | Japan | Noto Sans JP | LTR | not-applicable | e2e/sign/cjk-advance-parity-guard.spec.js<br>e2e/sign/export-render-guard.spec.js |
| 10 | shipped | Korean | South Korea | Noto Sans KR | LTR | not-applicable | e2e/sign/cjk-advance-parity-guard.spec.js<br>e2e/sign/export-render-guard.spec.js |
| 11 | shipped | Vietnamese | Vietnam | Arimo, Tinos, Cousine, Mali | LTR | not-applicable | e2e/sign/latin-shaping-guard.spec.js |
| 12 | shipped | Thai | Thailand | Mali, IBM Plex Sans Thai | LTR | e2e/sign/thai-font-parity.spec.js | e2e/sign/thai-font-parity.spec.js<br>e2e/sign/export-render-guard.spec.js |
| 13 | shipped | Telugu | India | Anek Telugu | LTR | e2e/sign/telugu-shaping-guard.spec.js | e2e/sign/telugu-shaping-guard.spec.js |
| 14 | shipped | Tamil | India; Sri Lanka | Noto Sans Tamil | LTR | e2e/sign/tamil-shaping-guard.spec.js | e2e/sign/tamil-shaping-guard.spec.js |
| 15 | shipped | Punjabi (Gurmukhi) | India | Mukta Mahee | LTR | e2e/sign/gurmukhi-shaping-guard.spec.js | e2e/sign/gurmukhi-shaping-guard.spec.js |
| 16 | shipped | Malayalam | India | Anek Malayalam | LTR | e2e/sign/malayalam-shaping-guard.spec.js | e2e/sign/malayalam-shaping-guard.spec.js<br>e2e/sign/export-render-guard.spec.js |
| 17 | shipped | Greek | Greece; Cyprus | Arimo, Tinos, Cousine | LTR | not-applicable | e2e/sign/export-render-guard.spec.js |
| 18 | shipped | Hebrew | Israel | Arimo, Tinos, Cousine, Assistant, Heebo, Alef, Gveret Levin | RTL | e2e/sign/hebrew-font-parity.spec.js<br>e2e/sign/hebrew-composition-guard.spec.js | e2e/sign/hebrew-font-parity.spec.js<br>e2e/sign/export-render-guard.spec.js |
| 19 | planned | Gujarati, Kannada, Odia | India | — | LTR | pending | pending |
| 20 | planned | Emoji | Global | — | LTR | pending | pending |

Simplified and Traditional Chinese stay separate because shared Han code points do not identify the intended regional glyph shapes; the explicit font choice is the signal. Urdu's shipped face is Naskh, not conventional Nastaliq. Planned rows do not become supported until all evidence columns are populated.
