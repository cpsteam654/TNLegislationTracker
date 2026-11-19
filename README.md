# CPS Legislation Tracker

The Cooley Public Strategies tracker for the 115th Tennessee General Assembly (2027 session), published as its own website.

**How it works**

- **The site** is hosted free on GitHub Pages at one permanent link the team can bookmark. No Claude account is needed to use it.
- **Bill updates** run on their own at 9am, noon and 5pm Central. A GitHub Action pulls new and changed bills from LegiScan, saves them here, and republishes the site. Nobody downloads or uploads anything.
- **Team records** (client folders, bill tags and notes, hearings, CPS connections and the outreach log) live in a free Supabase database. Everyone sees the same records, and each one is stamped "Added by K. Farris" with the date.
- **Signing in:** the opening page asks "Who's using the tracker?" You pick your name and type the team password, and you stay signed in on that device.
- **Alerts:** when an update finds something important, like a new bill on a priority issue or a hearing for a tagged bill, a card posts to a Teams channel.

**What's in this folder**

| Path | What it is |
| --- | --- |
| `site/` | The website itself. `site/config.js` holds the database address. |
| `site/data/` | Bill and lawmaker files. The scheduled update rewrites these, so don't edit them by hand. |
| `scripts/update.mjs` | The scheduled bill update. |
| `.github/workflows/publish.yml` | The schedule and publishing steps. |
| `supabase/setup.sql` | Sets up the team database. Run it once. |
| `cache/` | The update's memory of what it has already seen. |

---

## One-time setup (about 30 minutes)

Have these ready:

- your LegiScan API key
- the team's names and work emails
- the team password

The team password is never stored in these files. You set it for each person in Supabase.

### Part 1: The database (Supabase)

1. Go to [supabase.com](https://supabase.com), sign up, and choose **New project**.
   - Name it `cps-legislation-tracker`.
   - Generate a database password and save it somewhere safe. This one is for Supabase itself, not the team.
   - Pick a US region.
   - Wait about two minutes for it to finish.
2. Open **SQL Editor**, then **New query**. Paste in everything from `supabase/setup.sql`, then click **Run**. You should see "Success."
3. **Add the team list.** In a new query, paste the block below and fill in each work email. The short name is what shows in "Added by." The `sort` number sets the order in the dropdown. Then click **Run**.

   ```sql
   insert into public.team_members (id, full_name, short_name, email, sort) values
     ('kfarris', 'Kathryn Farris', 'K. Farris', 'WORK-EMAIL-HERE', 1),
     ('dcooley', 'Dave Cooley',    'D. Cooley', 'WORK-EMAIL-HERE', 2)
   on conflict (id) do update set full_name = excluded.full_name, short_name = excluded.short_name,
     email = excluded.email, sort = excluded.sort, active = true;
   ```
4. **Create each person's sign-in.** Go to **Authentication**, then **Users**, then **Add user**, then **Create new user**. For each person on the team list:
   - Enter the same work email as in step 3.
   - Enter the team password.
   - Check **Auto Confirm User**.
   - Click **Create user**.
5. **Turn off public sign-ups.** Go to **Authentication** and open the sign-in settings (**Sign In / Providers**). Turn off **Allow new users to sign up**, then save. Only the people you create in step 4 can sign in.
6. **Copy three things** from **Project Settings**:
   - The **Project URL**, under **Data API** (it's also on the project's home page).
   - The **Publishable key**, under **API Keys**. This goes in the website and is safe to show.
   - The **Secret key**, also under **API Keys**. It goes only into GitHub's locked secrets in Part 3. Never put it in a file.

### Part 2: The Teams channel for alerts

1. In Teams, pick a standard channel the team watches. Workflows can't post to private channels.
2. Hover over the channel name, click **…** (More options), then **Workflows**.
3. Choose **Post to a channel when a webhook request is received**. Newer versions of Teams may call it **Send webhook alerts to a channel**.
4. Name it "Legislation Tracker alerts," click **Next**, confirm the team and channel, and click **Add workflow**.
5. Copy the long URL it shows, then click **Done**. Keep the URL private, since anyone with it can post to the channel.

### Part 3: The website and automatic updates (GitHub)

1. `site/config.js` already has your Project URL and Publishable key filled in. If you ever start a new Supabase project, those two lines are what change.
2. In GitHub, create a **new repository** named `legislation-tracker`.
   - Make it **Public**. GitHub's free plan only publishes Pages from public repositories. No keys, passwords or team records live in these files.
   - Leave "Add a README" unchecked.
3. On the new repository's page, click **uploading an existing file**. Drag in everything inside this folder, including the `.github` folder, then click **Commit changes**.
   - On a Mac, `.github` is hidden. Press Cmd+Shift+Period in Finder to show it.
   - If `.github` doesn't come through, choose **Add file**, **Create new file**. Name it `.github/workflows/publish.yml`, paste in that file's contents, and commit.
4. Go to **Settings**, **Pages**. Under **Build and deployment**, set **Source** to **GitHub Actions**.
5. Go to **Settings**, **Secrets and variables**, **Actions**. Under **New repository secret**, add each of these:

   | Name | Value |
   | --- | --- |
   | `LEGISCAN_API_KEY` | your LegiScan key |
   | `SUPABASE_URL` | the Project URL |
   | `SUPABASE_SECRET_KEY` | the Supabase Secret key |
   | `TEAMS_WEBHOOK_URL` | the Teams workflow URL from Part 2 |

6. Open the **Actions** tab.
   - A run from your upload may already show a red X, because Pages wasn't on yet. That's expected.
   - If GitHub asks, turn workflows on.
   - Click **Update bills and publish**, then **Run workflow**. Wait about two minutes for a green check.
7. Go to **Settings**, **Pages** to see "Your site is live at" and your link. It looks like `https://YOUR-ACCOUNT.github.io/legislation-tracker/`.
8. Back in Supabase, go to **Authentication**, **URL Configuration**, set **Site URL** to that link, and save.

### Part 4: Share it

Send the team the link and the team password separately, and ask them to bookmark the link. The first time, each person picks their name, types the password, and is in.

---

## Day to day

- **New bills** appear on their own after the 9am, noon and 5pm runs. The sidebar shows when the bill data last updated.
- **Adding a teammate:** add them to `team_members` (Part 1, step 3), then create their sign-in (Part 1, step 4).
- **Removing a teammate:** in **Table Editor**, `team_members`, set `active` to false, then delete them under **Authentication**, **Users**.
- **Changing the team password:** under **Authentication**, **Users**, open each person and set the new password.
- **Changing the design:** replace the files in `site/css` or `site/js` and commit. The site republishes in about a minute, and bill data and team records aren't touched.
- **If an update fails** (a red X on the Actions tab), the site keeps showing the last good data. GitHub emails the repository owner. The most common cause is a LegiScan key that changed or ran out of monthly queries.
- **No alert in Teams:** alerts only post when something important happens. To test the connection, run the workflow by hand on a day new priority bills are filed.
- **Custom address** (optional): to use something like `tracker.cooleypublicstrategies.com`, add it under **Settings**, **Pages**, **Custom domain**, and follow GitHub's DNS steps. Then add a repository **variable** (not a secret) named `SITE_URL` with the new address, so Teams alerts link to it.

## Notes on privacy

- Bill and lawmaker information in `site/data` is public record and sits in the public repository.
- Client tags, notes, hearings, connections and outreach live only in Supabase. They can only be read by a team member who has signed in.
- Everyone shares one password, so anyone who has it can sign in under any name on the list. "Added by" works on trust: pick your own name.
- The site asks search engines not to list it.

Bill data from [LegiScan](https://legiscan.com), CC BY 4.0.
