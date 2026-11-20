# BORINA TV — Full-Stack Community Streaming Platform

BORINA TV is a full-stack community streaming platform built for Cambodia and Southeast Asia with **React + TypeScript**, **Tailwind CSS**, **Firebase Authentication**, **Cloud Firestore**, **Express backend API**, **HLS/MP4 streaming**, **resumable chunked uploads**, and **KHR (`៛`) Premium billing** supporting **KHQR** and **ABA PayWay**.

## Features Implemented
- **Public Streaming Storefront**: Home featured dramas, Khmer/Chinese/Korean/Thai categories, Movies, Series, Free & Premium filters, search, series detail pages, 1–5 star ratings & reviews, watchlist favorites, watch history resume, and Copyright/Content reporting.
- **Video Player (`/watch/:episodeId`)**: HTML5 + `hls.js` playback supporting MP4, WebM, and HLS (`.m3u8`), playback speed control, SRT/VTT subtitle rendering, fullscreen, previous/next episode navigation, automatic playback resume, and server-signed Premium authorization checks.
- **Creator Studio (`/creator/dashboard`, `/creator/upload`, `/creator/my-content`)**: Resumable chunked uploads for posters, cover art, video files (up to 2GB), and `.srt`/`.vtt` subtitles, mandatory distribution rights confirmation, edit/delete ownership enforcement, and Pending moderation workflow.
- **Cambodia KHR Premium Billing (`/membership`, `/payment`)**:
  - Default Monthly Premium: **៛8,000 / month** (`~$2.00 USD` at `1 USD = 4,000 KHR`)
  - Default Yearly Premium: **៛100,000 / year** (`~$25.00 USD` at `1 USD = 4,000 KHR`)
  - All pricing and exchange rates are stored in Firestore (`site_settings/public_config`) and editable by Admin.
  - Supports **KHQR**, **ABA PayWay**, and **Pending Manual Payment Verification**. Never fakes paid transactions or fabricates merchant QR codes when credentials are missing.
- **Admin Control Panel (`/admin`)**: Revenue statistics (KHR), editable pricing & exchange rate, gateway toggles, payment approval/rejection/refund workflow, CSV payment export, direct subscription activation/suspension/expiration control, content moderation queue, user/creator management, category manager, copyright report resolution, and an immutable `audit_logs` ledger.

## Firebase Setup Notes
1. **Firestore Rules**: Hardened rules for all 15 collections are defined in `firestore.rules` and audited with `@firebase/eslint-plugin-security-rules`. Please review and tailor them before wide public distribution.
2. **Storage Rules**: Defined in `storage.rules` for posters, covers, avatars, videos, and subtitles.
3. **Enabling Email/Password Sign-In**:
   - Google Sign-In is enabled out of the box.
   - To also enable Email/Password registration and login, open the [Firebase Console](https://console.firebase.google.com/) → your project → **Authentication** → **Sign-in method** → click **Email/Password** → toggle **Enable** → **Save**.

## Environment Variables
Copy `.env.example` to `.env` and populate your server-side payment credentials when ready for live Cambodia billing:
- `STREAM_SIGNING_SECRET`: Random HMAC secret for signed video stream URLs.
- `KHQR_MERCHANT_ID`, `KHQR_ACCOUNT_ID`, `KHQR_API_TOKEN`, `KHQR_WEBHOOK_SECRET`
- `ABA_PAYWAY_MERCHANT_ID`, `ABA_PAYWAY_API_KEY`, `ABA_PAYWAY_API_URL`, `ABA_PAYWAY_CHECK_URL`, `ABA_PAYWAY_CALLBACK_SECRET`

> Never place payment secret API keys in client-side `VITE_*` variables or Firestore documents.

## Running Locally & Deploying
```bash
npm install
npm run dev       # Starts Express API + Vite frontend on http://localhost:3000
npm run build     # Builds production frontend bundle into dist/
npm start         # Runs Express production server on port 3000
```

### Deploying to Vercel / Cloud Run
- **Cloud Run / Node host**: Set environment variables from `.env.example`, run `npm run build`, and start with `npm start` (port 3000).
- **Vercel**: Connect the repository (`vercel.json` is pre-configured for SPA routing) and host the Express streaming/payment API on a persistent Node/Cloud Run service with S3/R2/Firebase Storage for large video uploads.
