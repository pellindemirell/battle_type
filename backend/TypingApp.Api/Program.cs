using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.HttpOverrides;
using TypingApp.Api.Data;
using TypingApp.Api.Hubs;
using TypingApp.Api.Services;

var builder = WebApplication.CreateBuilder(args);
var corsAllowedOrigins = builder.Configuration["CORS_ALLOWED_ORIGINS"]?
    .Split(
        ',',
        StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
    ?? [];

builder.Services.AddControllers();

builder.Services.AddEndpointsApiExplorer();

builder.Services.AddSwaggerGen();

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite(
        builder.Configuration.GetConnectionString("DefaultConnection")
    ));

builder.Services.AddSignalR();
builder.Services.AddSingleton<RaceRoomStore>();
builder.Services.AddSingleton<WordSelector>();
builder.Services.AddSingleton<TimeProvider>(TimeProvider.System);
builder.Services.AddHostedService<InactiveRoomCleanupService>();

builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders =
        ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
});

builder.Services.AddCors(options =>
{
    options.AddPolicy("AngularPolicy", policy =>
    {
        policy
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();

        if (builder.Environment.IsDevelopment())
            policy.SetIsOriginAllowed(_ => true);
        else if (corsAllowedOrigins.Length > 0)
            policy.WithOrigins(corsAllowedOrigins);
    });
});

var app = builder.Build();

app.UseForwardedHeaders();

if (app.Environment.IsDevelopment() || corsAllowedOrigins.Length > 0)
    app.UseCors("AngularPolicy");

app.UseDefaultFiles();
app.UseStaticFiles();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseAuthorization();

app.MapControllers();

app.MapHub<TypingHub>("/raceHub");
app.MapFallbackToFile("index.html");

using (var scope = app.Services.CreateScope())
{
    var context = scope.ServiceProvider
        .GetRequiredService<AppDbContext>();

    await context.Database.EnsureCreatedAsync();

    await LessonSeed.SeedAsync(context);
}

app.Run();