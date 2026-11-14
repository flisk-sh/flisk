# A real `dotnet new web` project (ASP.NET Core minimal API): the template is generated at build time.
FROM mcr.microsoft.com/dotnet/sdk:10.0@sha256:fe0fd4e93bd2fbb47c883b7a6369e5c8d3db8bf01cdc5981f6ee35fbdf3ff4fb AS build
ENV DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1
WORKDIR /src
RUN dotnet new web --name App --output . --no-restore \
 && dotnet publish -c Release -o /out
FROM mcr.microsoft.com/dotnet/aspnet:10.0@sha256:bfd912c83295ce66d4b706ebb8541b9f14259b0e76fbb88b2751f58ce2399d2e
WORKDIR /app
COPY --from=build /out .
RUN groupadd --gid 1000 app && useradd --uid 1000 --gid app --no-create-home app
USER app
# Kestrel must listen beyond loopback (0.0.0.0) and on the port Flisk assigns.
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD bash -c "exec 3<>/dev/tcp/127.0.0.1/${PORT:-8080}" || exit 1
CMD ["sh", "-c", "ASPNETCORE_URLS=http://0.0.0.0:${PORT:-8080} exec dotnet App.dll"]
