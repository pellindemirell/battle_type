FROM node:22-alpine AS frontend-build
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS backend-build
WORKDIR /src
COPY backend/TypingApp.Api/TypingApp.Api.csproj ./TypingApp.Api/
RUN dotnet restore ./TypingApp.Api/TypingApp.Api.csproj
COPY backend/TypingApp.Api/ ./TypingApp.Api/
COPY --from=frontend-build /frontend/dist/typing-app-ui/browser ./TypingApp.Api/wwwroot
RUN dotnet publish ./TypingApp.Api/TypingApp.Api.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=backend-build /app/publish .
EXPOSE 5027
ENV ASPNETCORE_URLS=http://+:5027
ENTRYPOINT ["dotnet", "TypingApp.Api.dll"]
