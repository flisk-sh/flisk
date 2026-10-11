# A real `dotnet new web` project (ASP.NET Core minimal API): the template is generated at build time.
FROM mcr.microsoft.com/dotnet/sdk:9.0@sha256:1330d3c4144aec2695036a125d9a3b49a1fc555c9024c981248fa83d40fa8b23 AS build
ENV DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1
WORKDIR /src
RUN dotnet new web --name App --output . --no-restore \
 && dotnet publish -c Release -o /out
FROM mcr.microsoft.com/dotnet/aspnet:9.0@sha256:6b29f9d598b387b4b44653408d773cbdbf8f1d6b24289460b228a24f31a38b53
WORKDIR /app
COPY --from=build /out .
RUN groupadd --gid 1000 app && useradd --uid 1000 --gid app --no-create-home app
USER app
# Kestrel must listen beyond loopback (0.0.0.0) and on the port TDK assigns.
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD bash -c "exec 3<>/dev/tcp/127.0.0.1/${PORT:-8080}" || exit 1
CMD ["sh", "-c", "ASPNETCORE_URLS=http://0.0.0.0:${PORT:-8080} exec dotnet App.dll"]
