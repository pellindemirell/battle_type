using Microsoft.EntityFrameworkCore;
using TypingApp.Api.Models;

namespace TypingApp.Api.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options)
        : base(options)
    {
    }

    public DbSet<Lesson> Lessons => Set<Lesson>();

    public DbSet<LessonResult> LessonResults => Set<LessonResult>();
}