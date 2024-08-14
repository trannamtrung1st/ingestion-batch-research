# See https://aka.ms/containerfastmode to understand how Visual Studio uses this
# Dockerfile to build your images for faster debugging.

FROM mcr.microsoft.com/dotnet/aspnet:8.0.7-alpine3.20 as base
WORKDIR /app

FROM mcr.microsoft.com/dotnet/sdk:8.0.303-alpine3.20 AS build
WORKDIR /src
COPY ["IBR.MqttListener/IBR.MqttListener.csproj", "IBR.MqttListener/"]
RUN dotnet restore "IBR.MqttListener/IBR.MqttListener.csproj"
COPY . .
WORKDIR "/src/IBR.MqttListener"
RUN dotnet build "IBR.MqttListener.csproj" -c Release -o /app/build

FROM build AS publish
RUN dotnet publish "IBR.MqttListener.csproj" -c Release -o /app/publish

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "IBR.MqttListener.dll"]