# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary: one person, an older woman with dementia, using her own Windows computer.** She operates it with a mouse, not a touchscreen. How much she can read and follow varies from day to day, so the product has to work on her worst day, not her average one. She is a skilled knitter who is proud of what she makes, and she should be treated as a capable adult.

**Secondary: her family caregiver**, who sets everything up and changes it in a PIN-protected admin panel. The caregiver is not always beside her, so what they set up has to keep working unattended.

## Product Purpose

GrammieGuide replaces the Windows desktop with a full-screen Home she can use without learning a computer. Success, in the owner's words, means three things:

1. **She manages alone.** She gets to what she wants and back Home without calling anyone for help.
2. **She stays connected.** She keeps in touch with family through calls, photos and familiar people.
3. **She has enjoyment and skill.** She has things she enjoys and stays herself: knitting, music, pictures, games and her companion, Buddy.

Family peace of mind was deliberately not named as a measure of success. The reliability work below is a constraint that makes those three possible, not the goal.

## Positioning

It is built for one particular person rather than a category of users. Her family loads it with her own photos, her music, her knitting patterns and her finished work, and her Home stays arranged the way she knows it. A general senior-friendly launcher can offer large buttons; it can't truthfully offer her own life, kept where she expects it.

## Operating Context

- One Windows computer, running full screen and on top of everything, starting at sign-in. A watchdog restarts the app if it stops.
- She uses a mouse, although this computer also has a touchscreen. Code and older docs say "tap", which predates knowing that; words she sees or hears say "click".
- The computer has speakers and a microphone: Buddy can speak and listen, and pages can be read aloud.
- She is often alone with it, and the connection can drop, so her own content has to work offline.
- The caregiver reaches the admin panel by keyboard shortcut. She has no route to it and no settings of her own on Home.
- The older Grandma's Launcher stays installed as a fallback and is never uninstalled.
- At the time of writing, development happens on this same computer and account, so test runs must not disturb her screen.

## Capabilities and Constraints

**What she can do:** open tiles for websites, installed apps and built-ins (Weather, News, Photos, Music, Games, Knitting, Family calls); chat with Buddy, a 3D cat companion, by typing or talking; browse approved sites in a protected browser; count knitting rows, read patterns and look through her finished pieces; find, save and read Ravelry patterns without its website.

**Rules future work must keep:**

- A tile keeps its position and color. Adding, editing or removing another tile never moves or repaints it, and Home never scrolls.
- There is always a way back Home. Nothing leaves her on a blank, frozen or dead-end screen.
- Failures appear as a calm line in plain words, never an error code or technical detail. Technical detail goes to the caregiver's logs.
- Nothing claims success until it has really happened.
- A double-click acts once, because the first click has already changed what is under the pointer.
- Only the caregiver changes settings, and caregiver-only actions are enforced in the main process, not just hidden in the interface.
- Logs say that something happened, never what was said, read, searched for or who it concerns.
- Updates never change her saved choices or how Home looks unless the caregiver opts in.

**Terminology:** Home (her main screen), tile (an item on Home), shelf (a built-in's screen of large cards), Buddy (the cat), caregiver (family member using admin), admin (the caregiver's panel).

**Undecided:**

- Whether she actually double-clicks, uses the wheel or can drag a scrollbar. The app now handles all three, but none has been tried with her.
- Whether her pointer is large enough for her to follow, which is a Windows setting.
- How long a text she can use on a bad day, which affects long descriptions such as Ravelry notes.
- Whether four patterns at a time, and saving at all, suit her. Nobody has tried it with her yet.
- Whether Ravelry's API terms allow saving designers' pictures, descriptions and free PDFs on her computer.

## Brand Commitments

- The name is GrammieGuide.
- Voice: calm, plain and kind. Short sentences and no jargon.
- Buddy never asks a question she has to answer unprompted, and never says something that might be false.
- The visual system is recorded separately in `DESIGN.md`.

## Evidence on Hand

- Real content on her computer: her family photos, DROPS knitting patterns and her games. These stay on her computer, out of this repo.
- Ravelry patterns are other people's work: designers' pictures and PDFs stay on her computer and never go in this repo.
- Earlier visual approvals: `UI Screenshots/clay-launcher-design/` and `design/home-cards/`.
- Setup and verification notes: `docs/`, the README's Status section, and Backlog tasks.
- Several features are recorded as not yet checked on the real computer, and TASK-13, TASK-49 and TASK-51 still need hands-on walkthroughs.
- There are no usability studies, measurements or testimonials. Don't claim or imply any; whether something suits her is known only from what the owner reports.

## Product Principles

1. **Design for her worst day.** If it needs a good day to work, it doesn't work.
2. **Recognition over learning.** What she knows stays where she knows it, and she is never asked to learn a new way to do something familiar.
3. **Nothing is a dead end.** Every screen shows the way back, and every failure says something calm and offers somewhere to go.
4. **She stays herself.** Respect her as a skilled adult with her own work and people; this isn't a simplified product for a patient.
5. **Tell her the truth.** Never say something opened, sent or played unless it really did.

## Accessibility & Inclusion

- Dementia comes first: limit what she must remember, read or decide at any one time, and never rely on her recalling an earlier step.
- Mouse is her confirmed input, so targets have to be easy to reach and hit with a pointer.
- Text size has five caregiver-set steps, and every screen has to work at all of them.
- Offered background colors are held to WCAG AA contrast against the theme's text by a unit test.
- Reduced motion is supported, including a calmer mode for Buddy.
- Nothing she does is timed or scored against her.
- The specifics of her vision, hearing and motor ability are not recorded here and shouldn't be assumed.
