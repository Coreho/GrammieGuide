# Checking Buddy's replies

Run this by hand after changing Buddy's prompt or selected model. It makes up to
eight paid requests with the API key saved in admin → Buddy. It never runs with
`npm test` or the E2E suite, and refuses to run in CI.

```powershell
npm run build
npx tsx scripts/checkBuddyReplies.ts --live
```

The default settings file is `%APPDATA%\grammieguide\grammieguide-config.json`.
For another local profile, add `--config "C:\path\grammieguide-config.json"`.
Do not paste keys into commands or chat. The selected provider and model are used
unchanged, including the production OpenRouter routing pin and the frozen prompt.

The script starts the real built app in a temporary profile. It copies only Buddy's
selected provider, model and key. Your real app settings, PIN, photos, music and
conversation history are not used or changed. Each synthetic statement starts a
fresh conversation. The temporary profile is removed after the app closes.

Reports go to the gitignored `test-results/buddy-replies/` folder. They contain
the fixed statements, replies, model/provider names and rule flags, never API keys.
Exit code 1 means a request failed, a case was skipped, or a reply needs review.
A failed request stops the remaining cases.

**Read every reply, even when no rule flags appear.** The checks flag common
affirmations, invented appointments, guesses and promises; they can miss harmful
phrasing and can flag a harmless sentence. A clean run is evidence for these
samples, not a safety guarantee. Check that Buddy meets the feeling without
confirming a confused premise, inventing a plan or arguing. Keep the report locally
and record only the model, date and review outcome in the Backlog task.
