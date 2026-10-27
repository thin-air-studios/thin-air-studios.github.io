# Growth plan: playshortfinal.com

For the studio owner. Plain words, honest numbers. The goal: people who search for something related to Short Final find the website, read something useful, and tap "Get the game" on Google Play.

Status when this plan was written (27 October 2026): the website is built but not yet live on its own domain. Guide pages and airport pages are built but not switched on, because their facts still need checking and an owner decision. The browser demo lives at /demo/. The game has a handful of installs so far.

---

## 1. What success looks like

The website is a search-and-install funnel:

1. Someone searches (or a friend, a creator or a directory sends them).
2. Google shows our page (an impression).
3. They click it (a click, measured in Search Console).
4. They read, play the demo, or tap "Get the game" (a store click, measured in Google Analytics as `play_store_click`).
5. They install on Google Play (an install, measured in Play Console, credited to the website through the `utm_source=site` link).

Each step loses people. The plan works on the steps we can move: getting found (steps 1 to 2), getting clicked (3), and making the store button the obvious next step (4). Step 5 depends on the Play listing, which is measured separately.

## 2. Targets for 30, 90 and 180 days

These are planning ranges for a brand-new domain with no history. They are not promises or forecasts. A new domain usually takes months to earn traffic from ordinary searches. Most early traffic will be people searching for the name "Short Final" or for our own pages.

| Measure | Where it comes from | Day 30 | Day 90 | Day 180 |
|---|---|---|---|---|
| Pages Google has indexed | Search Console, Indexing > Pages | 40 to 120 | 100 to 300 | 150 to 400 |
| Search impressions per month (all pages) | Search Console, Performance | 300 to 2,000 | 3,000 to 15,000 | 10,000 to 50,000 |
| Clicks from Google per month | Search Console, Performance | 15 to 100 | 100 to 600 | 400 to 2,000 |
| Click rate from search results | Search Console (clicks divided by impressions) | 2% to 4% | 3% to 5% | 3% to 6% |
| Store clicks per month (site visitors who tap Get the game) | GA4 event `play_store_click` | 10 to 60 | 60 to 300 | 200 to 1,000 |
| Installs credited to the website per month | Play Console acquisition, source `site` | 2 to 15 | 10 to 60 | 30 to 180 |
| Demo starts per month | GA4 event `demo_start` | 10 to 80 | 80 to 400 | 300 to 1,500 |

Notes on the numbers:

- GA4 counts only visitors who press Accept on the cookie banner, so its numbers run low. Cloudflare Web Analytics counts all page views without cookies, so it runs higher. Compare the two, and do not add them.
- Search Console data lags two to three days. GA4 data is usually next day. Play Console installs can lag by a day or more.
- Installs are the number that matters most. Store clicks tell us whether the site works; installs tell us whether people finish.
- If we are below the low end of a range at day 90, the plan is not failing yet. Check section 7 (what to change), and check for indexing problems first.

### What "good" looks like at 180 days

Roughly 30 to 180 installs a month from the site, a growing list of pages that Google shows for real searches, and a monthly visit count that rises steadily for three months in a row. Airport and guide pages should be bringing a steady share of clicks, not all of them from the name search.

## 3. The search engine: how pages get found

### The three kinds of page

1. **Brand and product pages.** Home (English and 12 languages), press kit, events, privacy and terms. These answer "what is Short Final" and "is it free", and they carry the Google Play link. They are already built.
2. **Guides.** Explainers about air traffic control, holding patterns, live flight tracking, airport codes, radio phrases, busiest airports, and the best games on Android. Guides are the main way to earn search traffic from people who are not yet searching for our name. Ten guides are written. They stay off until the figures in each one are checked against a source (see section 11 for the open checks).
3. **Airport pages.** One page for each airport with a full map layout, showing its runways, live flights and a "fly this airport in the game" link. These match searches such as "[airport name] runway map" and "[airport code] flights". They are built only for airports with a bundled map, and they go live only after the owner approves. Hard limit: the hosting service allows about 20,000 files per deployment, and the site is at roughly 16,000 now. That means we cannot make a page for every one of the 29,000 airports. The site keeps a total under 18,000 files, and the airport list is chosen by the maps we have.

### Internal links

Every page links to the pages around it: the home page links to guides, guides link to the airports they mention, and airport pages link back to the guides and the game. Google finds and ranks pages better when the site links them together. This is built into the templates. New pages added later must also be linked from a hub page (the guides list, a country page or the home page).

### How Google ramps up a new site

- Days 1 to 14: Search Console verifies the domain. Google reads the sitemap and finds the home page, then the linked pages. Some pages get indexed; many show as "Discovered, currently not indexed" for a few weeks. That status is normal for a new site.
- Weeks 2 to 8: Google indexes most core pages. Impressions start for the site name and close variants ("short final game", "short final flight"). Expect many impressions and few clicks.
- Months 2 to 6: Ordinary searches begin to show guides and airport pages, mostly for long, specific phrases with low competition. Clicks grow slowly. Rankings for broad terms like "air traffic control game" take many months and may never come.
- Do not resubmit the same page again and again. Submit the sitemap once. For a handful of important new pages, use Search Console's URL Inspection tool and choose Request indexing. Do this for only a few pages per week.
- Keep one canonical address. The site is served by GitHub Pages and by Cloudflare. Every page declares playshortfinal.com as its address, so search engines treat that one as the real site. Do not submit the GitHub copy to Search Console, and do not link to it in new pages.

## 4. Twelve-week content calendar

One new guide or page each week, starting Monday 2 November 2026. Each row lists the title, the page type, and the searches the page is written for. Search volumes are not listed here on purpose: check them in Search Console after the first month, and choose the next topic from what people actually search for.

Rules for every piece: write it for a real reader; state the source of every number; keep a short "Play Short Final" link at the end; publish only after the facts check in section 11.

| Week | Date | Title (working) | Type | Written for these searches |
|---|---|---|---|---|
| 1 | 2 Nov | What is Short Final? | Guide, existing | "short final game", "air traffic control game real flights" |
| 2 | 9 Nov | Busiest flying days for Thanksgiving | Guide, existing (publish before 26 Nov) | "busiest travel day thanksgiving", "thanksgiving flight delays" |
| 3 | 16 Nov | How live flight tracking works | Guide, existing | "how do flight trackers work", "live flight tracker how it works" |
| 4 | 23 Nov | Why holiday flights run late | Guide, new | "why are flights delayed", "holiday flight delays explained" |
| 5 | 30 Nov | Air traffic control games on Android, compared (2026) | Guide, existing (title already changed to match its content) | "air traffic control games android", "best atc game android" |
| 6 | 7 Dec | Holding patterns explained | Guide, existing | "what is a holding pattern", "holding pattern explained" |
| 7 | 14 Dec | How the daily challenge works | Page, new (explains a feature that is live) | "daily challenge air traffic game", "atc daily challenge" |
| 8 | 21 Dec | The busiest airports on Christmas Eve | Guide, new (use a named, dated data source) | "busiest airports christmas eve", "christmas flight travel days" |
| 9 | 28 Dec | Radio phraseology for beginners | Guide, existing | "atc radio phraseology", "aviation radio phrases" |
| 10 | 4 Jan | Weather and runway choice | Guide, existing | "how do pilots pick a runway", "crosswind landing explained" |
| 11 | 11 Jan | IATA and ICAO airport codes | Guide, existing | "iata vs icao", "what is an icao airport code" |
| 12 | 18 Jan | Short Final in numbers | Page, new (uses the game's public world totals, dated) | "short final game players", "air traffic game real flights statistics" |

Notes:

- Week 2 and week 8 are time-sensitive. Publish them early, or move them. A Thanksgiving page published on 27 November is too late.
- Weeks 4 and 8 are holiday pieces. The game's own holiday events (Thanksgiving Rush, Santa) are not live yet. Until the event flags in the site settings are switched on, the holiday pages describe the travel topic only and do not promise a game event.
- Week 12 needs the public world totals to be exposed on a page. Ask before building it.
- After week 12, keep the rhythm: two pieces a month, one guide and one page or update, plus a refresh of any guide that has begun to rank.

## 5. Link-earning plan

Links from other sites tell Google the site is worth ranking. They also send people who are already curious. Earn them with things people want to link to.

### Things to link to

- The press kit (/press/): fact sheet, icon, feature graphic, logo and the trailer. Easy for writers to use.
- The trailer (YouTube link on the press kit and home page).
- The browser demo (/demo/): 3 free games a day, with real airports via ?a=<airport code>. This is the best thing to show people who cannot install an app.
- The guides, once checked.
- Airport pages, where a local site or fan wants a map.

### Who to contact, and what to say

- **Aviation and plane-spotting sites and blogs.** Pitch the real-flight angle: "a free game that lands real live flights from public tracking data, at about 29,000 airports". Offer the demo link and the press kit.
- **Flight-sim communities (forums, Discord servers that allow promotion).** Post a helpful thread about how the game's approach works, not a banner ad. Answer questions. Post where the rules allow it, and no more than once in a community per month.
- **Airport fan pages and local aviation groups.** Only for airports where we have a real map page. Share the map page with a line about what it shows.
- **Podcasts (aviation, gaming, tech).** Send a short note and the press kit. Offer a short interview about how live flight data is used.
- **YouTubers and creators (the outreach kit is ready).** The kit is for mid-November, after version 3.4 is out, so creators see the holiday features. Follow the disclosure rules of each platform. Do not ask for a positive review.
- **Game directories and free-game portals.** Submit the game to directories that list free Android games. Use the Google Play link from the site so the installs stay credited correctly.
- **The browser demo on game portals.** Only where the portal's rules allow an embedded or linked game, and always with a link back to the site and to Google Play.

### What never to do

- Do not buy links, sponsored posts without a clear disclosure, or "link packages".
- Do not trade links in bulk ("link exchanges") or join link schemes.
- Do not post the same message in many groups or threads.
- Do not write fake reviews, fake press quotes, fake user counts or made-up awards.
- Do not offer rewards for ratings or reviews in the store. Store ratings must be earned.
- Do not add hidden text, cloaked pages or keyword lists to pages. Do not copy text from other sites.
- Do not claim the game is "number one", "the best" or "official" with any airport or airline.

## 6. Seasonal campaigns

Each campaign needs an event in the game (a flag in the site settings and a matching store update), or a travel topic that is true without an event. Never promote an event that is not live.

| When | Campaign | Needs | Website work |
|---|---|---|---|
| Late November to 1 December | Thanksgiving Rush | Event live in the game (flag `events.thanksgiving.live`) | Event page, Thanksgiving guide, the home banner. Creators and press in mid-November. |
| Mid-December to 26 December | Santa | Event live (flag `events.santa.live`) | Santa event page, Christmas Eve guide. |
| 27 December to 2 January | New Year | Game update or event (not planned yet) | A New Year travel guide, only if we have a sourced data set. |
| June to August | Summer travel peaks (including the 4 July and late-summer weeks) | Game weekend events (flag `events.weekend.live`) | Busiest-days guide for summer, a weekend events page. |
| Airshow season (check the dates each year) | Major airshows, for example EAA AirVenture at Oshkosh (late July) and the Farnborough International Airshow (July in even years) | None; a topical hook | A short "what to see from the air" page, and a note to aviation sites. Do not use the airshow names in a way that suggests we are connected to them. |

Rules for seasonal work: start two to three weeks ahead; flip the event flag only on the day the game update goes live; remove the seasonal banner the week after it ends.

## 7. Analytics: the monthly 20-minute review

Once a month, on the same day, spend about 20 minutes. Write one line per item in a notes file. This is the whole routine.

### Where to look

1. **Search Console** (search.google.com/search-console, property playshortfinal.com).
   - Performance: set the date range to "Last 28 days" and compare with the previous period. Note total clicks and impressions, and the top ten queries and pages.
   - Indexing > Pages: note how many pages are indexed, and the top reason for any "not indexed" page.
   - Sitemaps: the sitemap should say "Success".
2. **GA4** (analytics.google.com, property "Short Final website").
   - Reports > Engagement > Events: check `play_store_click` and `demo_start`.
   - Reports > Acquisition > Traffic acquisition: look at "Google organic search" (the search traffic) and the top referrers.
   - Reports > Engagement > Pages and screens: the top landing pages.
3. **Cloudflare Web Analytics** (the dashboard for playshortfinal.com): total page views, the top pages and the countries.
4. **Play Console** (play.google.com/console): under Grow users, the acquisition reports. Look for installs whose source is the website (`utm_source=site`, medium `web`).

### What to look for, and what to change

| If you see | It probably means | What to change |
|---|---|---|
| Impressions rising, clicks flat | Titles and descriptions do not match what people search for | Rewrite the title and description of the top pages with the most impressions. |
| Clicks rising, store clicks flat | People arrive but do not go to the store | Move the store button higher, or change the wording (section 8). |
| Store clicks rising, installs flat | The Google Play listing is not convincing | Change the first screenshots and the short description in Play Console. |
| Many pages "not indexed" | Google sees the pages as thin or duplicate | Add real content, links from other pages; do not resubmit. |
| Demo starts high, store clicks low | The demo works, the store button is not in view after it | Add the store link after the demo prompt. |
| Sudden drop in impressions | A technical problem or a Google update | Check the Indexing report and the sitemap, then wait two weeks before acting on a single drop. |

## 8. Conversion experiments

We test one thing at a time, and only when there is enough traffic to read the result.

### Rules

- Run one test at a time. Keep it for at least two weeks.
- Do not decide on a difference of a few visits. With a few hundred visits a month, the result is noise. Use common sense until the site has thousands of visits a month.
- Write the test down before starting: what we change, what we expect, and the number we will read.

### Ideas, in the order to try them

1. **The button wording.** "Get the game on Google Play" (current style) against "Play free on Android" or "Install free on Google Play". Measure store clicks per visit.
2. **The hero.** The main screenshot or the trailer first, or a short line about real flights first. Measure store clicks.
3. **The store button placement.** A second store button near the top of the guides, not only at the end.
4. **The demo prompt.** "Try a free game in your browser" before the store button, or after it.

### Google Play listing experiments

Play Console has store listing experiments for the app's icon, feature graphic and screenshots. Use them when store clicks are steady and installs are low. The menu is under Grow users; if the screen differs, search Play Console help for "store listing experiments" and follow what it shows.

## 9. What the automation does, and what the owner does

### The studio's automation (no owner time)

- Rebuilds the website when the content, the templates or the settings change (a GitHub Action in the repository).
- Adds new airport pages when new map layouts arrive, once the owner has approved airport pages.
- Adds new guides from the content folder, updates the sitemaps with dates, and keeps the internal links right.
- Runs the tests and the layout checks on every build (phone, tablet, desktop, light and dark).
- Prepares the monthly numbers from the reports, when the lead asks for them.

### The owner (few, short tasks)

- The one-time setup in OWNER-CHECKLIST.md (about one hour, once).
- The monthly 20-minute review (section 7).
- Approve each new guide before it is published: a five-minute read, plus a check of any number against its source.
- Switch the holiday and weekend event flags on the day the game update goes live (or ask the lead to do it).
- Reply to press, creators and partners. Forward anything that needs a decision to the lead.
- Keep the Google Play listing current: short description, screenshots and the website link.

## 10. Risks, and how to judge success

### Risks

- **Slow growth.** A new domain may take months to earn search traffic. Judge the first 90 days on indexing, impressions and store clicks, not on installs alone.
- **Thin airport pages.** Pages made from a data set can look like low-quality templates. Each airport page must carry its own facts (the layout, the runways, real flight data) and a useful paragraph. Do not publish airport pages that are only a name and a map.
- **Facts that are wrong.** Aviation readers notice mistakes quickly. Every guide figure needs a source, and any claim we cannot check is removed before publishing. Some guide claims (holding timings, speeds, and the phraseology notes) still need checking against the published aviation references before they go live.
- **The file limit.** The hosting service allows about 20,000 files per deployment. The site is at roughly 16,000 now. Adding airport pages uses that budget, so airport pages are chosen with care.
- **Event promises.** A holiday or weekend event promised on the website before the game ships is a broken promise. The site's flags must match the game release.
- **Competitors and existing games.** Other air traffic games already rank for broad terms. Our angle is real live flights and a free start. Stay honest about that.
- **Licence and credit.** The live flight data comes from a public tracking network. Its licence and credit wording are a decision for the owner or the studio's legal adviser before the site is marketed widely.
- **Consent and numbers.** Google Analytics counts only consenting visitors. Read the numbers as a floor, not a total.
- **One person holds the keys.** The lead developer holds the repository and the settings. Keep a second person (the owner) able to log in to the domain, the hosting, Search Console, Google Analytics and Play Console.

### How to judge success

- **At 30 days:** the site is live on playshortfinal.com, the sitemap shows "Success", and some pages are indexed. Impressions have started. Nothing is broken.
- **At 90 days:** impressions are in the planning range, store clicks are steady each month, and at least some installs are credited to the site. Decide the next quarter's guides from the search queries.
- **At 180 days:** installs from the site are at or above the planning range, several guides bring search clicks every month, and the monthly review takes the full 20 minutes without surprises.

If a measure is far below its range, check in this order: (1) is the site indexed and linked, (2) do the titles match real searches, (3) does the store button get clicked, (4) does the Play listing convert. Fix the first thing that is broken before changing anything else.

## 11. Next decisions for the owner

1. Turn on the guide pages once the figures are checked (the open checks are listed in the studio's notes for the lead).
2. Approve airport pages, and how many (within the file limit).
3. Confirm the live Play Store version, so the wording "from version 3.3" on the home page is right.
4. Decide the public contact address (now thinaircapital@gmail.com; later hello@playshortfinal.com once email routing is set up).
5. Decide on the live flight data licence and credit wording with counsel.
6. Decide when the creator outreach goes out (planned for mid-November, after version 3.4).
