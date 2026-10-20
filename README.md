# PM Coffee Time Bot

A Telegram bot for **PM Coffee Time**, an online meetup series for project and product managers (70 episodes so far). The bot runs the full attendee journey: announcement → registration → calendar invite → reminders → recording and materials → feedback, so the organiser doesn't do any of it by hand.

Built **without code** in the SendPulse visual builder, with Google Apps Script and Google Sheets behind it for invites and data. This repository documents how it is designed. The full flow logic is in [flows.md](flows.md).

## The problem

Every meetup used to mean the same manual routine: collect registrations from different chats, send calendar invites one by one, chase people who gave a broken email, send the recording afterwards, and ask for feedback that almost nobody gave. I wanted one entry point with predictable steps and data I could measure.

## How the journey works

```mermaid
flowchart LR
    A[Announcement<br/>topic + speaker] --> B[Consent +<br/>email]
    B --> C[Google Apps Script<br/>sends calendar invite]
    C --> D{Invite<br/>delivered?}
    D -- yes --> E[Name + question<br/>for the speaker]
    D -- "no, after 2 retries" --> F[Notify organiser<br/>+ ask user to contact]
    E --> G[Summary:<br/>edit or confirm]
    G --> H[Meetup]
    H --> I[Recording +<br/>materials]
    I --> J{Feedback?}
    J -- now --> K[Rating 1–5<br/>+ comment]
    J -- later --> L[Reminder in 3 days,<br/>last one in 7 days]
    J -- no --> M[Stop, no more pings]
    L --> K
```

## Design decisions

- **Email first, extras optional.** Only the email is required, because it is what the invite needs. Name and the question for the speaker come *after* the invite is sent, and both can be skipped, so a drop-off never costs a registration.
- **Delivery is checked, not assumed.** After the webhook asks Google Apps Script to send the invite, the bot reads the result back from Google Sheets. It retries after 15 seconds and after 2 minutes. If the invite still isn't sent, the user gets a clear message and the organiser gets a Telegram alert with the user's ID.
- **No silent dead ends.** A user who never leaves an email gets a gentle nudge, and the organiser is told after 2 hours. Any unrecognised message leads back to `/start`.
- **Feedback without nagging.** Three honest choices: *give feedback*, *watch first*, *no thanks*. "Watch first" gets at most two reminders (after 3 days and after 7 days). Tags (`fb-later`, `fb-done`, `fb-stop`) guarantee that nobody is reminded after answering or declining.
- **Rating scale in plain words.** Each score from 1 to 5 is described by behaviour ("turned it off almost immediately" … "will share the recording with friends"), not abstract numbers. This makes answers comparable.
- **Privacy built in.** Explicit consent before the email is asked for, `/privacy` with a policy, `/stop` to unsubscribe, and data deleted when the bot is blocked.

## Results

Numbers from the SendPulse statistics for meetups #69–#70:

| Metric | Value |
|---|---|
| Users who opened the registration flow | 129 |
| Pressed a registration button | 116 (90%) |
| Recording and materials delivered | 30 |
| Pressed a button under the materials | 15 (50%) |
| Feedback flow entered | 6 |

The weakest step is clearly feedback: half of the attendees click on the materials, but few leave a rating. A possible next step is a one-tap rating right inside the materials message.

## Stack

| Part | Tool |
|---|---|
| Conversation flows, tags, variables, delays, conditions | SendPulse chatbot builder (Telegram) |
| Calendar invites, saving answers | Google Apps Script, called by webhooks |
| Registrations and feedback storage | Google Sheets |
| Organiser alerts | SendPulse → Telegram notifications |

## Files

- [`flows.md`](flows.md): all 9 flows block by block, with texts, buttons, conditions, delays and transitions. Private links, webhook URLs and IDs are redacted.

---

Built by [Mykola Kalakutskyi](https://github.com/hanizex): Senior Delivery Manager. [LinkedIn](https://linkedin.com/in/hanizex)
