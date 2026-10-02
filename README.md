# Huishouden Home

Keeping the house in good shape, together, from the living-room tablet or anyone's phone.

Live at https://huishouden-home.web.app, also linked from the [Huishouden portal](https://huishouden-piekstra.web.app).
Installable on the tablet, phones and laptops, and works offline (changes sync when the connection is back).

## Screenshots

| Overview | Upkeep |
|---|---|
| ![Overdue gutter cleaning first, then what is due in the next two weeks, booked visits, a warranty ending and this year's spending](docs/screenshots/overview.png) | ![Every upkeep job grouped as overdue, next two weeks and later, with its schedule and provider](docs/screenshots/upkeep.png) |

| History | Warranties and manuals |
|---|---|
| ![Booked visits, then the year's history with costs](docs/screenshots/history.png) | ![Appliances with their warranty end, receipt and manual links](docs/screenshots/warranties.png) |

| Done, with Undo | A job's schedule |
|---|---|
| ![Marking a job done moves it on and offers Undo](docs/screenshots/done.png) | ![Editing a job that repeats every month on the 1st](docs/screenshots/job-dialog.png) |

| Contacts | Import from calendar |
|---|---|
| ![Service providers with tap-to-call numbers and map links](docs/screenshots/contacts.png) | ![House visits found in the calendar, each with Add](docs/screenshots/calendar-import.png) |

| Phone: overview | Phone: upkeep |
|---|---|
| ![The overview on a phone](docs/screenshots/phone-overview.png) | ![The upkeep list on a phone](docs/screenshots/phone-upkeep.png) |

_Screenshots of the live site signed out, which shows an invented sample house dated October 2031. Refreshed by CI after each deploy._

## How schedules work

A job repeats in one of two ways:

- **Counted from when it's done**: "every 3 months" for an HVAC filter. Marking it done sets the next
  due date one interval after that day.
- **On set dates**: "every month on the 1st" for HOA dues, "every year on February 1" for an
  insurance renewal. Marking it done moves to the next date after both the due date and the day it
  was done, so doing an overdue job once covers the missed dates.

Months clamp to the month's last day (January 31 plus a month is February 28) and keep the 31st for
later months. Everything is in local calendar days. Adding a past history entry for a job also marks
the job done on that day when it is the latest time it was done; a future entry is a booked visit.

## Data

Signed-in members of a Huishouden household read and write under `households/{householdId}`:

| Collection | Fields |
|---|---|
| `homeTasks` | `title`, `category`, `schedule` (`kind`, `every`, `unit`, `anchor` for set dates), `due`, `lastDone`, `contactId`, `notes`, `calendarEventId`, `calendarLink`, `createdAt`, `updatedAt`, `by` |
| `homeServiceLog` | `date`, `title`, `taskId`, `contactId`, `who`, `costCents`, `notes`, `calendarEventId`, `calendarLink`, `createdAt`, `updatedAt`, `by` |
| `homeWarranties` | `item`, `details`, `purchaseDate`, `warrantyEnd`, `receiptUrl`, `manualUrl`, `contactId`, `notes`, `createdAt`, `updatedAt`, `by` |

Dates are `YYYY-MM-DD`; costs are whole cents. The documents are built in `src/lib/model.ts` with exactly
these keys, which the Firestore rules (in [huishouden/rules](https://github.com/huishouden/rules), the repo that
owns the project's rules file) accept and nothing more. Providers live in the household-wide `contacts` collection
shared by every app (`@huishouden/pwa-kit/contacts`); Home shows those whose `apps` include `home`. Signing in uses
Google with no extra scopes; the household comes from the shared `households` document, so one invite from the
portal opens every Huishouden app.

Home also publishes to the household agenda (`households/{householdId}/agenda`, through
`@huishouden/pwa-kit/agenda`), which the portal shows as one calendar and a Today view. Every member
can read it, so it carries only titles, schedules and contact names:

| Kind | From | Status |
|---|---|---|
| `due` | each job's next due date, with its schedule and contact | `upcoming`, `overdue` once the day has passed |
| `appointment` | history entries booked ahead (dated after the day they were added), with the contact | none |
| `renewal` | a warranty's end date ("Dishwasher warranty ends"), with its details | none |

Items are all-day, cover 30 days back to 180 days ahead (overdue jobs whatever their age), and link to
`#upkeep`, `#history` or `#warranties`. Each save updates its record's items; opening the app
reconciles everything. The signed-out sample house writes nothing. The mapping is `src/lib/agenda.ts`.

Find in my calendar and Import from calendar read Google Calendar (read-only) through
`@huishouden/pwa-kit/calendar`; Google asks once for permission the first time. Find a business looks
places up on OpenStreetMap (`@huishouden/pwa-kit/places`), only when Search is pressed.

## Develop

```sh
bun install          # also enables the pre-commit leak scan
bun run env:pull     # writes .env.local from the repo's VITE_* variables
bun run dev          # http://localhost:3004
bun run lint && bun run test && bunx pwa-design-check && bun run build
bun run e2e          # Playwright smoke and sample-data feature tests against the live site (BASE_URL to override)
bun run screenshots  # README screenshots (SCREENSHOT_DIR to override)
bun run icons        # regenerate the logo and PNG icons
```

Built on [huishouden-pwa-kit](https://github.com/huishouden/pwa-kit) and follows its
[design language](https://github.com/huishouden/pwa-kit/blob/main/DESIGN.md) and
[standard](https://github.com/huishouden/pwa-kit/blob/main/STANDARD.md). Pushes to `main` deploy to
Firebase Hosting (project `huishouden-piekstra`, site `huishouden-home`), then run the smoke tests and refresh the screenshots.
