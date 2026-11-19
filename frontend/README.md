# Typing App

## Run locally on Windows

Start the .NET API from the repository root in one PowerShell terminal:

```powershell
dotnet run --project .\backend\TypingApp.Api\TypingApp.Api.csproj --launch-profile http
```

The API listens on port `5027` on all local interfaces. In a second terminal, start Angular:

```powershell
Set-Location .\frontend
npm ci # first run only
npm start
```

Open `http://localhost:4200/`. To share the app with another device on the same
network, find this computer's Wi-Fi IPv4 address with `ipconfig` and open
`http://<IPv4-address>:4200/` on that device. Angular derives the API host from
the page host and uses port `5027`. Allow inbound TCP ports `4200` and `5027`
through Windows Firewall for private networks if prompted. The current Wi-Fi
address is allowed by `frontend/angular.json`; update its `allowedHosts` list
if the address changes.

## Run with Docker Compose

From the repository root:

```powershell
docker compose up --build
```

The frontend is available at `http://localhost:4200/` and the API at
`http://localhost:5027/`.

## Build and tests

```powershell
npm run build
npm test -- --watch=false
```
