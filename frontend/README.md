# Typing App

## Run locally with one origin

Requirements: Node.js 22, .NET 10, and PowerShell.

From the repository root, run:

```powershell
.\scripts\run-single-origin.ps1
```

The script builds Angular, copies the browser output into
`backend/TypingApp.Api/wwwroot`, and runs the ASP.NET app on port `5027`.
Open `http://localhost:5027/`.

## Develop with Angular's proxy

Start the backend in one terminal:

```powershell
dotnet run --project .\backend\TypingApp.Api\TypingApp.Api.csproj --launch-profile http
```

In another terminal:

```powershell
Set-Location .\frontend
npm ci # first run only
npm start
```

Open `http://localhost:4200/`. The Angular development proxy forwards `/api`
and `/raceHub` to port `5027`; WebSocket proxying is enabled for SignalR.

## Remote play over one public address

Install `cloudflared`, then start the single-origin script from the repository
root:

```powershell
.\scripts\run-single-origin.ps1
```

In a second terminal, start a temporary public tunnel:

```powershell
cloudflared tunnel --url http://localhost:5027
```

Share the HTTPS URL printed by `cloudflared`. Both players open that same URL,
then one creates a room and shares its room code with the other. The tunnel
supports the SignalR WebSocket connection; the local application remains on
HTTP port `5027`. Anyone who has the tunnel URL can access the app, so share it
only with the intended players.

Production CORS is disabled for same-origin play. If a separate frontend origin
is intentionally used, set `CORS_ALLOWED_ORIGINS` to a comma-separated list of
allowed origins.

## Docker

Build and run the combined Angular + ASP.NET container:

```powershell
docker compose up --build
```

Open `http://localhost:5027/`. Docker Compose runs one application container
and persists the SQLite database in a named volume.

`RaceRoomStore` is in-memory and contains the room state for this single app
instance. Rooms are lost on restart; do not scale this container to multiple
instances without moving room state to shared storage.

## Build and tests

```powershell
Set-Location .\frontend
npm run build
npm test -- --watch=false

Set-Location ..
dotnet build
dotnet test
```

With the development backend and Angular proxy running, validate two-player
SignalR over the dev origin (including the CORS preflight check):

```powershell
Set-Location .\frontend
$env:SINGLE_ORIGIN_BASE_URL = "http://localhost:4200"
npm run test:e2e:single-origin
Remove-Item Env:\SINGLE_ORIGIN_BASE_URL
```
