# How to Add Intella HTML Description to top.gg

## Step-by-Step Instructions

### Step 1: Access Your Bot Page on top.gg
1. Go to [top.gg](https://top.gg)
2. Log in with your Discord account
3. Navigate to your bot's page (or create a new bot listing if you haven't already)
4. Click **"Edit"** or **"Manage"** on your bot's page

### Step 2: Upload the HTML File
1. In the bot management/edit page, look for the **"Description"** or **"Long Description"** field
2. top.gg allows HTML files to be uploaded for bot descriptions
3. You have two options:

   **Option A: Upload HTML File Directly**
   - Look for an **"Upload HTML"** or **"Import HTML"** button
   - Click it and select `intella-topgg-description.html`
   - The HTML will be imported into the description field

   **Option B: Copy HTML Content**
   - Open `intella-topgg-description.html` in a text editor
   - Copy ALL the HTML content (from `<!DOCTYPE html>` to `</html>`)
   - Paste it into the description field on top.gg
   - Make sure the field accepts HTML (it should have an HTML editor or "Source" mode)

### Step 3: Preview and Save
1. Use the **"Preview"** button to see how it looks
2. Make sure the OAuth button is clickable and links correctly
3. Click **"Save"** or **"Update"** to publish your changes

### Step 4: Verify
1. Visit your bot's public page on top.gg
2. Check that:
   - The description displays correctly
   - The "FREE UNTIL 8/1/26" badge shows
   - All features are listed
   - The "Add Intella to Discord" button is visible and clickable
   - Clicking the button opens Discord OAuth and allows adding the bot

## Important Notes

- **HTML Support**: top.gg supports HTML in bot descriptions, but some tags/styles might be sanitized for security
- **OAuth Button**: The button links directly to Discord's OAuth flow with your bot's client ID
- **Styling**: All styles are inline, so they should work even if external CSS is blocked
- **Testing**: Always preview before saving to ensure everything displays correctly

## Troubleshooting

**If the HTML doesn't display:**
- Make sure you're pasting the full HTML (including `<html>`, `<head>`, `<body>` tags)
- Check if top.gg has a "Source" or "HTML" mode toggle in the editor
- Some platforms require you to enable HTML mode explicitly

**If the button doesn't work:**
- Verify the OAuth URL is correct: `https://discord.com/oauth2/authorize?client_id=1393695244976918588&permissions=1126967206737984&integration_type=0&scope=bot+applications.commands`
- Make sure the link opens in a new tab (`target="_blank"` is included)

**If styling looks off:**
- top.gg might strip some CSS properties for security
- The inline styles should work, but you may need to adjust colors/spacing if needed

## Need Help?

If you run into issues, check top.gg's documentation or support for HTML description formatting.
