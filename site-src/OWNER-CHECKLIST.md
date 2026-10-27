# Owner checklist: set up playshortfinal.com

One sitting, about an hour. Each step takes five minutes or less. Do them in order.

Menu names below were checked against the official help pages where they exist. If a screen looks different, follow what it shows. Every service has a search box; search for the word in the step.

## Before you start (two minutes)

- Sign in to these with the studio Google account: Cloudflare (the domain playshortfinal.com must be on it), Google Search Console, Google Analytics, Play Console, and YouTube Studio.
- You need a GitHub account that can see the repository thin-air-studios/thin-air-studios.github.io.
- Wait for the lead to say the website has been merged to the main branch. Until then, the site lives on another branch, and step 1 should wait.
- Keep three things handy to send the lead at the end: the Google Analytics Measurement ID (starts with G-), the Cloudflare Web Analytics token (32 characters), and a note that the steps are done.

## Step 1: Put the site on Cloudflare Pages (5 min)

1. Go to dash.cloudflare.com. In the left menu, click **Workers & Pages**.
2. Click **Create application**, then the **Pages** tab, then **Import an existing Git repository**.
3. Click **Connect to Git** or **Connect GitHub**. If GitHub asks, allow Cloudflare Pages on the thin-air-studios account. You need Maintainer access or higher on the repository.
4. Pick **thin-air-studios/thin-air-studios.github.io**, then click **Begin setup**.
5. Fill in:
   - Project name: `short-final-site`
   - Production branch: `main`
   - Framework preset: **None**
   - Build command: leave it empty
   - Build output directory: `/`
6. Click **Save and Deploy**. Wait until the deployment says Success.
7. Open the project. Click the **Custom domains** tab, then **Set up a domain**. Type `playshortfinal.com`, click **Continue**, then **Activate domain**.
8. Repeat step 7 for `www.playshortfinal.com`. If Cloudflare offers to redirect www to the main domain, choose that. If it does not, tell the lead.

## Step 2: Google Search Console (5 min)

1. Go to search.google.com/search-console. Sign in with the studio Google account.
2. Open the property menu at the top left and click **Add property**. Choose **Domain** (the left-hand option). Type `playshortfinal.com`, then click **Continue**.
3. Google shows a TXT record. If it offers to add the record for Cloudflare, choose that, sign in, and allow it. If not, copy the TXT record value. Then in Cloudflare: open playshortfinal.com, click **DNS**, then **Records**, then **Add record**. Set Type to `TXT`, Name to `@`, paste the value into Content, and click **Save**.
4. Back in Search Console, click **Verify**. DNS can take a few minutes.
5. In the left menu, click **Sitemaps**. Type `sitemap.xml` in the "Add a new sitemap" box and click **Submit**. The status should show Success within a day.

## Step 3: Bing Webmaster Tools (3 min)

1. Go to webmaster.bing.com and sign in.
2. On the **My Sites** page, click **Import**.
3. Choose **Google Search Console**, sign in with the studio Google account, select playshortfinal.com, and click **Import**. Bing checks the site automatically, so there is no second verification.

## Step 4: Cloudflare Web Analytics and Crawler Hints (5 min)

1. In the Cloudflare dashboard, in the left menu, click **Analytics & Logs**, then **Web Analytics**.
2. Click **Add a site** (or **Automatic setup** if Cloudflare offers it for the Pages project `short-final-site`). Enter `playshortfinal.com`.
3. Copy the snippet. Find the value after `"token":`. It is 32 characters. Send it to the lead. You do not need to add the snippet to the site yourself.
4. Turn on Crawler Hints. Open the playshortfinal.com domain in the Cloudflare dashboard. Click **Caching**, then **Configuration**, then turn on **Crawler Hints**. This tells search engines when pages change.

## Step 5: Google Analytics 4 (5 min)

1. Go to analytics.google.com and sign in. Click **Admin** (the gear icon at the bottom left).
2. In the **Property** column, click **Create property**. Name it `Short Final website`. Choose your time zone and currency. Click **Next**, fill in the business details, then click **Create**. Accept the terms if asked.
3. Choose **Web** as the platform. Enter `https://playshortfinal.com` as the website URL and `Short Final website` as the stream name. Leave Enhanced measurement on, then click **Create stream**.
4. The stream page shows the **Measurement ID** at the top right, starting with `G-`. Copy it and send it to the lead. You can find it later under Admin > **Data streams** > the Web stream.

## Step 6: Email for hello@playshortfinal.com (5 min)

1. In the Cloudflare dashboard, open playshortfinal.com. In the left menu, click **Email**, then **Email Routing**. If the menu says **Email Service** > **Email Routing**, use that.
2. Click **Destination addresses**, then **Add destination address**. Type the studio Gmail address and submit. Open the verification email from Cloudflare and click **Verify email address**.
3. Back in Email Routing, open the **Routing rules** tab and click **Create address** (or **Create routing rule**). In the custom address box type `hello`. Set the action to **Send to an email**, choose the Gmail address as the destination, then click **Save**.
4. If Cloudflare asks you to add mail records, click the button to add them.
5. Test it: send an email from a different account to hello@playshortfinal.com. It should arrive in Gmail (check Spam if not).

Note: replies go out from the Gmail address, not from hello@. The website still uses thinaircapital@gmail.com for now. The lead will switch it when you are ready.

## Step 7: Google Play website link (3 min)

1. Go to play.google.com/console and open the Short Final app.
2. In the left menu, click **Grow users**, then **Store presence**, then **Store settings**.
3. Find **Store listing contact details**. In the **Website** box type `https://playshortfinal.com`. Click **Save**. If Play asks, send the change for review.

## Step 8: YouTube channel and trailer (3 min)

1. Go to studio.youtube.com.
2. In the left menu, click **Customisation**, then the **Profile** tab. Find **Links**, click **Add link**, set the title to `Short Final website` and the URL to `https://playshortfinal.com`, then **Publish**.
3. In the left menu, click **Content**, open the Short Final trailer, click **Show more** under the description, add the line `Website: https://playshortfinal.com`, then **Save**.

## Done

Send the lead:

- The Google Analytics Measurement ID (G-...)
- The Cloudflare Web Analytics token (32 characters)
- A note that steps 1 to 8 are done, and any step that did not match the screens

Then the site is checked by the lead, and the monthly 20-minute review in GROWTH-PLAN.md starts the month after launch.
