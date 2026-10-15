# Translations to review

Please ask a native speaker who knows the Bible in each language to read every Spanish, French, Yoruba, Igbo and Hausa line in `src/App.jsx`:
- the `UI_TEXT` block (the original wording);
- the `EXTRA` block (new in COMPASS-01).

**New in COMPASS-02:** every journey screen is in `src/strings-journey.js`. This includes the four test questions people answer themselves, the step follow-up, and the grace message. If any word is missing, English is shown instead.

## Fixed in COMPASS-01
- Yoruba prayer heading: "Ìpàdé" (meeting) → "Àdúrà" (prayer).
- Yoruba "Begin a New Session": "Bẹ̀rẹ̀ Ìpàdé Tuntun" → "Bẹ̀rẹ̀ Ìdánwò Tuntun".
- Igbo "Begin a New Session": "Malite Ọgụgụ Ọhụrụ" → "Malite Nnwale Ọhụrụ".
- Hausa error messages that still contained the English word "again".

## Please check most carefully
1. **The stage verses** (`verse1`, `verse2`, `verse3`, `footer`) in every language. They should match a recognised Bible in that language (for example Reina-Valera 1909, Louis Segond 1910, Bibeli Mimọ, Baịbụl Nsọ, Littafi Mai Tsarki), word for word.
2. **The crisis screen** (`crisisTitle`, `crisisText`) in every language. It must be clear and gentle, and should name the right emergency number for the countries we serve.
3. **The test names** (Yoruba "Kristológìkì" / "Kánónìkì", Hausa "Canonical", Igbo "Kanọn"). Are there better words people actually use in church?
4. **The result labels** (`sources`) and **the prayer headings** (`prayerLabels`).

## Showing Scripture in each language
Today, verses are shown in the King James Version (English) for every language, with the explanation in the person's language. To show verses in their own language, we need a Bible text we are allowed to use:
- Spanish: Reina-Valera 1909 (public domain).
- French: Louis Segond 1910 (public domain).
- Yoruba, Igbo, Hausa: a source and its permissions still need to be confirmed.
