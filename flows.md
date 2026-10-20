# PM Coffee Time Bot: flow export

A readable export of all 9 flows from the SendPulse visual builder (export date: 20.10.2026). Bot texts are kept in the original Ukrainian.

**How to read it:**
- `#N` is a block on the canvas.
- `→ #N` is the next block.
- `{{var}}` is a bot variable.
- `[tag]` is a contact tag.

**Redacted:** private links (meetup recording, slides, Google Sheets, private Telegram group invite), webhook URLs, the Google Sheet ID and the guest speaker's name. Internal variable IDs are replaced with readable names.

**Variables:** `{{name}}`, `{{email}}`, `{{question}}`, `{{consent}}`, `{{invite_status}}` (set by the Google Apps Script webhook to `sent`), `{{rating}}` (1–5), `{{fb_text}}`.

**Tags:**
- `[pmct-70]`: registered for meetup #70
- `[fb-later]`: will give feedback later
- `[fb-done]`: feedback given
- `[fb-stop]`: declined to give feedback

---

## 1. Registration funnel

### Вітальний ланцюжок (welcome flow)
Trigger: the bot's welcome message, when a new user presses Start.
- #0 → run flow «Start»

### Start (registration for the next meetup)
Stats: 129 users entered, 116 clicked through.

Entry and announcement:
- #27 announcement: «**PM Coffee Time №70. Як менеджерити головного стейкхолдера свого життя.** Запрошений спікер: <guest speaker>.» Followed by 4 key points about the talk.
  - button «Зареєструватися» → #5

Consent and email:
- #5 «**Згода на обробку даних:** Email буде використано лише для відправки інвайту на зустріч.»
  - button «Погоджуюсь» → #2
  - or the user types an email → `{{email}}` → #6
- #2 «Email (напиши нижче свій емейл одним повідомленням, наприклад: name@gmail.com)» → input `{{email}}` (email validation: «Будь ласка, введіть коректний email»)
  - valid → #6
  - no reply in 60h → #11
- #6 set `{{consent}} = yes` → #14
- #14 tag `[pmct-70]` → #8
- #8 **webhook «Google Script»**: sends the calendar invite to the email → #25

Delivery check:
- #25 «Перевіряю статус відправки інвайту. Будь ласка, трошки почекайте...» → #15
- #15 wait 15 seconds → #23
- #23 clear `{{invite_status}}` → #16
- #16 **Google Sheets: read** the «Реєстрації» tab (Час, Код, Подія, Телеграм) → #17
- #17 if `{{invite_status}}` is `sent` → #7, else → #18
- #18 wait 2 minutes → #24
- #24 clear `{{invite_status}}` → #19
- #19 Google Sheets: read again → #20
- #20 if `{{invite_status}}` is `sent` → #7, else → #26
- #26 «Не вдалося надіслати інвайт. Ми розбираємось. Звʼяжіться з @hanizex, якщо хочете отримати інвайт на іншу пошту» → #21
- #21 **notify the owner in Telegram:** «Користувач {{telegram_id}} не може отримати інвайт»

Invite sent:
- #7 «Чудово. Інвайт надісланий на {{email}}. Додайте подію в календар, щоб не пропустити. Група учасників: <private Telegram group invite>» → #1

Optional questions:
- #1 «Імʼя»
  - button «Залишити як в Телеграм» → #3
  - or the user types a name → `{{name}}` → #3 (no reply in 15 min → #3)
- #3 «Питання спікеру» (with a playful crossed-out example question)
  - button «Пропустити» → #22
  - or the user types a question → `{{question}}` (validation: «Найгірше питання це те - яке не було задано...») → #22
- #22 webhook «Google Script»: saves name and question → #4
- #4 «**Підсумок:** Імʼя: {{name}} / Емейл: {{email}} / Питання: {{question}}. **Все вірно?**»
  - «Все вірно» → #28
  - «Змінити Емейл» → #2
  - «Змінити Імʼя» → #1
  - «Змінити питання» → #3
- #28 «Чудово, дякую за відповіді. Запрошення вже у вас на пошті і в календарі» → #9
- #9 close chat

User without an email:
- #11 if `{{email}}` does not exist → #13, else → #6
- #13 «Напиши /start, коли будеш готовий»
  - button «На початок» → #27
  - otherwise → #10
- #10 wait 2 hours → #12
- #12 notify the owner: «Користувач без емейлу {{telegram_id}}»

Out-of-season reply (no meetup open yet):
- #0 «Наступний анонс та запрошення будуть готові до кінця цього тижня. Залишайтесь на звʼязку 😎»

### Стандартна відповідь (fallback)
Trigger: any message the bot doesn't recognise.
- #0 «Щоб зареєструватись, натисніть /Start»
  - button «/Start» → run flow «Start»

---

## 2. Post-event follow-up

### Розсилка запису і матеріалів (recording and materials)
Sent as a campaign after the meetup. Stats: 30 delivered, 15 clicked.

- #0 «PM Coffee Time №69. Пошук роботи в 2026. Дякуємо, що були з нами!» It contains:
  - a short recap of the talk;
  - the recording: <meetup recording link>;
  - materials: slides, a job-application tracking sheet template, answers to the audience's questions (<links>);
  - a recommended job-search tool, [MyMgr](https://mymgr.app/);
  - «Допоможіть зробити наступні зустрічі кращими: після перегляду залиште оцінку.»

  Buttons:
  - «Залишити фідбек» → flow «Залишити фідбек»
  - «Спочатку подивлюсь запис» → flow «Ще не дивився»
  - «Не хочу давати фідбек» → flow «Не буду давати фідбек»

### Залишити фідбек (give feedback)
Stats: 6 entered, 5 clicked.

- #0, #2 clear `{{rating}}` and `{{fb_text}}` → #1
- #1 «Оціни зустріч від 1 до 5». Each button sets `{{rating}}` → #8:
  - «1 - Фігня, вимкнув майже відразу»
  - «2 - Не став би рекомендувати»
  - «3 - Таке собі, послухати можн»
  - «4 - Тема розкрита не повністю»
  - «5 - Поділюся записом з друзями»
- #8 «Дякую! Хочеш додати щось? Напиши одним повідомленням або натисни Пропустити»
  - the user types → `{{fb_text}}` → #9
  - or presses «Пропустити» → #9
- #9 webhook «Додаємо фідбек»: saves the rating and text to Google Sheets → #10
- #10 tag `[fb-done]` → #11
- #11 remove tag `[fb-later]` → #12
- #12 «Дуже дуже дякую!!!»

### Ще не дивився (watch later: reminder loop)
Stats: 10 entered, 4 clicked.

- #0 «Добре, нагадаю про фідбек через 3 дні!» → #1
- #1 tag `[fb-later]` → #2
- #2 webhook «Ще не дивився» → #3
- #3 wait 3 days → #4
- #4 if the tags are neither `[fb-done]` nor `[fb-stop]` → #5, else → #6 (close chat)
- #5 «Нагадування №1»
  - «Залишити фідбек» → flow «Залишити фідбек»
  - «Ще не було часу переглянути» → #8
  - «Не буду давати фідбек» → #10
- #8 «Ок, я нагадаю ще через тиждень» → #7
- #7 wait 7 days → #11
- #11 same tag check → #9, else → #6
- #9 «Останнє нагадування»
  - «Залишити фідбек» → flow «Залишити фідбек»
  - «Не буду давати фідбек» → #10
- #10 tag `[fb-stop]` → #14
- #14 remove `[fb-later]` → #13
- #13 webhook «No feedback» → #6
- #6 close chat

### Не буду давати фідбек (no feedback)
- #0 «Зрозуміло, дякую що були з нами!» → #1
- #1 remove `[fb-later]` → #2
- #2 tag `[fb-stop]` → #4
- #4 webhook «Не буду давати фідбек» → #3
- #3 close chat

---

## 3. Service flows

### Відписка від бота (unsubscribe)
Trigger: `/stop` or `/unsubscribe`.
- «Ви успішно відписалися.» → (typing 1 s) → «Щоб підписатися знову, відправте «/start» або «/subscribe»»

### Політика конфіденційності (privacy policy)
Trigger: `/privacy`.
- The SendPulse privacy-policy template, required by the Telegram Bot Platform terms. It covers the data collected, the legal basis, disclosure, deletion (by blocking the bot) and changes.
