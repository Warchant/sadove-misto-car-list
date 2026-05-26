# zhk-car-list

Static mobile-first React app for a Google Sheet with car number / phone mappings.

## Google Sheet

Create a sheet with this header row:

| Номер авто | Телефон | Марка | Колір | Нотатки |
| --- | --- | --- | --- | --- |

The app reads from columns `A:E`. Users authenticate with Google. Their read/write
rights are exactly the rights they have on the Google Sheet.

## Google Cloud setup

1. Create or open a Google Cloud project.
2. Enable **Google Sheets API**.
3. Configure OAuth consent screen.
4. Create an OAuth 2.0 Client ID of type **Web application**.
5. Add your local and production origins:
   - `http://localhost:5173`
   - your GitHub Pages or Cloudflare Pages origin
6. Copy `.env.example` to `.env` and fill in:

```bash
VITE_GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
VITE_GOOGLE_SHEET_ID=your-google-sheet-id
VITE_GOOGLE_SHEET_NAME=Cars
```

The sheet id is the value between `/d/` and `/edit` in the Google Sheets URL.

## Development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

Deploy the generated `dist` folder to any static host.
