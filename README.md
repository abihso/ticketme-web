# Ticketing web app

The admin dashboard and public guest-ticket page are built with React and Vite.

## Guest ticket route

`/guest-ticket#token=...` is a public route. Guests open the link from their email
to display their QR code, event, table, seat, and current entry status without
signing in. Opening the page does not check in the guest. Used or reassigned
tickets cannot display an active QR code.

For local preview, start the backend and run `npm run dev` here. Open
`http://localhost:5173/guest-ticket#token=YOUR_GUEST_TICKET_TOKEN` with a current
assigned guest token. Set `VITE_API_URL` to the backend origin in `web/.env`.

## Production setup (when ready to deploy)

1. Set `VITE_API_URL` to your public HTTPS backend origin before building.
2. Run `npm run build` and deploy the generated `dist/` directory.
3. Configure the hosting service to serve `index.html` for `/guest-ticket`
   (a SPA rewrite), so email links work when opened directly or refreshed.
4. Set `WEB_APP_URL` on the backend to your public HTTPS website origin, for
   example `https://tickets.example.com`. New ticket emails use this website's
   `/guest-ticket#token=...` route. `PUBLIC_API_URL` remains the backend origin.
5. Include the website origin in the backend's comma-separated `CORS_ORIGINS`.

The domain can be configured at deployment time; no production URL is hardcoded.

## Local email testing

The development server listens on the local network. Before testing guest email
links on a phone, set backend `WEB_APP_URL` to this computer's LAN website URL
(for example `http://192.168.1.5:5173`) and web `VITE_API_URL` to the LAN backend
URL (`http://192.168.1.5:4000`). If backend `CORS_ORIGINS` is configured, include
the LAN website origin. Keep both servers running and connect the guest phone
to the same Wi-Fi. Update these URLs if the computer's LAN address changes.
Use public HTTPS URLs after deploying; development links do not work off-network.
